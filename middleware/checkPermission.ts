/**
 * Permission Checking Middleware
 * 
 * This middleware checks if the authenticated user has the required permissions.
 * MUST be used after authentication middleware.
 */

import type { NextApiResponse } from 'next';
import type { AuthenticatedRequest } from './authenticate';
import { requirePermission, requireAnyPermission, PermissionError } from '@/lib/menuAccess';

/**
 * Permission middleware wrapper
 * 
 * Usage:
 * ```typescript
 * export default withAuth(
 *   withPermission('hrms.employees.view', async (req, res) => {
 *     // Your API logic here
 *   })
 * );
 * ```
 */
export function withPermission(
    requiredPermission: string,
    handler: (req: AuthenticatedRequest, res: NextApiResponse) => Promise<void>
) {
    return async (req: AuthenticatedRequest, res: NextApiResponse) => {
        try {
            // Check if user is authenticated
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    error: {
                        code: 'AUTHENTICATION_REQUIRED',
                        message: 'Authentication required',
                    },
                    timestamp: new Date().toISOString(),
                });
            }

            // Check permission
            await requirePermission(req.user.userId, requiredPermission);

            // Call the actual handler
            await handler(req, res);
        } catch (error) {
            if (error instanceof PermissionError) {
                return res.status(403).json({
                    success: false,
                    error: {
                        code: 'PERMISSION_DENIED',
                        message: error.message,
                    },
                    timestamp: new Date().toISOString(),
                });
            }

            // Unexpected error
            console.error('Permission middleware error:', error);
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
 * Check if user has any of the required permissions
 * 
 * Usage:
 * ```typescript
 * export default withAuth(
 *   withAnyPermission(['hrms.employees.view', 'hrms.employees.edit'], async (req, res) => {
 *     // Your API logic here
 *   })
 * );
 * ```
 */
export function withAnyPermission(
    requiredPermissions: string[],
    handler: (req: AuthenticatedRequest, res: NextApiResponse) => Promise<void>
) {
    return async (req: AuthenticatedRequest, res: NextApiResponse) => {
        try {
            // Check if user is authenticated
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    error: {
                        code: 'AUTHENTICATION_REQUIRED',
                        message: 'Authentication required',
                    },
                    timestamp: new Date().toISOString(),
                });
            }

            // Check permissions
            await requireAnyPermission(req.user.userId, requiredPermissions);

            // Call the actual handler
            await handler(req, res);
        } catch (error) {
            if (error instanceof PermissionError) {
                return res.status(403).json({
                    success: false,
                    error: {
                        code: 'PERMISSION_DENIED',
                        message: error.message,
                    },
                    timestamp: new Date().toISOString(),
                });
            }

            // Unexpected error
            console.error('Permission middleware error:', error);
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
 * Combined authentication + permission middleware
 * 
 * Usage:
 * ```typescript
 * export default withAuthAndPermission('hrms.employees.view', async (req, res) => {
 *   // Your API logic here
 * });
 * ```
 */
export function withAuthAndPermission(
    requiredPermission: string,
    handler: (req: AuthenticatedRequest, res: NextApiResponse) => Promise<void>
) {
    const { withAuth } = require('./authenticate');
    return withAuth(withPermission(requiredPermission, handler));
}
