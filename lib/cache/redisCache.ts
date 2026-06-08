import { Redis } from '@upstash/redis'

let redis: Redis | null = null

function getClient(): Redis | null {
    if (redis) return redis
    const url = process.env.UPSTASH_REDIS_URL
    const token = process.env.UPSTASH_REDIS_TOKEN
    if (url && token) {
        redis = new Redis({ url, token })
    }
    return redis
}

export class RedisCache {
    async get(key: string): Promise<any | null> {
        try {
            const client = getClient()
            if (!client) return null
            return await client.get(key)
        } catch {
            return null
        }
    }

    async set(key: string, data: any, ttlMs: number = 60000): Promise<void> {
        try {
            const client = getClient()
            if (!client) return
            await client.set(key, data, { ex: Math.ceil(ttlMs / 1000) })
        } catch {
            // silent fail
        }
    }

    async invalidate(pattern: string): Promise<void> {
        try {
            const client = getClient()
            if (!client) return
            const keys = await client.keys(pattern)
            if (keys.length > 0) {
                await client.del(...keys)
            }
        } catch {
            // silent fail
        }
    }

    async flush(): Promise<void> {
        try {
            const client = getClient()
            if (!client) return
            await client.flushall()
        } catch {
            // silent fail
        }
    }
}

export const redisCache = new RedisCache()
