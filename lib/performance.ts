/**
 * Performance Optimization Utilities for EMS
 * Implements caching, query optimization, and monitoring
 */

import { logger } from '@/lib/logger';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. QUERY PERFORMANCE MONITORING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function measureQueryPerformance<T>(
    queryName: string,
    queryFn: () => Promise<T>
): Promise<T> {
    const startTime = Date.now();

    try {
        const result = await queryFn();
        const duration = Date.now() - startTime;

        // Log slow queries (> 500ms)
        if (duration > 500) {
            logger.warn('[Performance] Slow query detected', {
                queryName,
                duration: `${duration}ms`,
                threshold: '500ms'
            });
        } else {
            logger.debug('[Performance] Query executed', {
                queryName,
                duration: `${duration}ms`
            });
        }

        return result;
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error('[Performance] Query failed', {
            queryName,
            duration: `${duration}ms`,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. PAGINATION HELPER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface PaginationParams {
    page?: number;
    limit?: number;
}

export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}

export function getPaginationParams(searchParams: URLSearchParams): {
    from: number;
    to: number;
    page: number;
    limit: number;
} {
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10')));

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    return { from, to, page, limit };
}

export function buildPaginatedResponse<T>(
    data: T[],
    total: number,
    page: number,
    limit: number
): PaginatedResponse<T> {
    const totalPages = Math.ceil(total / limit);

    return {
        data,
        pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
        }
    };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. BATCH OPERATIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function batchProcess<T, R>(
    items: T[],
    batchSize: number,
    processFn: (batch: T[]) => Promise<R[]>
): Promise<R[]> {
    const results: R[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await processFn(batch);
        results.push(...batchResults);

        logger.debug('[Batch] Processed batch', {
            batchNumber: Math.floor(i / batchSize) + 1,
            batchSize: batch.length,
            totalProcessed: results.length,
            remaining: items.length - (i + batchSize)
        });
    }

    return results;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. CACHE KEYS (Ready for Redis Integration)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const CacheKeys = {
    // Course catalog (1 hour TTL)
    courses: (companyId: number) => `ems:courses:${companyId}`,
    courseDetails: (courseId: number) => `ems:course:${courseId}`,

    // Student data (15 minutes TTL)
    studentEnrollments: (studentId: number) => `ems:student:${studentId}:enrollments`,
    studentProgress: (enrollmentId: number) => `ems:enrollment:${enrollmentId}:progress`,

    // Quiz data (30 minutes TTL)
    quizQuestions: (quizId: number) => `ems:quiz:${quizId}:questions`,

    // Dashboard data (5 minutes TTL)
    studentDashboard: (studentId: number) => `ems:dashboard:student:${studentId}`,
    tutorDashboard: (tutorId: number) => `ems:dashboard:tutor:${tutorId}`,

    // Batch data (10 minutes TTL)
    batchDetails: (batchId: number) => `ems:batch:${batchId}`,
};

export const CacheTTL = {
    SHORT: 5 * 60,      // 5 minutes
    MEDIUM: 15 * 60,    // 15 minutes
    LONG: 60 * 60,      // 1 hour
    VERY_LONG: 24 * 60 * 60, // 24 hours
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. QUERY OPTIMIZATION HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Optimized field selection for common queries
 */
export const OptimizedSelects = {
    // Minimal student info for lists
    studentList: 'id, student_code, first_name, last_name, email, status',

    // Minimal course info for lists
    courseList: 'id, course_code, course_name, thumbnail_url, price, status',

    // Enrollment with minimal course info
    enrollmentWithCourse: `
        *,
        courses:course_id (
            id, course_name, course_code, thumbnail_url, total_lessons
        )
    `,

    // Course with modules (no lessons for list view)
    courseWithModules: `
        *,
        course_modules (
            id, module_name, module_order, duration_hours
        )
    `,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. PERFORMANCE METRICS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export class PerformanceMetrics {
    private static metrics: Map<string, number[]> = new Map();

    static record(operation: string, duration: number) {
        if (!this.metrics.has(operation)) {
            this.metrics.set(operation, []);
        }
        this.metrics.get(operation)!.push(duration);
    }

    static getStats(operation: string) {
        const durations = this.metrics.get(operation) || [];
        if (durations.length === 0) return null;

        const sorted = [...durations].sort((a, b) => a - b);
        const avg = durations.reduce((a, b) => a + b, 0) / durations.length;

        return {
            count: durations.length,
            avg: Math.round(avg),
            min: sorted[0],
            max: sorted[sorted.length - 1],
            p50: sorted[Math.floor(sorted.length * 0.5)],
            p95: sorted[Math.floor(sorted.length * 0.95)],
            p99: sorted[Math.floor(sorted.length * 0.99)],
        };
    }

    static getAllStats() {
        const stats: Record<string, any> = {};
        for (const [operation, _] of this.metrics) {
            stats[operation] = this.getStats(operation);
        }
        return stats;
    }

    static reset() {
        this.metrics.clear();
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. DATABASE CONNECTION POOLING (Supabase handles this automatically)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Connection pool is managed by Supabase
 * Default: 15 connections per instance
 * For high traffic, consider upgrading Supabase plan
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. USAGE EXAMPLES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Example: Measure query performance
 * 
 * const students = await measureQueryPerformance(
 *   'getAllStudents',
 *   () => StudentService.getAllStudents(companyId)
 * );
 */

/**
 * Example: Paginated query
 * 
 * const { from, to, page, limit } = getPaginationParams(searchParams);
 * const { data, count } = await supabase
 *   .from('students')
 *   .select('*', { count: 'exact' })
 *   .range(from, to);
 * 
 * return buildPaginatedResponse(data, count, page, limit);
 */

/**
 * Example: Batch processing
 * 
 * const results = await batchProcess(
 *   studentIds,
 *   50,
 *   async (batch) => {
 *     return await enrollStudents(batch);
 *   }
 * );
 */
