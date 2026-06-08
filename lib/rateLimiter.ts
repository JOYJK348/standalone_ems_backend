/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * ADVANCED RATE LIMITING MIDDLEWARE
 * Enterprise-Grade | Redis-Backed | Sliding Window Algorithm
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import { NextRequest } from 'next/server';
import { redis } from './redis';
import { logger } from './logger';
import { RateLimitError } from './errorHandler';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RATE LIMIT CONFIGURATIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface RateLimitConfig {
    /**
     * Maximum number of requests allowed in the window
     */
    maxRequests: number;

    /**
     * Time window in seconds
     */
    windowSeconds: number;

    /**
     * Unique identifier for this rate limit
     */
    identifier: string;

    /**
     * Custom error message
     */
    message?: string;
}

/**
 * Predefined rate limit configurations for different endpoints
 */
export const RATE_LIMITS = {
    // Authentication endpoints - Very strict
    LOGIN: {
        maxRequests: 5,
        windowSeconds: 300, // 5 minutes
        identifier: 'auth:login',
        message: 'Too many login attempts. Please try again in 5 minutes.',
    },

    REGISTER: {
        maxRequests: 3,
        windowSeconds: 3600, // 1 hour
        identifier: 'auth:register',
        message: 'Too many registration attempts. Please try again later.',
    },

    PASSWORD_RESET: {
        maxRequests: 3,
        windowSeconds: 3600, // 1 hour
        identifier: 'auth:password-reset',
        message: 'Too many password reset requests. Please try again later.',
    },

    // API endpoints - Moderate
    API_READ: {
        maxRequests: 100,
        windowSeconds: 60, // 1 minute
        identifier: 'api:read',
        message: 'Rate limit exceeded. Please slow down.',
    },

    API_WRITE: {
        maxRequests: 30,
        windowSeconds: 60, // 1 minute
        identifier: 'api:write',
        message: 'Too many write operations. Please slow down.',
    },

    // General - Lenient
    GENERAL: {
        maxRequests: 200,
        windowSeconds: 60, // 1 minute
        identifier: 'general',
        message: 'Rate limit exceeded.',
    },
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPER FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Extract client identifier from request
 * Uses IP address as primary identifier
 */
function getClientIdentifier(req: NextRequest): string {
    // Try to get real IP from headers (for proxies/load balancers)
    const forwardedFor = req.headers.get('x-forwarded-for');
    const realIp = req.headers.get('x-real-ip');

    if (forwardedFor) {
        // x-forwarded-for can contain multiple IPs, take the first one
        return forwardedFor.split(',')[0].trim();
    }

    if (realIp) {
        return realIp;
    }

    // Fallback to request IP (may not work in all environments)
    return req.ip || 'unknown';
}

/**
 * Generate Redis key for rate limiting
 */
function getRateLimitKey(identifier: string, clientId: string): string {
    return `ratelimit:${identifier}:${clientId}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RATE LIMITING FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Check and enforce rate limit using sliding window algorithm
 * 
 * @param req - Next.js request object
 * @param config - Rate limit configuration
 * @returns Rate limit info
 * @throws RateLimitError if limit exceeded
 */
export async function checkRateLimit(
    req: NextRequest,
    config: RateLimitConfig
): Promise<{
    success: true;
    remaining: number;
    reset: number;
}> {
    const clientId = getClientIdentifier(req);
    const key = getRateLimitKey(config.identifier, clientId);
    const now = Date.now();
    const windowMs = config.windowSeconds * 1000;
    const windowStart = now - windowMs;

    try {
        // Use Redis sorted set for sliding window
        // Score is timestamp, member is unique request ID

        // 1. Remove old entries outside the window
        await redis.zremrangebyscore(key, 0, windowStart);

        // 2. Count current requests in window
        const currentCount = await redis.zcard(key);

        // 3. Check if limit exceeded
        if (currentCount >= config.maxRequests) {
            // Get the oldest request timestamp to calculate reset time
            const oldestRequests = await redis.zrange(key, 0, 0, { withScores: true }) as any[];
            const oldestTimestamp = oldestRequests.length > 0
                ? parseInt(oldestRequests[0].score.toString())
                : now;

            const resetTime = oldestTimestamp + windowMs;
            const resetSeconds = Math.ceil((resetTime - now) / 1000);

            logger.warn('Rate limit exceeded', {
                clientId,
                identifier: config.identifier,
                currentCount,
                maxRequests: config.maxRequests,
                resetSeconds,
            });

            throw new RateLimitError(
                config.message || `Rate limit exceeded. Try again in ${resetSeconds} seconds.`
            );
        }

        // 4. Add current request
        const requestId = `${now}:${Math.random()}`;
        await redis.zadd(key, { score: now, member: requestId });

        // 5. Set expiry on the key (cleanup)
        await redis.expire(key, config.windowSeconds);

        // 6. Calculate remaining requests
        const remaining = config.maxRequests - currentCount - 1;

        logger.debug('Rate limit check passed', {
            clientId,
            identifier: config.identifier,
            currentCount: currentCount + 1,
            remaining,
        });

        return {
            success: true,
            remaining,
            reset: now + windowMs,
        };

    } catch (error) {
        // If it's our RateLimitError, rethrow it
        if (error instanceof RateLimitError) {
            throw error;
        }

        // For Redis errors, log and allow the request (fail open)
        logger.error('Rate limit check failed', {
            error,
            clientId,
            identifier: config.identifier,
        });

        // Fail open - allow request if Redis is down
        return {
            success: true,
            remaining: config.maxRequests,
            reset: now + windowMs,
        };
    }
}

/**
 * Rate limit middleware wrapper
 * 
 * @example
 * export const POST = rateLimit(RATE_LIMITS.LOGIN, async (req) => {
 *   // Your handler code
 * });
 */
export function rateLimit<T extends (...args: any[]) => Promise<any>>(
    config: RateLimitConfig,
    handler: T
): T {
    return (async (...args: any[]) => {
        const req = args[0] as NextRequest;

        // Check rate limit
        await checkRateLimit(req, config);

        // If passed, call the handler
        return await handler(...args);
    }) as T;
}

/**
 * User-based rate limiting (requires authentication)
 * More strict than IP-based limiting
 */
export async function checkUserRateLimit(
    userId: number,
    config: RateLimitConfig
): Promise<void> {
    const key = getRateLimitKey(config.identifier, `user:${userId}`);
    const now = Date.now();
    const windowMs = config.windowSeconds * 1000;
    const windowStart = now - windowMs;

    try {
        await redis.zremrangebyscore(key, 0, windowStart);
        const currentCount = await redis.zcard(key);

        if (currentCount >= config.maxRequests) {
            throw new RateLimitError(
                config.message || 'Rate limit exceeded for your account.'
            );
        }

        const requestId = `${now}:${Math.random()}`;
        await redis.zadd(key, { score: now, member: requestId });
        await redis.expire(key, config.windowSeconds);

    } catch (error) {
        if (error instanceof RateLimitError) {
            throw error;
        }

        logger.error('User rate limit check failed', {
            error,
            userId,
            identifier: config.identifier,
        });
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTILITY FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Reset rate limit for a specific client
 * Useful for testing or manual intervention
 */
export async function resetRateLimit(
    identifier: string,
    clientId: string
): Promise<void> {
    const key = getRateLimitKey(identifier, clientId);
    await redis.del(key);

    logger.info('Rate limit reset', { identifier, clientId });
}

/**
 * Get current rate limit status without incrementing
 */
export async function getRateLimitStatus(
    req: NextRequest,
    config: RateLimitConfig
): Promise<{
    currentCount: number;
    remaining: number;
    resetAt: number;
}> {
    const clientId = getClientIdentifier(req);
    const key = getRateLimitKey(config.identifier, clientId);
    const now = Date.now();
    const windowMs = config.windowSeconds * 1000;
    const windowStart = now - windowMs;

    try {
        await redis.zremrangebyscore(key, 0, windowStart);
        const currentCount = await redis.zcard(key);

        return {
            currentCount,
            remaining: Math.max(0, config.maxRequests - currentCount),
            resetAt: now + windowMs,
        };
    } catch (error) {
        logger.error('Failed to get rate limit status', { error });
        return {
            currentCount: 0,
            remaining: config.maxRequests,
            resetAt: now + windowMs,
        };
    }
}

// End of file
