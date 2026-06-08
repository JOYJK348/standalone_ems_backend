/**
 * EMS API - Practice Lab - GST Entry Submission
 * Route: /api/ems/practice/student/gst/entry
 */

import { NextRequest } from 'next/server';
import { successResponse, asyncHandler } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { PracticeService } from '@/lib/services/PracticeService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export const POST = asyncHandler(async (req: NextRequest) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) throw new Error('Unauthorized');

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.practice.gst');
    if (menuAccess instanceof Response) return menuAccess;

    const body = await req.json();
    const { allocationId, ...entryData } = body;

    console.log('📝 [GST Entry] Received submission:', { allocationId, entryData });

    const entry = await PracticeService.saveGstEntry(allocationId, entryData);

    return successResponse(entry, 'GST practice entry submitted successfully', 201);
});
