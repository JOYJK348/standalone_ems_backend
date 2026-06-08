import { core as supabaseCore } from './supabase';
import { SCHEMAS } from '@/config/constants';

/**
 * Global Settings Utility
 * Fetches and caches system settings from core.global_settings
 */

export const SETTING_KEYS = {
    AUTH_MIN_PASSWORD_LENGTH: 'auth.min_password_length',
    AUTH_PASSWORD_EXPIRY_DAYS: 'auth.password_expiry_days',
    AUTH_SESSION_TIMEOUT_HRS: 'auth.session_timeout_hrs',
    AUTH_MAX_CONCURRENT_SESSIONS: 'auth.max_concurrent_sessions',
    LIMITS_MAX_BRANCHES_BASE: 'limits.max_branches_base',
    LIMITS_MAX_STAFF_PER_BRANCH: 'limits.max_staff_per_branch',
    SECURITY_IP_RESTRICTION: 'security.ip_restriction',
    SECURITY_2FA_MANDATORY: 'security.2fa_mandatory',
    SECURITY_AUDIT_VERBOSITY: 'security.audit_verbosity',
    SECURITY_DEVICE_FINGERPRINTING: 'security.device_fingerprinting',
};

export class GlobalSettings {
    private static cache: Map<string, any> = new Map();
    private static lastFetch: number = 0;
    private static CACHE_TTL = 60000; // 1 minute

    static async get(key: string, defaultValue: any = null): Promise<any> {
        // Check cache first
        if (Date.now() - this.lastFetch <= this.CACHE_TTL) {
            const value = this.cache.get(key);
            if (value !== undefined) return GlobalSettings.parseValue(value);
            return defaultValue;
        }

        // Single-key fetch to avoid loading ALL settings
        try {
            const { data, error } = await supabaseCore
                .globalSettings()
                .select('value')
                .eq('key', key)
                .single();

            if (error || !data) return defaultValue;
            this.cache.set(key, data.value);
            this.lastFetch = Date.now();
            return GlobalSettings.parseValue(data.value);
        } catch {
            return defaultValue;
        }
    }

    private static parseValue(value: any): any {
        if (value === 'true') return true;
        if (value === 'false') return false;
        if (!isNaN(Number(value)) && typeof value === 'string' && value.trim() !== '') {
            return Number(value);
        }
        return value;
    }

    static async refresh(): Promise<void> {
        try {
            const { data, error } = await supabaseCore
                .globalSettings()
                .select('key, value');

            if (error) {
                return;
            }

            this.cache.clear();
            (data || []).forEach(s => {
                this.cache.set(s.key, s.value);
            });
            this.lastFetch = Date.now();
        } catch {
            // Silently fail
        }
    }

    /**
     * Auth Specific Helpers
     */
    static async getMinPasswordLength(): Promise<number> {
        return await this.get(SETTING_KEYS.AUTH_MIN_PASSWORD_LENGTH, 8);
    }

    static async getSessionTimeoutHrs(): Promise<number> {
        return await this.get(SETTING_KEYS.AUTH_SESSION_TIMEOUT_HRS, 12);
    }

    static async getMaxConcurrentSessions(): Promise<number> {
        return await this.get(SETTING_KEYS.AUTH_MAX_CONCURRENT_SESSIONS, 3);
    }

    /**
     * Freshly fetches the concurrency limit (bypasses cache)
     */
    static async getFreshMaxConcurrentSessions(): Promise<number> {
        try {
            const { data, error } = await supabaseCore
                .globalSettings()
                .select('value')
                .eq('key', SETTING_KEYS.AUTH_MAX_CONCURRENT_SESSIONS)
                .single();

            if (error || !data) return 3;

            const val = data.value;
            if (!isNaN(Number(val))) return Number(val);
            return 3;
        } catch (e) {
            return 3;
        }
    }
}
