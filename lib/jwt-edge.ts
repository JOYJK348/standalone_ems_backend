
import * as jose from 'jose';

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
 * Verify JWT token (Edge Runtime Compatible)
 * Use this in Middleware
 */
export async function verifyTokenEdge(token: string): Promise<JWTPayload | null> {
    try {
        if (!token) return null;

        // CRITICAL: Fetch secret inside the function to ensure it's loaded from env correctly
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            console.error('CRITICAL: JWT_SECRET missing in Edge Runtime environment');
            return null;
        }

        const secretUint8 = new TextEncoder().encode(secret);

        const { payload } = await jose.jwtVerify(token, secretUint8, {
            issuer: 'durkkas-erp',
            audience: 'durkkas-api',
        });

        return payload as unknown as JWTPayload;
    } catch (error: any) {
        // Detailed logging for debugging 401s
        console.error('JWT Edge verification failure:', {
            error: error.message,
            code: error.code,
            tokenSnippet: token?.substring(0, 15)
        });
        return null;
    }
}
