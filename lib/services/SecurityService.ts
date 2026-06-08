import { supabaseService, app_auth, core } from '@/lib/supabase';
import { GlobalSettings, SETTING_KEYS } from '@/lib/settings';

/**
 * Advanced Security Service
 * Handles IP Restrictions, Device Trust, and MFA Policies
 */
export class SecurityService {

    /**
     * 1. IP RESTRICTION ENFORCEMENT
     * Checks if the request IP is allowed for the given company/user
     */
    static async validateIPRestriction(params: {
        ipAddress: string;
        companyId?: number;
        roleLevel: number;
    }): Promise<{ allowed: boolean; reason?: string }> {
        const isGlobalEnabled = await GlobalSettings.get(SETTING_KEYS.SECURITY_IP_RESTRICTION, false);

        // If global toggle is OFF, bypass
        if (!isGlobalEnabled) return { allowed: true };

        // Platform Admins (Level 5) usually bypass local IP restrictions 
        // unless specifically mandated. For now, we allow them.
        if (params.roleLevel >= 5) return { allowed: true };

        if (!params.companyId) return { allowed: true };

        // Check if there are ANY whitelisted IPs for this company
        const { data: whitelist } = await supabaseService
            .schema('core')
            .from('company_security_whitelists')
            .select('ip_address')
            .eq('company_id', params.companyId)
            .eq('is_active', true);

        // If no whitelist defined for company, allow (or change to fail-closed if desired)
        if (!whitelist || whitelist.length === 0) return { allowed: true };

        const isWhitelisted = whitelist.some(w => w.ip_address === params.ipAddress);

        if (!isWhitelisted) {
            return {
                allowed: false,
                reason: `Unauthorized Access: Your IP (${params.ipAddress}) is not whitelisted for this organization.`
            };
        }

        return { allowed: true };
    }

    /**
     * 2. DEVICE TRUST REGISTRY
     * Verifies if the device fingerprint is trusted
     */
    static async validateDeviceTrust(params: {
        userId: number;
        fingerprint?: string;
        userAgent?: string;
    }): Promise<{ trusted: boolean; isNew: boolean }> {
        const isEnabled = await GlobalSettings.get(SETTING_KEYS.SECURITY_DEVICE_FINGERPRINTING, false);
        if (!isEnabled || !params.fingerprint) return { trusted: true, isNew: false };

        // Check if device exists in registry
        const { data: device } = await app_auth.trustedDevices()
            .select('id, is_trusted')
            .eq('user_id', params.userId)
            .eq('device_fingerprint', params.fingerprint)
            .single();

        if (!device) {
            // Register as New Untrusted Device (to be verified later)
            await app_auth.trustedDevices().insert({
                user_id: params.userId,
                device_fingerprint: params.fingerprint,
                device_name: params.userAgent?.split(')')[0].split('(')[1] || 'Unknown Device',
                device_type: params.userAgent?.toLowerCase().includes('mobile') ? 'MOBILE' : 'DESKTOP',
                is_trusted: false // Requires Admin/User approval if policy is strict
            });
            return { trusted: false, isNew: true };
        }

        return { trusted: device.is_trusted, isNew: false };
    }

    /**
     * 3. MANDATORY 2FA POLICY
     * Checks if user must complete 2FA based on role/system settings
     */
    static async is2FAMandatory(params: {
        userId: number;
        roleLevel: number;
        mfaEnabled: boolean;
    }): Promise<boolean> {
        const isGlobalMandatory = await GlobalSettings.get(SETTING_KEYS.SECURITY_2FA_MANDATORY, false);

        // If system says 2FA is mandatory for sensitive roles
        if (isGlobalMandatory && params.roleLevel >= 4) {
            return true;
        }

        // If user explicitly enabled it themselves
        if (params.mfaEnabled) return true;

        return false;
    }
}
