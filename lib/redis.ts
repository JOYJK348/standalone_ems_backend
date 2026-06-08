/**
 * Redis Client Configuration (Upstash)
 * 
 * EMERGENCY MODE: All Redis operations are gracefully no-op'd
 * so the app continues to function even when Redis is unavailable.
 */

import { Redis } from '@upstash/redis';

// Try to create Redis client, but don't crash if it fails
let redis: Redis | null = null;
let redisAvailable = false;

try {
    if (process.env.REDIS_URL && process.env.REDIS_TOKEN) {
        redis = new Redis({
            url: process.env.REDIS_URL,
            token: process.env.REDIS_TOKEN,
        });
        // Note: We won't know if it truly works until first call
    }
} catch (e) {
    console.warn('⚠️ [REDIS] Failed to initialize Redis client:', (e as Error).message);
}

/**
 * Safe Redis wrapper - returns null/false on failure instead of throwing
 */
async function safeRedisCall<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    if (!redis) return fallback;
    try {
        return await fn();
    } catch (e) {
        console.warn('⚠️ [REDIS] Operation failed (graceful skip):', (e as Error).message);
        return fallback;
    }
}

/**
 * Cache keys prefix for organization
 */
export const CACHE_KEYS = {
    USER_SESSION: (userId: number) => `session:user:${userId}`,
    USER_PERMISSIONS: (userId: number) => `permissions:user:${userId}`,
    USER_ROLES: (userId: number) => `roles:user:${userId}`,
    USER_MENUS: (userId: number) => `menus:user:${userId}`,
    BRANCHES_ALL: 'branches:all',
    DEPARTMENTS_ALL: 'departments:all',
    DESIGNATIONS_ALL: 'designations:all',
    BRANDING_PLATFORM: 'branding:platform',
    BRANDING_COMPANY: (companyId: number | string) => `branding:company:${companyId}`,
    RATE_LIMIT: (ip: string, endpoint: string) => `ratelimit:${ip}:${endpoint}`,
} as const;

/**
 * Cache TTL (Time To Live) in seconds
 */
export const CACHE_TTL = {
    SESSION: 7 * 24 * 60 * 60,
    PERMISSIONS: 60 * 60,
    ROLES: 60 * 60,
    MENUS: 60 * 60,
    MASTER_DATA: 2 * 60 * 60,
    BRANDING: 24 * 60 * 60,
    RATE_LIMIT: 15 * 60,
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SESSION FUNCTIONS (all gracefully no-op)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function cacheUserSession(
    userId: number,
    sessionData: any,
    ttl: number = CACHE_TTL.SESSION
): Promise<void> {
    await safeRedisCall(
        () => redis!.setex(CACHE_KEYS.USER_SESSION(userId), ttl, JSON.stringify(sessionData)),
        undefined as any
    );
}

export async function getCachedUserSession(userId: number): Promise<any | null> {
    return safeRedisCall(async () => {
        const data = await redis!.get(CACHE_KEYS.USER_SESSION(userId));
        if (!data) return null;
        return typeof data === 'string' ? JSON.parse(data) : data;
    }, null);
}

export async function deleteCachedUserSession(userId: number): Promise<void> {
    await safeRedisCall(() => redis!.del(CACHE_KEYS.USER_SESSION(userId)), undefined as any);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PERMISSIONS FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function cacheUserPermissions(
    userId: number,
    permissions: string[],
    ttl: number = CACHE_TTL.PERMISSIONS
): Promise<void> {
    await safeRedisCall(
        () => redis!.setex(CACHE_KEYS.USER_PERMISSIONS(userId), ttl, JSON.stringify(permissions)),
        undefined as any
    );
}

export async function getCachedUserPermissions(userId: number): Promise<string[] | null> {
    return safeRedisCall(async () => {
        const data = await redis!.get(CACHE_KEYS.USER_PERMISSIONS(userId));
        if (!data) return null;
        return (typeof data === 'string' ? JSON.parse(data) : data) as string[];
    }, null);
}

export async function deleteCachedUserPermissions(userId: number): Promise<void> {
    await safeRedisCall(() => redis!.del(CACHE_KEYS.USER_PERMISSIONS(userId)), undefined as any);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GENERIC CACHE FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function cacheData(key: string, data: any, ttl: number): Promise<void> {
    await safeRedisCall(() => redis!.setex(key, ttl, JSON.stringify(data)), undefined as any);
}

export async function getCachedData<T = any>(key: string): Promise<T | null> {
    return safeRedisCall(async () => {
        const data = await redis!.get(key);
        if (!data) return null;
        return (typeof data === 'string' ? JSON.parse(data) : data) as T;
    }, null);
}

export async function deleteCachedData(key: string): Promise<void> {
    await safeRedisCall(() => redis!.del(key), undefined as any);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INVALIDATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function invalidateUserCaches(userId: number): Promise<void> {
    if (!redis) return;
    await safeRedisCall(async () => {
        await Promise.all([
            redis!.del(CACHE_KEYS.USER_SESSION(userId)),
            redis!.del(CACHE_KEYS.USER_PERMISSIONS(userId)),
            redis!.del(CACHE_KEYS.USER_ROLES(userId)),
            redis!.del(CACHE_KEYS.USER_MENUS(userId)),
            redis!.del(`user:${userId}:sessions`)
        ]);
    }, undefined as any);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONCURRENCY ENGINE (graceful no-op)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function enforceMaxConcurrency(userId: number, sessionId: string, maxSessions: number) {
    if (!redis) return;
    await safeRedisCall(async () => {
        const key = `user:${userId}:sessions`;
        await redis!.lpush(key, sessionId);
        await redis!.ltrim(key, 0, maxSessions - 1);
        await redis!.expire(key, CACHE_TTL.SESSION);
    }, undefined as any);
}

export async function validateSessionActive(userId: number, sessionId: string): Promise<boolean> {
    if (!redis) return true;
    return safeRedisCall(async () => {
        if (!sessionId) return true;
        const key = `user:${userId}:sessions`;
        const activeSessions = await redis!.lrange(key, 0, -1);
        return activeSessions.includes(sessionId);
    }, true);
}

export async function cacheSessionBatch(userId: number, sessionId: string, sessionData: any, ttl: number, maxSessions: number): Promise<void> {
    if (!redis) return;
    await safeRedisCall(async () => {
        const pipe = redis!.multi();
        pipe.setex(CACHE_KEYS.USER_SESSION(userId), ttl, JSON.stringify(sessionData));
        const concurrencyKey = `user:${userId}:sessions`;
        pipe.lpush(concurrencyKey, sessionId);
        pipe.ltrim(concurrencyKey, 0, maxSessions - 1);
        pipe.expire(concurrencyKey, ttl);
        await pipe.exec();
    }, undefined as any);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RATE LIMITING (graceful no-op)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function checkRateLimit(
    ip: string,
    endpoint: string,
    maxRequests: number = 100,
    windowMs: number = 15 * 60 * 1000
): Promise<boolean> {
    if (!redis) return false; // Never rate-limit when Redis is down
    return safeRedisCall(async () => {
        const key = CACHE_KEYS.RATE_LIMIT(ip, endpoint);
        const current = await redis!.incr(key);
        if (current === 1) {
            await redis!.expire(key, Math.floor(windowMs / 1000));
        }
        return current > maxRequests;
    }, false); // Default: don't rate-limit
}

// Export redis instance (can be null)
export { redis };
