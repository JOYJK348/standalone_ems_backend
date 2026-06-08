import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserMenus } from '@/lib/menuAccess';

export async function GET(req: NextRequest) {
    try {
        const userId = parseInt(req.headers.get('x-user-id') || '');

        if (isNaN(userId)) {
            return errorResponse('UNAUTHORIZED', 'User not identified', 401);
        }

        const menus = await getUserMenus(userId);
        return successResponse({ menus }, 'Menus fetched successfully');
    } catch (error: any) {
        return errorResponse('INTERNAL_SERVER_ERROR', error.message);
    }
}
