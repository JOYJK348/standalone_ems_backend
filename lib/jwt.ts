/**
 * JWT Utilities
 * 
 * This file provides JWT token generation, verification, and management.
 * Uses jsonwebtoken library for secure token handling.
 */

import jwt from 'jsonwebtoken';

// Validate environment variables
if (!process.env.JWT_SECRET) {
    throw new Error('Missing JWT_SECRET environment variable');
}
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

/**
 * JWT Payload interface
 */
export interface JWTPayload {
    userId: number;
    email: string;
    roles: string[];
    type: 'access' | 'refresh';
    sid?: string; // Session ID for concurrency tracking
    exp?: number;
}

/**
 * Generate access token
 */
export function generateAccessToken(
    userId: number,
    email: string,
    roles: string[],
    expiresIn?: string | number,
    sid?: string
): string {
    const payload: JWTPayload = {
        userId,
        email,
        roles,
        type: 'access',
        sid
    };

    const options: jwt.SignOptions = {
        expiresIn: (expiresIn || JWT_EXPIRES_IN) as jwt.SignOptions['expiresIn'],
        issuer: 'durkkas-erp',
        audience: 'durkkas-api',
    };

    return jwt.sign(payload, JWT_SECRET!, options);
}

/**
 * Generate refresh token
 */
export function generateRefreshToken(userId: number, email: string, sid?: string): string {
    const payload: Partial<JWTPayload> = {
        userId,
        email,
        type: 'refresh',
        sid
    };

    const options: jwt.SignOptions = {
        expiresIn: JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
        issuer: 'durkkas-erp',
        audience: 'durkkas-api',
    };

    return jwt.sign(payload, JWT_SECRET!, options);
}

/**
 * Verify JWT token (Edge Runtime Compatible)
 * Use this in Middleware
 */
// verifyTokenEdge moved to ./jwt-edge.ts to fix Edge Runtime crashing with jsonwebtoken

/**
 * Verify JWT token
 */
export function verifyToken(token: string): JWTPayload | null {
    try {
        if (!token) return null;

        const decoded = jwt.verify(token, JWT_SECRET!, {
            issuer: 'durkkas-erp',
            audience: 'durkkas-api',
        }) as JWTPayload;

        return decoded;
    } catch (error: any) {
        // If we are in an environment without 'crypto' (like edge), jsonwebtoken will fail
        if (error.message?.includes('crypto')) {
            console.error('CRITICAL: jsonwebtoken.verify() called in Edge Runtime. Use verifyTokenEdge() instead.');
        }

        // Detailed logging for debugging
        console.error('JWT Verification Error:', {
            name: error.name,
            message: error.message,
            tokenSnippet: token?.substring(0, 10) + '...'
        });
        return null;
    }
}

/**
 * Decode JWT token without verification (for debugging)
 * 
 * @param token - JWT token to decode
 * @returns Decoded payload or null if invalid
 */
export function decodeToken(token: string): JWTPayload | null {
    try {
        return jwt.decode(token) as JWTPayload;
    } catch (error) {
        console.error('JWT decode error:', error);
        return null;
    }
}

/**
 * Extract token from Authorization header
 * 
 * @param authHeader - Authorization header value
 * @returns Token string or null if not found
 */
export function extractTokenFromHeader(authHeader?: string): string | null {
    if (!authHeader) {
        return null;
    }

    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return null;
    }

    return parts[1];
}

/**
 * Check if token is expired
 * 
 * @param token - JWT token to check
 * @returns true if expired, false otherwise
 */
export function isTokenExpired(token: string): boolean {
    const decoded = decodeToken(token);

    if (!decoded || !decoded.exp) {
        return true;
    }

    const currentTime = Math.floor(Date.now() / 1000);
    return decoded.exp < currentTime;
}

/**
 * Get token expiration time
 * 
 * @param token - JWT token
 * @returns Expiration timestamp or null if invalid
 */
export function getTokenExpiration(token: string): number | null {
    const decoded = decodeToken(token);
    return decoded?.exp || null;
}

/**
 * Generate token pair (access + refresh)
 * 
 * @param userId - User ID
 * @param email - User email
 * @param roles - User roles
 * @returns Object with access and refresh tokens
 */
export function generateTokenPair(
    userId: number,
    email: string,
    roles: string[],
    expiresIn?: string | number,
    sid?: string
): { accessToken: string; refreshToken: string } {
    return {
        accessToken: generateAccessToken(userId, email, roles, expiresIn, sid),
        refreshToken: generateRefreshToken(userId, email, sid),
    };
}

/**
 * Extract user ID from request (for API routes)
 * 
 * @param req - Next.js Request object
 * @returns User ID or null if not authenticated
 */
export async function getUserIdFromToken(req: Request): Promise<number | null> {
    try {
        const authHeader = req.headers.get('Authorization');
        const token = extractTokenFromHeader(authHeader || '');

        if (!token) {
            return null;
        }

        const payload = verifyToken(token);

        if (!payload || !payload.userId) {
            return null;
        }

        return payload.userId;
    } catch (error) {
        console.error('Error extracting user ID from token:', error);
        return null;
    }
}
