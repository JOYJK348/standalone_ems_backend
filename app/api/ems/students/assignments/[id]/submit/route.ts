import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserTenantScope, autoAssignCompany } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';
import { AssignmentService } from '@/lib/services/AssignmentService';
import { EMSNotificationTriggers } from '@/lib/services/EMSNotificationTriggers';
import { ems } from '@/lib/supabase';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        console.log('[Submission API] Request received for assignment:', params.id);
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.students.assignments.submit');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        if (!scope.emsProfile?.profileId || scope.emsProfile.profileType !== 'student') {
            return errorResponse(null, 'Only students can submit assignments', 403);
        }

        const assignmentId = parseInt(params.id);

        // Use a generic way to get body (multipart or json)
        let submissionData: any = {};
        const contentType = req.headers.get('content-type') || '';
        console.log('[Submission API] Content-Type:', contentType);

        if (contentType.includes('multipart/form-data')) {
            const formData = await req.formData();
            submissionData.submission_text = formData.get('submission_text') as string;

            const file = formData.get('file') as File;
            console.log('[Submission API] File present:', !!file, file ? file.name : 'No file');

            if (file) {
                const timestamp = new Date().getTime();
                const fileExt = file.name.split('.').pop();
                // Ensure unique filename
                const fileName = `${scope.companyId}/${assignmentId}/${scope.emsProfile.profileId}_${timestamp}.${fileExt}`;
                console.log('[Submission API] Uploading file to:', fileName);

                const { data: uploadData, error: uploadError } = await ems.supabase.storage
                    .from('assignment-submissions')
                    .upload(fileName, file, {
                        contentType: file.type || 'application/octet-stream',
                        upsert: true
                    });

                if (uploadError) {
                    console.error('[Submission API] File Upload Error:', uploadError);
                    return errorResponse(null, 'Failed to upload assignment file: ' + uploadError.message);
                }

                const { data: publicUrlData } = ems.supabase.storage
                    .from('assignment-submissions')
                    .getPublicUrl(fileName);

                console.log('[Submission API] File uploaded, URL:', publicUrlData.publicUrl);
                submissionData.submission_file_url = publicUrlData.publicUrl;
            }
        } else {
            submissionData = await req.json();
        }

        console.log('[Submission API] Calling submitAssignment service with:', submissionData);

        const submission = await AssignmentService.submitAssignment({
            ...submissionData,
            assignment_id: assignmentId,
            student_id: scope.emsProfile.profileId,
            company_id: scope.companyId!,
            submission_status: 'SUBMITTED',
            submitted_at: new Date().toISOString()
        });

        console.log('[Submission API] Submission successful');

        // 🔥 Trigger Notifications asynchronously (don't block the response)
        EMSNotificationTriggers.onAssignmentSubmitted(
            assignmentId,
            scope.emsProfile.profileId,
            scope.companyId!
        ).catch(err => console.error('[Submission API] Notification Trigger Error:', err));

        return successResponse(submission, 'Assignment submitted successfully');
    } catch (error: any) {
        console.error('[Submission API] Error:', error);
        return errorResponse(null, error.message || 'Failed to submit assignment');
    }
}
