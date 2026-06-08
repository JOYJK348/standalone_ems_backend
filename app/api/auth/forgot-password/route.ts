
import { NextRequest } from 'next/server';
import { app_auth, core } from '@/lib/supabase';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import bcrypt from 'bcryptjs';
import { GlobalSettings } from '@/lib/settings';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { action, email, employee_code, new_password } = body;

        if (!email || !employee_code) {
            return errorResponse('VALIDATION_ERROR', 'Email and Employee Code are required', 400);
        }

        // 1. Verify Identity
        // Check if there is an employee record matching BOTH email and code
        const { data: employee, error: empError } = await core.employees()
            .select('id, email, first_name')
            .eq('email', email)
            .eq('employee_code', employee_code)
            .eq('is_active', true)
            .single();

        if (empError || !employee) {
            return errorResponse('NOT_FOUND', 'Invalid Email or Employee Code. Please check your details.', 404);
        }

        // If action is just VERIFY, return success to let frontend move to next step
        if (action === 'VERIFY') {
            return successResponse({ verified: true, name: employee.first_name }, 'Identity verified successfully');
        }

        // 2. Reset Password
        if (action === 'RESET') {
            if (!new_password) {
                return errorResponse('VALIDATION_ERROR', 'New Password is required', 400);
            }

            // 🛡️ Password Length Enforcement
            const minLength = await GlobalSettings.getMinPasswordLength();
            if (new_password.length < minLength) {
                return errorResponse('VALIDATION_ERROR', `Password must be at least ${minLength} characters as per system policy.`, 400);
            }

            // Find the User account linked to this email
            const { data: user } = await app_auth.users()
                .select('id')
                .eq('email', email)
                .single();

            if (!user) {
                return errorResponse('System Error', 'User account not found for this employee record.', 500);
            }

            // Hash new password
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(new_password, salt);

            // Update Password
            const { error: updateError } = await app_auth.users()
                .update({
                    password_hash: hashedPassword,
                    updated_at: new Date().toISOString()
                })
                .eq('id', user.id);

            if (updateError) {
                throw new Error(updateError.message);
            }

            return successResponse({ success: true }, 'Password has been reset successfully');
        }

        return errorResponse('BAD_REQUEST', 'Invalid action', 400);

    } catch (error: any) {
        console.error('Forgot Password Error:', error);
        return errorResponse('INTERNAL_ERROR', 'Failed to process request', 500);
    }
}
