import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';
import { BatchService } from '@/lib/services/BatchService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.batches.edit');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        const batchId = parseInt(params.id);
        const { searchParams } = new URL(req.url);
        const details = searchParams.get('details') === 'true';

        let batch;
        if (details) {
            batch = await BatchService.getBatchDetails(batchId);
        } else {
            batch = await BatchService.getBatchById(batchId, scope.companyId!);
        }

        if (!batch) {
            return errorResponse(null, 'Batch not found', 404);
        }

        return successResponse(batch, 'Batch fetched successfully');
    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to fetch batch');
    }
}

export async function PUT(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.batches.edit');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        const batchId = parseInt(params.id);
        const data = await req.json();

        const updatedBatch = await BatchService.updateBatch(
            batchId,
            scope.companyId!,
            data
        );

        if (!updatedBatch) {
            return errorResponse(null, 'Batch not found or update failed', 404);
        }

        return successResponse(updatedBatch, 'Batch updated successfully');

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to update batch');
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.batches.edit');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        const batchId = parseInt(params.id);

        const deleted = await BatchService.deleteBatch(batchId, scope.companyId!, userId);

        if (!deleted) {
            return errorResponse(null, 'Batch not found or already deleted', 404);
        }

        return successResponse(
            { id: batchId, deleted: true },
            'Batch deleted successfully'
        );

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to delete batch');
    }
}
