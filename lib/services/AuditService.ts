import { supabaseService, app_auth } from '@/lib/supabase';
import { NotificationService } from './NotificationService';
import { headers } from 'next/headers';
import { GlobalSettings, SETTING_KEYS } from '@/lib/settings';
import { getUserRolesDetailed } from '@/lib/menuAccess';

/**
 * Service for Security and Audit Logging
 */
export class AuditService {
    /**
     * Helper to get IP from Request with Deep Detection
     */
    static getIP(req: any): string {
        try {
            // Priority list of headers that commonly contain the client IP
            const potentialHeaders = [
                'x-durkkas-client-ip', // 🚀 Custom Frontend Detected IP (Highest Priority)
                'cf-connecting-ip',    // Cloudflare
                'x-forwarded-for',      // Common proxy
                'x-real-ip',            // Nginx
                'x-client-ip',
                'true-client-ip',
                'x-cluster-client-ip'
            ];

            let ip: string | null = null;

            // 1. Try to extract from request headers
            for (const headerName of potentialHeaders) {
                const headerValue = req.headers && typeof req.headers.get === 'function'
                    ? req.headers.get(headerName)
                    : (req.headers ? req.headers[headerName] : null);

                if (headerValue) {
                    // X-Forwarded-For can be a comma-separated list; take the first one
                    const firstIp = String(headerValue).split(',')[0].trim();
                    if (firstIp && firstIp !== '127.0.0.1' && firstIp !== '::1') {
                        ip = firstIp;
                        break;
                    }
                    if (!ip) ip = firstIp; // Store it as fallback even if local
                }
            }

            // 2. Fallback to Next.js Request.ip
            if (!ip || ip === '127.0.0.1' || ip === '::1') {
                if (req.ip) ip = req.ip;
            }

            // Clean up: Process IPv6 loopback variants
            if (!ip || ip === '::1' || ip.includes('ffff:127.0.0.1')) {
                ip = '127.0.0.1';
            }

            // Remove ports from IPv4 (e.g., 127.0.0.1:3000)
            if (ip && ip.includes(':') && !ip.includes('::')) {
                ip = ip.split(':')[0];
            }

            return ip || '127.0.0.1';
        } catch (e) {
            return '127.0.0.1';
        }
    }

