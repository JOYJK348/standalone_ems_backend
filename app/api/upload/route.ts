
import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';

export async function POST(req: NextRequest) {
    try {
        // 1. Auth Check
        const userId = await getUserIdFromToken(req);
        if (!userId) {
            return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);
        }

        // 2. Parse Form Data
        const formData = await req.formData();
        const file = formData.get('file') as File;
        const bucket = formData.get('bucket') as string || 'branding';
        const folder = formData.get('folder') as string || 'uploads';

        if (!file) {
            return errorResponse('VALIDATION_ERROR', 'No file uploaded', 400);
        }

        // 3. Validate File Type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/x-icon'];
        if (!allowedTypes.includes(file.type)) {
            return errorResponse('VALIDATION_ERROR', 'Invalid file type. Only images are allowed.', 400);
        }

        // 4. Validate File Size (e.g., 5MB)
        if (file.size > 5 * 1024 * 1024) {
            return errorResponse('VALIDATION_ERROR', 'File size too large. Max 5MB.', 400);
        }

        // 5. Generate Unique Filename
        const timestamp = Date.now();
        const extension = file.name.split('.').pop();
        const cleanFileName = file.name.replace(/[^a-zA-Z0-9]/g, '_');
        const fileName = `${folder}/${timestamp}_${cleanFileName}`;

        // 6. Ensure bucket exists (create if not)
        const { data: buckets } = await supabase.storage.listBuckets();
        const bucketExists = buckets?.some(b => b.name === bucket);
        if (!bucketExists) {
            await supabase.storage.createBucket(bucket, { public: true });
            console.log(`📦 [UPLOAD API] Created bucket: ${bucket}`);
        }

        // 7. Upload to Supabase Storage
        const { data, error } = await supabase.storage
            .from(bucket)
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: true,
                contentType: file.type || 'image/png'
            });

        if (error) {
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.error('❌ [UPLOAD API] Supabase Storage Error:');
            console.error('   Bucket:', bucket);
            console.error('   File Path:', fileName);
            console.error('   Error Details:', error);
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            throw new Error(error.message || 'Supabase storage upload failed');
        }

        // 7. Get Public URL
        const { data: { publicUrl } } = supabase.storage
            .from(bucket)
            .getPublicUrl(fileName);

        return successResponse({
            url: publicUrl,
            path: fileName,
            size: file.size,
            type: file.type
        }, 'File uploaded successfully');

    } catch (error: any) {
        console.error('Upload API Error:', error);
        return errorResponse('INTERNAL_ERROR', error.message || 'File upload failed');
    }
}
