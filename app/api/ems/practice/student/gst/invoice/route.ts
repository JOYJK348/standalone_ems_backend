import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';
import { PracticeService } from '@/lib/services/PracticeService';

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.practice.gst.invoice');
        if (menuAccess instanceof Response) return menuAccess;

        const { allocationId, ...entryData } = await req.json();

        if (!allocationId) return errorResponse(null, 'Missing allocationId', 400);

        const entry = await PracticeService.saveGstEntry(parseInt(allocationId), entryData);

        return successResponse(entry, 'Invoice submitted to lab successfully');

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to submit invoice');
    }
}
