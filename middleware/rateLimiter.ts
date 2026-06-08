/**
 * Rate Limiting Middleware
 * 
 * Prevents API abuse by limiting requests per IP address
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { checkRateLimit } from '@/lib/redis';
import { logger } from '@/lib/logger';

const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100');
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'); // 15 minutes

/**
 * Rate limiting middleware
 */
export async function rateLimit(
    req: NextApiRequest,
    res: NextApiResponse
): Promise<boolean> {
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
    const endpoint = req.url || 'unknown';

    try {
        const isLimited = await checkRateLimit(ip, endpoint, MAX_REQUESTS, WINDOW_MS);

        if (isLimited) {
            logger.warn('Rate limit exceeded', { ip, endpoint });

            res.status(429).json({
                success: false,
                error: {
                    code: 'RATE_LIMIT_EXCEEDED',
                    message: 'Too many requests. Please try again later.',
                },
                timestamp: new Date().toISOString(),
            });

            return true;
        }

        return false;
    } catch (error) {
        logger.error('Rate limit check failed', error, { ip, endpoint });
        // Don't block request if rate limit check fails
        return false;
    }
}

/**
 * Rate limiting middleware wrapper
 */
export function withRateLimit(
    handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>
) {
    return async (req: NextApiRequest, res: NextApiResponse) => {
        const limited = await rateLimit(req, res);
        if (limited) return;

        await handler(req, res);
    };
}
