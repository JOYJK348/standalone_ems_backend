/**
 * Authentication Middleware
 * 
 * This middleware verifies JWT tokens and attaches user information to the request.
 * MUST be used on all protected API routes.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyToken, extractTokenFromHeader } from '@/lib/jwt';
import { getCachedUserSession } from '@/lib/redis';

/**
 * Extended Next.js API Request with user information
 */
export interface AuthenticatedRequest extends NextApiRequest {
    user: {
        userId: number;
        email: string;
        roles: string[];
    };
}

/**
 * Authentication error class
 */
export class AuthenticationError extends Error {
    statusCode: number;

    constructor(message: string = 'Authentication failed', statusCode: number = 401) {
        super(message);
        this.name = 'AuthenticationError';
        this.statusCode = statusCode;
    }
}

/**
 * Authenticate user from JWT token
 * 
 * @param req - Next.js API request
 * @param res - Next.js API response
 * @returns User information
 * @throws AuthenticationError if authentication fails
 */
export async function authenticate(
    req: NextApiRequest,
    res: NextApiResponse
): Promise<{ userId: number; email: string; roles: string[] }> {
    // Extract token from Authorization header
    const token = extractTokenFromHeader(req.headers.authorization);

    if (!token) {
        throw new AuthenticationError('No authentication token provided');
    }

    // Verify token
    const payload = verifyToken(token);

    if (!payload) {
        throw new AuthenticationError('Invalid or expired token');
    }

    // Check if it's an access token
    if (payload.type !== 'access') {
        throw new AuthenticationError('Invalid token type');
    }

    // Check if session exists in cache
    const session = await getCachedUserSession(payload.userId);

    if (!session) {
        throw new AuthenticationError('Session expired or invalid');
    }

    // Return user information
    return {
        userId: payload.userId,
        email: payload.email,
        roles: payload.roles,
    };
}

/**
 * Authentication middleware wrapper
 * 
 * Usage:
 * ```typescript
 * export default withAuth(async (req: AuthenticatedRequest, res) => {
 *   const user = req.user;
 *   // Your API logic here
 * });
 * ```
 */
export function withAuth(
    handler: (req: AuthenticatedRequest, res: NextApiResponse) => Promise<void>
) {
    return async (req: NextApiRequest, res: NextApiResponse) => {
        try {
            // Authenticate user
            const user = await authenticate(req, res);

            // Attach user to request
            (req as AuthenticatedRequest).user = user;

            // Call the actual handler
            await handler(req as AuthenticatedRequest, res);
        } catch (error) {
            if (error instanceof AuthenticationError) {
                return res.status(error.statusCode).json({
                    success: false,
                    error: {
                        code: 'AUTHENTICATION_ERROR',
                        message: error.message,
                    },
                    timestamp: new Date().toISOString(),
                });
            }

            // Unexpected error
            console.error('Authentication middleware error:', error);
            return res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'An unexpected error occurred',
                },
                timestamp: new Date().toISOString(),
            });
        }
    };
}

/**
 * Optional authentication middleware
 * Attaches user if token is valid, but doesn't fail if token is missing
 */
export function withOptionalAuth(
    handler: (req: AuthenticatedRequest, res: NextApiResponse) => Promise<void>
) {
    return async (req: NextApiRequest, res: NextApiResponse) => {
        try {
            const user = await authenticate(req, res);
            (req as AuthenticatedRequest).user = user;
        } catch (error) {
            // Ignore authentication errors for optional auth
            (req as AuthenticatedRequest).user = null as any;
        }

        await handler(req as AuthenticatedRequest, res);
    };
}