    /**
     * Primary Audit Logger with Identity Self-Correction
     */
    static async logAction(params: {
        userId?: number;
        userEmail?: string;
        action: string;
        tableName: string;
        schemaName?: string;
        recordId?: string;
        oldData?: any;
        newData?: any;
        ipAddress?: string;
        userAgent?: string;
        companyId?: number;
    }) {
        try {
            let userEmail = params.userEmail;
            let ipAddress = params.ipAddress;
            let userAgent = params.userAgent;

            // 🛡️ Verbosity Check (Production Orchestration)
            // If action is a 'READ' operation and verbosity is OFF, we bypass logging
            const isHighVerbosity = await GlobalSettings.get(SETTING_KEYS.SECURITY_AUDIT_VERBOSITY, false);
            const isReadAction = ['READ', 'VIEW', 'FETCH', 'LIST', 'SYNC_SETTINGS'].includes(params.action.toUpperCase());

            if (isReadAction && !isHighVerbosity) {
                return null; // Bypass logging for read operations unless high-verbosity is active
            }

            // Deep Context-Awareness: Try to harvest IP/UA/Email from request context if missing
            try {
                const headerStore = headers();
                if (!ipAddress) {
                    ipAddress = headerStore.get('x-durkkas-client-ip') ||
                        headerStore.get('cf-connecting-ip') ||
                        headerStore.get('x-forwarded-for')?.split(',')[0].trim() ||
                        headerStore.get('x-real-ip') ||
                        '127.0.0.1';
                }
                if (!userAgent) {
                    userAgent = headerStore.get('user-agent') || 'unknown';
                }
                if (!userEmail) {
                    userEmail = headerStore.get('x-user-email') || undefined;
                }
            } catch (hErr) {
                // Headers not available (outside request context)
                if (!ipAddress) ipAddress = '127.0.0.1';
                if (!userAgent) userAgent = 'system-internal';
            }

            // Identity Self-Correction: If email is still missing but ID exists, resolve it
            if (!userEmail && params.userId) {
                const { data } = await app_auth.users()
                    .select('email')
                    .eq('id', params.userId)
                    .single();
                if (data?.email) userEmail = data.email;
            }

            const rawId = params.recordId ? parseInt(params.recordId.toString()) : null;
            const validResourceId = (rawId !== null && !isNaN(rawId)) ? rawId : null;
            const cleanIp = (ipAddress && ipAddress.trim() !== '') ? ipAddress.trim() : null;

            const auditLogData = {
                user_id: params.userId || null,
                user_email: userEmail || null,
                action: params.action,
                resource_type: params.tableName,
                table_name: params.tableName,
                schema_name: params.schemaName || 'core',
                resource_id: validResourceId,
                old_values: params.oldData,
                new_values: params.newData,
                ip_address: cleanIp,
                user_agent: userAgent || 'unknown',
                company_id: params.companyId || null
            };

            const { data, error } = await app_auth.auditLogs().insert(auditLogData).select();

            if (error) {
                console.error('❌ [AUDIT SERVICE] DB Insert Error:', error.message, error.details);
                return null;
            }

            console.log(`✅ [AUDIT SERVICE] Event Registered: ${params.action} by ${userEmail || 'System'}`);

            // Trigger Notifications
            await this.triggerNotifications({ ...params, userEmail });

            return data;
        } catch (err: any) {
            console.error('❌ [AUDIT SERVICE] Exception:', err.message);
            return null;
        }
    }

