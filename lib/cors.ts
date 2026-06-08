import { NextApiRequest, NextApiResponse } from 'next';
import { ALLOWED_ORIGINS } from '../config/constants';

/**
 * CORS Middleware Helper
 * Handles cross-origin requests from separate frontend repositories.
 */
export const runCors = (req: NextApiRequest, res: NextApiResponse) => {
    const origin = req.headers.origin;

    // Check if origin is allowed
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (!origin && process.env.NODE_ENV === 'development') {
        // Allow server-side or local direct calls in dev
        res.setHeader('Access-Control-Allow-Origin', '*');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-durkkas-client-ip, x-device-fingerprint, x-company-id, x-branch-id, Expires, Cache-Control, Pragma'
    );
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return true;
    }

    return false;
};
