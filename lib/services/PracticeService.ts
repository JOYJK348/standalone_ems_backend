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
     * Save GST Practice Entry (GSTR-1 Simulation)
     */
    static async saveGstEntry(allocationId: number, entryData: any) {
        const { data: allocation, error: allocError } = await fromSchema(SCHEMAS.EMS, 'student_practice_allocations')
            .select('*')
            .eq('id', allocationId)
            .single();

        if (allocError || !allocation) throw new Error('Invalid allocation');

        if (allocation.used_count >= allocation.usage_limit) {
            throw new Error('Usage limit reached (Max 5 attempts). Contact Manager to reset.');
        }

        const validation = this.validateGstEntry(entryData);
        const { hsn_code, item_description, quantity, unit_price, supply_state_code, ...coreFields } = entryData;

        const { data: entry, error: entryError } = await fromSchema(SCHEMAS.EMS, 'practice_gst_entries')
            .insert({
                allocation_id: allocationId,
                ...coreFields,
                hsn_code: hsn_code || null,
                item_description: item_description || null,
                quantity: quantity || 1,
                unit_price: unit_price || 0,
                supply_state_code: supply_state_code || null,
                metadata: JSON.stringify({
                    hsn_code,
                    item_description,
                    quantity,
                    unit_price,
                    supply_state_code
                }),
                is_correct: validation.isValid,
                feedback_notes: validation.message
            })
            .select()
            .single();

        if (entryError) throw entryError;

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
     * Save TDS Practice Entry (Form 26Q Simulation)
     */
    static async saveTdsEntry(allocationId: number, entryData: any) {
        const { data: allocation } = await fromSchema(SCHEMAS.EMS, 'student_practice_allocations')
            .select('*')
            .eq('id', allocationId)
            .single();

        if (!allocation || allocation.used_count >= allocation.usage_limit) {
            throw new Error('Usage limit reached or invalid allocation.');
        }

        const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
        const tanRegex = /^[A-Z]{4}[0-9]{5}[A-Z]{1}$/;
        const isValidPan = panRegex.test(entryData.deductee_pan || '');
        const isValidTan = tanRegex.test(entryData.deductor_tan || '');
        const tdsCorrect = entryData.tds_deducted > 0 && Math.abs(entryData.tds_deducted - (entryData.payment_amount * entryData.tds_rate / 100)) <= 1;

        const feedback = [];
        if (!isValidPan) feedback.push('Invalid deductee PAN');
        if (!isValidTan) feedback.push('Invalid deductor TAN');
        if (!tdsCorrect) feedback.push('TDS amount mismatch');
        if (feedback.length === 0) feedback.push('All validations passed');

        const { data: entry, error } = await fromSchema(SCHEMAS.EMS, 'practice_tds_entries')
            .insert({
                allocation_id: allocationId,
                deductee_name: entryData.deductee_name,
                deductee_pan: entryData.deductee_pan,
                tds_section: entryData.section_code,
                gross_amount: entryData.payment_amount || 0,
                tds_rate: entryData.tds_rate || 0,
                tds_deducted: entryData.tds_deducted || 0,
                net_amount: (entryData.payment_amount || 0) - (entryData.tds_deducted || 0),
                deductor_tan: entryData.deductor_tan,
                deductor_name: entryData.deductor_name,
                deductor_pan: entryData.deductor_pan,
                deductee_address: entryData.deductee_address,
                payment_date: entryData.payment_date,
                payment_amount: entryData.payment_amount,
                tds_deposited: entryData.tds_deposited,
                deposit_date: entryData.deposit_date,
                challan_serial: entryData.challan_serial,
                bsr_code: entryData.bsr_code,
                challan_date: entryData.challan_date,
                challan_amount: entryData.challan_amount,
                is_correct: isValidPan && isValidTan && tdsCorrect,
                feedback_notes: feedback.join('; ')
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
     * Save Income Tax Return (ITR-1 Sahaj Simulation)
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
                pan: entryData.pan || '',
                assessment_year: entryData.assessment_year || '2025-26',
                gross_income: entryData.gross_total_income || entryData.gross_income || 0,
                deductions_80c: entryData.deduction_80c || 0,
                deductions_80d: entryData.deduction_80d || 0,
                taxable_income: entryData.taxable_income || 0,
                tax_payable: entryData.tax_payable || 0,
                status: 'SUBMITTED',
                full_name: entryData.full_name,
                tax_regime: entryData.tax_regime || 'NEW',
                salary_income: entryData.salary_income || 0,
                allowances: entryData.allowances || 0,
                perquisites: entryData.perquisites || 0,
                gross_salary: entryData.gross_salary || 0,
                rental_income: entryData.rental_income || 0,
                municipal_tax: entryData.municipal_tax || 0,
                home_loan_interest: entryData.home_loan_interest || 0,
                income_from_house_property: entryData.income_from_house_property || 0,
                interest_income: entryData.interest_income || 0,
                other_income: entryData.other_income || 0,
                deduction_80e: entryData.deduction_80e || 0,
                deduction_80g: entryData.deduction_80g || 0,
                other_deductions: entryData.other_deductions || 0,
                gross_total_income: entryData.gross_total_income || 0,
                total_deductions: entryData.total_deductions || 0
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

    // =========================================================================
    // Scenario Methods (Phase 1 — Govt Portal Simulations)
    // =========================================================================

    /**
     * Get Practice Scenarios (optionally filtered by module_type)
     */
    static async getScenarios(moduleType?: 'GST' | 'TDS' | 'INCOME_TAX') {
        let query = fromSchema(SCHEMAS.EMS, 'practice_scenarios')
            .select('*')
            .eq('is_active', true);

        if (moduleType) {
            query = query.eq('module_type', moduleType);
        }

        const { data, error } = await query.order('difficulty', { ascending: true });

        if (error) throw error;
        return data;
    }

    /**
     * Get a single scenario by ID
     */
    static async getScenarioById(id: number) {
        const { data, error } = await fromSchema(SCHEMAS.EMS, 'practice_scenarios')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Get HSN Codes for GST practice
     */
    static async getHsnCodes(category?: string) {
        let query = fromSchema(SCHEMAS.EMS, 'practice_hsn_codes')
            .select('*');

        if (category) {
            query = query.eq('category', category);
        }

        const { data, error } = await query.order('hsn_code');

        if (error) throw error;
        return data;
    }

    /**
     * Get TDS Sections
     */
    static async getTdsSections() {
        const { data, error } = await fromSchema(SCHEMAS.EMS, 'practice_tds_sections')
            .select('*')
            .order('section_code');

        if (error) throw error;
        return data;
    }

    /**
     * Get Tax Slabs
     */
    static async getTaxSlabs(regime?: 'NEW' | 'OLD') {
        let query = fromSchema(SCHEMAS.EMS, 'practice_tax_slabs')
            .select('*');

        if (regime) {
            query = query.eq('regime', regime);
        }

        const { data, error } = await query.order('min_income');

        if (error) throw error;
        return data;
    }

    /**
     * Randomly pick a scenario for the student session
     */
    static async pickRandomScenario(moduleType: 'GST' | 'TDS' | 'INCOME_TAX', excludeIds: number[] = []) {
        let query = fromSchema(SCHEMAS.EMS, 'practice_scenarios')
            .select('*')
            .eq('module_type', moduleType)
            .eq('is_active', true);

        if (excludeIds.length > 0) {
            query = query.not('id', 'in', `(${excludeIds.join(',')})`);
        }

        const { data, error } = await query;

        if (error) throw error;
        if (!data || data.length === 0) return null;

        // Pick random from available
        const idx = Math.floor(Math.random() * data.length);
        return data[idx];
    }
}