    private static async triggerNotifications(params: any) {
        try {
            const { action, tableName, companyId, branchId, userEmail, userId, newData, oldData } = params;

            // 1. Get user's full context (Role + Identity)
            let actorName = userEmail || 'System';
            let roleContext = '';

            if (userId) {
                const { data: userData } = await app_auth.users()
                    .select('first_name, last_name, display_name')
                    .eq('id', userId)
                    .single();

                const roles = await getUserRolesDetailed(userId);
                const primaryRole = roles[0];

                if (userData) {
                    actorName = userData.display_name ||
                        `${userData.first_name || ''} ${userData.last_name || ''}`.trim() ||
                        userEmail || 'User';
                }

                if (primaryRole) {
                    const orgContext = primaryRole.level === 5
                        ? 'Platform'
                        : (primaryRole.branch_name || primaryRole.company_name || 'Durkkas');
                    roleContext = ` (${primaryRole.display_name || primaryRole.name} – ${orgContext})`;
                }
            }

            const fullActor = `${actorName}${roleContext}`;

            // 2. Resolve Company/Branch Names
            let sourceCompanyName = params.companyName;
            if (!sourceCompanyName && companyId) {
                const { data } = await supabaseService.schema('core').from('companies').select('name').eq('id', companyId).single();
                sourceCompanyName = data?.name;
            }

            let sourceBranchName = params.branchName;
            if (!sourceBranchName && branchId) {
                const { data } = await supabaseService.schema('core').from('branches').select('name').eq('id', branchId).single();
                sourceBranchName = data?.name;
            }

            // 3. Format resource name
            const resourceLabel = tableName.replace(/_/g, ' ').toUpperCase();
            const recordName = newData?.name ||
                newData?.first_name ||
                newData?.display_name ||
                newData?.title ||
                newData?.id ||
                'record';

            // 4. Create action-specific messages (Professional Production Format)
            let title = '';
            let message = '';
            let priority: 'HIGH' | 'NORMAL' = 'NORMAL';
            let category: string = 'INFO';

            const locationContext = sourceBranchName
                ? ` in branch "${sourceBranchName}"`
                : (sourceCompanyName ? ` in company "${sourceCompanyName}"` : '');

            switch (action.toUpperCase()) {
                case 'CREATE':
                    title = `${resourceLabel} created`;
                    message = `${fullActor}${locationContext} created a new ${resourceLabel.toLowerCase()}: "${recordName}"`;
                    category = 'SUCCESS';
                    break;

                case 'UPDATE':
                    title = `${resourceLabel} updated`;
                    message = `${fullActor}${locationContext} updated ${resourceLabel.toLowerCase()}: "${recordName}"`;
                    break;

                case 'DELETE':
                    title = `${resourceLabel} deleted`;
                    message = `${fullActor}${locationContext} removed ${resourceLabel.toLowerCase()}: "${recordName}"`;
                    priority = 'HIGH';
                    category = 'WARNING';
                    break;

                case 'LOGIN':
                    title = 'User Login';
                    message = `${fullActor} logged into the system`;
                    break;

                case 'LOGOUT':
                    title = 'User Logout';
                    message = `${fullActor} logged out`;
                    break;

                case 'WARNING':
                case 'FAILURE':
                    title = `Security Alert: ${resourceLabel}`;
                    message = `${fullActor} encountered a ${action.toLowerCase()} on ${resourceLabel.toLowerCase()}: "${recordName}"`;
                    priority = 'HIGH';
                    category = 'ALERT';
                    break;

                default:
                    title = `Event: ${action}`;
                    message = `${fullActor}${locationContext} performed "${action}" on ${resourceLabel.toLowerCase()}`;
            }

            // 5. Intelligent Routing (Role-Based Scoping)
            const notificationParams = {
                type: category as any,
                priority,
                title,
                message,
                metadata: {
                    action,
                    resource: tableName,
                    performed_by: userEmail,
                    actor_name: actorName,
                    role_context: roleContext,
                    source_company_name: sourceCompanyName,
                    source_branch_name: sourceBranchName,
                    record_name: recordName,
                    category
                }
            };

            // 📢 5a. Always Broadcast to Platform Admins
            await NotificationService.notifyPlatformAdmins({
                ...notificationParams,
                sourceCompanyId: companyId,
                sourceCompanyName
            });

            // 🏢 5b. Notify Company Admins (Scoped)
            if (companyId && action !== 'LOGIN' && action !== 'LOGOUT') {
                await NotificationService.notifyCompanyAdmins(companyId, notificationParams);
            }

            // 📍 5c. Notify Branch Admins (Scoped)
            if (companyId && branchId && action !== 'LOGIN' && action !== 'LOGOUT') {
                await NotificationService.notifyBranchAdmins(companyId, branchId, notificationParams);
            }

        } catch (err) {
            console.error('❌ [AUDIT SERVICE] Notification Trigger Error:', err);
        }
    }

    static async logLogin(params: {
        userId: number;
        email?: string;
        ipAddress?: string;
        userAgent?: string;
        status: 'SUCCESS' | 'FAILED';
        failureReason?: string;
    }) {
        try {
            const { error } = await app_auth.loginHistory().insert({
                user_id: params.userId,
                email: params.email,
                logged_in_at: new Date().toISOString(),
                ip_address: params.ipAddress,
                user_agent: params.userAgent,
                login_status: params.status,
                failure_reason: params.failureReason
            });

            if (error) console.error('❌ [AUDIT SERVICE] Login History Error:', error.message);

            if (params.status === 'FAILED') {
                await NotificationService.notifyPlatformAdmins({
                    type: 'WARNING',
                    title: 'Security Alert: Failed Login',
                    message: `Failed login attempt for ${params.email} from IP ${params.ipAddress || 'Unknown'}`,
                    priority: 'HIGH'
                });
            }
        } catch (err) {
            console.error('❌ [AUDIT SERVICE] Login Logger Exception:', err);
        }
    }
}
