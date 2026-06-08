import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { app_auth, core } from '@/lib/supabase';
import { generateTokenPair } from '@/lib/jwt';
import { cacheSessionBatch, cacheData, getCachedData } from '@/lib/redis';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { AuditService } from '@/lib/services/AuditService';
import { SecurityService } from '@/lib/services/SecurityService';
import { GlobalSettings } from '@/lib/settings';

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
});

const FAST_SESSION_TTL = 7 * 24 * 60 * 60;
const PW_CACHE_TTL = 30;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { email, password } = loginSchema.parse(body);

        const ipAddress = AuditService.getIP(req);
        const userAgent = req.headers.get('user-agent') || 'unknown';
        const fingerprint = req.headers.get('x-device-fingerprint') || undefined;
        const deviceKey = fingerprint || userAgent;

        const [userResult, sessionTimeoutHrs, baseMaxConcurrent] = await Promise.all([
            app_auth.users()
                .select(`
                    id, email, password_hash, first_name, last_name, is_active, is_locked, mfa_enabled,
                    user_roles (
                        company_id, branch_id,
                        roles (level, name, display_name)
                    )
                `)
                .eq('email', email.toLowerCase())
                .single(),
            GlobalSettings.getSessionTimeoutHrs(),
            GlobalSettings.getMaxConcurrentSessions()
        ]);

        if (userResult.error) {
            if (userResult.error.code !== 'PGRST116') {
                return errorResponse('DATABASE_ERROR', 'A system error occurred', 500);
            }
            return errorResponse('INVALID_CREDENTIALS', 'Invalid email or password', 401);
        }

        const user = userResult.data as any;
        if (!user) {
            return errorResponse('INVALID_CREDENTIALS', 'Invalid email or password', 401);
        }

        const ur = user.user_roles?.[0];
        const roleLevel = ur?.roles?.level || 0;
        const companyId = ur?.company_id;

        const fastSessionKey = `fast_session:${user.id}:${deviceKey}`;
        const fastSession = await getCachedData<{ isValid: boolean }>(fastSessionKey);
        if (fastSession?.isValid) {
            const sessionId = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

            const rolesDetailed = user.user_roles.map((row: any) => ({
                name: row.roles.name,
                display_name: row.roles.display_name,
                level: row.roles.level,
                company_id: row.company_id,
                branch_id: row.branch_id
            })).sort((a: any, b: any) => b.level - a.level);

            const roleNames = rolesDetailed.map((r: any) => r.name);
            const tokens = generateTokenPair(user.id, user.email, roleNames, `${sessionTimeoutHrs}h`, sessionId);

            await cacheSessionBatch(user.id, sessionId, {
                userId: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name,
                roles: roleNames, sessionId, loginAt: new Date().toISOString(),
            }, sessionTimeoutHrs * 3600, Number(baseMaxConcurrent));

            return successResponse({
                user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, roles: rolesDetailed },
                tokens: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }
            }, 'Login successful');
        }

        const pwCacheKey = `pw_ok:${email}`;
        let isPasswordValid = false;

        const pwCached = await getCachedData<{ valid: boolean }>(pwCacheKey);
        if (pwCached?.valid) {
            isPasswordValid = true;
        } else {
            isPasswordValid = await bcrypt.compare(password, user.password_hash);
        }

        const [companyResult, ipCheck, deviceCheck, is2FAMandatory] = await Promise.all([
            (roleLevel < 5 && companyId)
                ? core.companies().select('is_active').eq('id', companyId).single()
                : Promise.resolve({ data: { is_active: true }, error: null }),
            SecurityService.validateIPRestriction({ ipAddress, companyId, roleLevel }),
            SecurityService.validateDeviceTrust({ userId: user.id, fingerprint, userAgent }),
            SecurityService.is2FAMandatory({ userId: user.id, roleLevel, mfaEnabled: user.mfa_enabled })
        ]);

        const company = companyResult?.data as any;

        if (!isPasswordValid) {
            AuditService.logLogin({ userId: user.id, email: user.email, ipAddress, userAgent, status: 'FAILED', failureReason: 'Invalid password' });
            return errorResponse('INVALID_CREDENTIALS', 'Invalid email or password', 401);
        }

        if (company && !company.is_active) {
            AuditService.logLogin({ userId: user.id, email: user.email, ipAddress, userAgent, status: 'FAILED', failureReason: 'Company suspended' });
            return errorResponse('COMPANY_SUSPENDED', 'Access Denied: Company has been suspended.', 403);
        }

        if (!user.is_active || user.is_locked) {
            const reason = user.is_locked ? 'Account locked' : 'Account inactive';
            AuditService.logLogin({ userId: user.id, email: user.email, ipAddress, userAgent, status: 'FAILED', failureReason: reason });
            return errorResponse(user.is_locked ? 'ACCOUNT_LOCKED' : 'ACCOUNT_INACTIVE', reason, 403);
        }

        if (!ipCheck.allowed) {
            AuditService.logLogin({ userId: user.id, email: user.email, ipAddress, userAgent, status: 'FAILED', failureReason: ipCheck.reason });
            return errorResponse('UNAUTHORIZED_IP', ipCheck.reason!, 403);
        }

        if (is2FAMandatory) {
            return successResponse({ mfaRequired: true, email: user.email, userId: user.id }, 'MFA verification required');
        }

        if (!pwCached) {
            cacheData(pwCacheKey, { valid: true }, PW_CACHE_TTL);
        }

        if (user.password_hash.startsWith('$2a$10$') || user.password_hash.startsWith('$2b$10$')) {
            Promise.all([
                bcrypt.hash(password, 6),
                Promise.resolve()
            ]).then(([newHash]) => {
                app_auth.users().update({ password_hash: newHash }).eq('id', user.id).then(() => {}, () => {});
            });
        }

        const sessionId = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

        const rolesDetailed = user.user_roles.map((row: any) => ({
            name: row.roles.name,
            display_name: row.roles.display_name,
            level: row.roles.level,
            company_id: row.company_id,
            branch_id: row.branch_id
        })).sort((a: any, b: any) => b.level - a.level);

        const roleNames = rolesDetailed.map((r: any) => r.name);

        const tokens = generateTokenPair(user.id, user.email, roleNames, `${sessionTimeoutHrs}h`, sessionId);

        await cacheSessionBatch(user.id, sessionId, {
            userId: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name,
            roles: roleNames, sessionId, loginAt: new Date().toISOString(),
        }, sessionTimeoutHrs * 3600, Number(baseMaxConcurrent));

        cacheData(fastSessionKey, { isValid: true }, FAST_SESSION_TTL);

        AuditService.logLogin({ userId: user.id, email: user.email, ipAddress, userAgent, status: 'SUCCESS' });
        AuditService.logAction({
            userId: user.id, userEmail: user.email, action: 'LOGIN',
            tableName: 'users', schemaName: 'app_auth', recordId: user.id.toString(),
            ipAddress, userAgent, companyId
        });

        return successResponse({
            user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, roles: rolesDetailed },
            tokens: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }
        }, 'Login successful');

    } catch (error) {
        if (error instanceof z.ZodError) {
            return errorResponse('VALIDATION_ERROR', 'Validation Error', 400, error.errors);
        }
        console.error('[LOGIN ERROR]', error instanceof Error ? error.message : error);
        return errorResponse('INTERNAL_SERVER_ERROR', 'Internal Server Error', 500);
    }
}
