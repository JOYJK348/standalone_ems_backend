import { NextRequest } from 'next/server';
import { successResponse, asyncHandler } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { PracticeService } from '@/lib/services/PracticeService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export const GET = asyncHandler(async (req: NextRequest) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) throw new Error('Unauthorized');

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.practice.status');
    if (menuAccess instanceof Response) return menuAccess;

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');

    switch (type) {
        case 'hsn': {
            const category = searchParams.get('category') || undefined;
            const codes = await PracticeService.getHsnCodes(category);
            return successResponse(codes, 'HSN codes fetched');
        }
        case 'tds-sections': {
            const sections = await PracticeService.getTdsSections();
            return successResponse(sections, 'TDS sections fetched');
        }
        case 'tax-slabs': {
            const regime = searchParams.get('regime') as 'NEW' | 'OLD' | undefined;
            const slabs = await PracticeService.getTaxSlabs(regime);
            return successResponse(slabs, 'Tax slabs fetched');
        }
        default:
            throw new Error('Invalid data type. Use: hsn, tds-sections, or tax-slabs');
    }
});
