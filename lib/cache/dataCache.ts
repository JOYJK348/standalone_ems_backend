/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * GENERIC DATA CACHE - REDIS + IN-MEMORY FALLBACK
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * PURPOSE: Cache complex API responses to achieve <100ms response times.
 * LAYER 1: Redis (Upstash) - persists across restarts, shared across instances
 * LAYER 2: In-memory Map - fallback when Redis unavailable
 */

import { redisCache } from './redisCache';

interface CacheEntry {
    data: any;
    timestamp: number;
    expiresAt: number;
}

class DataCache {
    private cache: Map<string, CacheEntry> = new Map();
    private readonly DEFAULT_TTL = 60 * 1000; // 1 minute default
    private readonly MAX_ENTRIES = 500;
    private useRedis = !!(process.env.UPSTASH_REDIS_URL && process.env.UPSTASH_REDIS_TOKEN);

    /**
     * Get data from cache (Redis first, then in-memory fallback)
     */
    async get(key: string): Promise<any | null> {
        // Try Redis first
        if (this.useRedis) {
            const redisData = await redisCache.get(key);
            if (redisData !== null) return redisData;
        }

        // Fallback to in-memory
        const entry = this.cache.get(key);
        if (!entry) return null;

        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }

        return entry.data;
    }

    /**
     * Set data in cache (Redis + in-memory)
     */
    async set(key: string, data: any, ttlMs: number = this.DEFAULT_TTL): Promise<void> {
        // Set in Redis
        if (this.useRedis) {
            await redisCache.set(key, data, ttlMs);
        }

        // Set in-memory fallback
        if (this.cache.size >= this.MAX_ENTRIES) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) this.cache.delete(firstKey);
        }

        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            expiresAt: Date.now() + ttlMs
        });
    }

    /**
     * Invalidate specific key or pattern
     */
    async invalidate(pattern: string): Promise<void> {
        // Invalidate in Redis
        if (this.useRedis) {
            await redisCache.invalidate(`*${pattern}*`);
        }

        // Invalidate in-memory
        const keysToDelete: string[] = [];
        for (const key of this.cache.keys()) {
            if (key.includes(pattern)) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(k => this.cache.delete(k));
    }

    /**
     * Clean up expired entries from in-memory cache
     */
    cleanup(): void {
        const now = Date.now();
        const keysToDelete: string[] = [];
        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expiresAt) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(k => this.cache.delete(k));
    }
}

export const dataCache = new DataCache();

// Periodic cleanup
setInterval(() => dataCache.cleanup(), 5 * 60 * 1000);
