import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { redis } from '@/lib/redis';
import { successResponse, errorResponse } from '@/lib/errorHandler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * HEALTH CHECK ENDPOINT
 * Checks API, Database, and Redis connectivity
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

export async function GET() {
    const health: any = {
        status: 'UP',
        timestamp: new Date().toISOString(),
        services: {
            api: 'UP',
            database: 'DOWN',
            redis: 'DOWN'
        }
    };

    try {
        // 1. Check Database
        const { error: dbError } = await supabase.from('companies').select('count', { count: 'exact', head: true });
        if (!dbError) {
            health.services.database = 'UP';
        }

        // 2. Check Redis
        if (redis) {
            try {
                const redisStatus = await redis.ping();
                if (redisStatus === 'PONG') {
                    health.services.redis = 'UP';
                }
            } catch (e) {
                health.services.redis = 'UNAVAILABLE';
            }
        } else {
            health.services.redis = 'UNAVAILABLE';
        }

        // Determine overall status
        if (health.services.database === 'DOWN' || health.services.redis === 'DOWN') {
            health.status = 'DEGRADED';
            return NextResponse.json(health, { status: 200 });
        }

        return successResponse(health, 'System is healthy');
    } catch (error: any) {
        health.status = 'DOWN';
        return errorResponse('HEALTH_CHECK_FAILED', error.message, 503, health);
    }
}
