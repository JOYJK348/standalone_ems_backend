import { fromSchema } from '../supabase';
import { SCHEMAS } from '@/config/constants';

export class PracticeService {
    /**
     * Get Practice Quotas for Academic Manager Dashboard
     */
    static async getPracticeQuotas(companyId: number) {
        const { data, error } = await fromSchema(SCHEMAS.EMS, 'practice_quotas')
            .select('*')
            .eq('company_id', companyId);

        if (error) throw error;
        return data;
    }

    /**
     * Allocate a practice module to a student
     * This consumes 1 license from the quota
     */
    static async allocateModule(studentId: number, courseId: number, moduleType: 'GST' | 'TDS' | 'INCOME_TAX', companyId: number, allocatedBy: number) {
        // 1. Check if quota exists and has balance
        const { data: quota, error: quotaError } = await fromSchema(SCHEMAS.EMS, 'practice_quotas')
            .select('*')
            .eq('company_id', companyId)
            .eq('module_type', moduleType)
            .single();

        if (quotaError || !quota) {
            throw new Error(`No ${moduleType} license found for this company.`);
        }

        if (quota.used_licenses >= quota.total_licenses) {
            throw new Error(`License limit reached for ${moduleType}. Please contact admin.`);
        }

        // 2. Check if already allocated
        const { data: existing } = await fromSchema(SCHEMAS.EMS, 'student_practice_allocations')
            .select('*')
            .eq('student_id', studentId)
            .eq('module_type', moduleType)
            .eq('course_id', courseId)
            .single();

        if (existing) {
            return existing; // Already allocated
        }

        // 3. Create allocation
        const { data: allocation, error: allocError } = await fromSchema(SCHEMAS.EMS, 'student_practice_allocations')
            .insert({
                company_id: companyId,
                student_id: studentId,
                course_id: courseId,
                module_type: moduleType,
                allocated_by: allocatedBy,
                usage_limit: 5, // Default as discussed
                used_count: 0
            })
            .select()
            .single();

        if (allocError) throw allocError;

        // 4. Increment used licenses in quota
        await fromSchema(SCHEMAS.EMS, 'practice_quotas')
            .update({ used_licenses: quota.used_licenses + 1 })
            .eq('id', quota.id);

        return allocation;
    }

    /**
     * Save GST Practice Entry (Invoice)
     * Checks student's 5-attempt limit
     */
    static async saveGstEntry(allocationId: number, entryData: any) {
        // 1. Check limit
        const { data: allocation, error: allocError } = await fromSchema(SCHEMAS.EMS, 'student_practice_allocations')
            .select('*')
            .eq('id', allocationId)
            .single();

        if (allocError || !allocation) throw new Error('Invalid allocation');

        if (allocation.used_count >= allocation.usage_limit) {
            throw new Error('Usage limit reached (Max 5 attempts). Contact Manager to reset.');
        }

        // 2. Save entry
        const { data: entry, error: entryError } = await fromSchema(SCHEMAS.EMS, 'practice_gst_entries')
            .insert({
                allocation_id: allocationId,
                ...entryData,
                // Simple auto-validation logic
                is_correct: this.validateGstEntry(entryData).isValid,
                feedback_notes: this.validateGstEntry(entryData).message
            })
            .select()
            .single();

        if (entryError) throw entryError;

        // 3. Increment used_count
        await fromSchema(SCHEMAS.EMS, 'student_practice_allocations')
            .update({ used_count: allocation.used_count + 1 })
            .eq('id', allocationId);

        return entry;
    }

    /**
     * Simple GST Validation Logic for Simulation
     */
    private static validateGstEntry(data: any) {
        const { place_of_supply, igst, cgst, sgst, taxable_value, gst_rate } = data;
        const totalTaxRate = gst_rate / 100;
        const expectedTotalTax = taxable_value * totalTaxRate;

        // Check if Intra-state (Assume company is at State 33 - Tamil Nadu for practice defaults)
        const isTamilNadu = place_of_supply?.toLowerCase().includes('tamil nadu') || place_of_supply === '33';

        if (isTamilNadu) {
            if (igst > 0) return { isValid: false, message: 'Inter-state tax (IGST) cannot be applied for Intra-state supply.' };
            if (Math.abs((cgst + sgst) - expectedTotalTax) > 1) return { isValid: false, message: 'Tax calculation mismatch for CGST/SGST.' };
        } else {
            if (cgst > 0 || sgst > 0) return { isValid: false, message: 'Intra-state tax (CGST/SGST) cannot be applied for Inter-state supply.' };
            if (Math.abs(igst - expectedTotalTax) > 1) return { isValid: false, message: 'Tax calculation mismatch for IGST.' };
        }

        return { isValid: true, message: 'Correct tax calculation and placement.' };
    }

    /**
     * Save TDS Practice Entry
     */
    static async saveTdsEntry(allocationId: number, entryData: any) {
        // Check limit
        const { data: allocation } = await fromSchema(SCHEMAS.EMS, 'student_practice_allocations')
            .select('*')
            .eq('id', allocationId)
            .single();

        if (!allocation || allocation.used_count >= allocation.usage_limit) {
            throw new Error('Usage limit reached or invalid allocation.');
        }

        // Simple validation: PAN format
        const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
        const isValidPan = panRegex.test(entryData.deductee_pan || '');

        const { data: entry, error } = await fromSchema(SCHEMAS.EMS, 'practice_tds_entries')
            .insert({
                allocation_id: allocationId,
                ...entryData,
                is_correct: isValidPan && entryData.tds_deducted > 0,
                feedback_notes: isValidPan ? 'Valid PAN and deduction' : 'Invalid PAN format (Example: ABCDE1234F)'
            })
            .select()
            .single();

        if (error) throw error;

        await fromSchema(SCHEMAS.EMS, 'student_practice_allocations')
            .update({ used_count: allocation.used_count + 1 })
            .eq('id', allocationId);

        return entry;
    }

    /**
     * Save Income Tax Return Simulation
     */
    static async saveItReturn(allocationId: number, entryData: any) {
        const { data: allocation } = await fromSchema(SCHEMAS.EMS, 'student_practice_allocations')
            .select('*')
            .eq('id', allocationId)
            .single();

        if (!allocation || allocation.used_count >= allocation.usage_limit) {
            throw new Error('Usage limit reached.');
        }

        const { data: entry, error } = await fromSchema(SCHEMAS.EMS, 'practice_it_returns')
            .insert({
                allocation_id: allocationId,
                ...entryData,
                status: 'SUBMITTED'
            })
            .select()
            .single();

        if (error) throw error;

        await fromSchema(SCHEMAS.EMS, 'student_practice_allocations')
            .update({ used_count: allocation.used_count + 1 })
            .eq('id', allocationId);

        return entry;
    }

    /**
     * Reset or Extend Usage Limit for a student
     */
    static async resetUsageLimit(allocationId: number, newLimit: number = 5) {
        const { data, error } = await fromSchema(SCHEMAS.EMS, 'student_practice_allocations')
            .update({
                used_count: 0,
                usage_limit: newLimit,
                status: 'ACTIVE'
            })
            .eq('id', allocationId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Get Student Allocation Status
     */
    static async getStudentStatus(studentId: number, companyId: number) {
        const { data, error } = await fromSchema(SCHEMAS.EMS, 'student_practice_allocations')
            .select(`
                *,
                course:courses (
                    course_name,
                    enabled_practice_modules
                )
            `)
            .eq('student_id', studentId)
            .eq('company_id', companyId);

        if (error) throw error;
        return data;
    }
}
