import { CompanyFeatureAccess } from '@/middleware/featureAccess';

interface CacheEntry {
    data: CompanyFeatureAccess;
    timestamp: number;
    expiresAt: number;
}

class FeatureAccessCache {
    private cache: Map<string, CacheEntry> = new Map();
    private readonly TTL = 5 * 60 * 1000;
    private readonly MAX_ENTRIES = 500;

    private getCacheKey(userId: number): string {
        return `fa:${userId}`;
    }

    get(userId: number): CompanyFeatureAccess | null {
        const key = this.getCacheKey(userId);
        const entry = this.cache.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }
        return entry.data;
    }

    set(userId: number, data: CompanyFeatureAccess): void {
        if (this.cache.size >= this.MAX_ENTRIES) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) this.cache.delete(firstKey);
        }
        const key = this.getCacheKey(userId);
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            expiresAt: Date.now() + this.TTL
        });
    }

    invalidate(userId: number): void {
        this.cache.delete(this.getCacheKey(userId));
    }

    clear(): void {
        this.cache.clear();
    }

    cleanup(): void {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expiresAt) this.cache.delete(key);
        }
    }
}

export const featureAccessCache = new FeatureAccessCache();

setInterval(() => {
    featureAccessCache.cleanup();
}, 2 * 60 * 1000);
