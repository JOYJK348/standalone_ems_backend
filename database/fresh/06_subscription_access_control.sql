-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- SUBSCRIPTION-BASED ACCESS CONTROL SYSTEM
-- Features: Plan limits, Module access, Menu visibility, Usage tracking
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SET search_path TO core, app_auth, public;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. ENHANCED SUBSCRIPTION_PLANS TABLE
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Add new columns to existing subscription_plans table
ALTER TABLE core.subscription_plans 
ADD COLUMN IF NOT EXISTS plan_type VARCHAR(20) DEFAULT 'STANDARD', -- TRIAL, STANDARD, CUSTOM
ADD COLUMN IF NOT EXISTS max_users INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS max_departments INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS max_designations INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS trial_days INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS enabled_modules JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS support_level VARCHAR(50) DEFAULT 'EMAIL', -- EMAIL, PRIORITY, 24X7
ADD COLUMN IF NOT EXISTS badge VARCHAR(50), -- POPULAR, BEST_VALUE, etc.
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Add comments
COMMENT ON COLUMN core.subscription_plans.plan_type IS 'TRIAL=Free trial, STANDARD=Fixed price, CUSTOM=Enterprise custom';
COMMENT ON COLUMN core.subscription_plans.max_users IS 'Maximum users allowed (0 = unlimited)';
COMMENT ON COLUMN core.subscription_plans.max_departments IS 'Maximum departments allowed (0 = unlimited)';
COMMENT ON COLUMN core.subscription_plans.max_designations IS 'Maximum designations allowed (0 = unlimited)';
COMMENT ON COLUMN core.subscription_plans.enabled_modules IS 'JSON array of enabled module keys: HR, ATTENDANCE, PAYROLL, CRM, LMS, FINANCE';
COMMENT ON COLUMN core.subscription_plans.support_level IS 'EMAIL, PRIORITY, or 24X7';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. ENHANCED COMPANIES TABLE - Add usage tracking
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE core.companies
ADD COLUMN IF NOT EXISTS plan_id BIGINT REFERENCES core.subscription_plans(id),
ADD COLUMN IF NOT EXISTS enabled_modules JSONB DEFAULT '["HR", "ATTENDANCE"]'::jsonb,
ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS trial_expired BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN core.companies.plan_id IS 'Reference to subscription_plans table';
COMMENT ON COLUMN core.companies.enabled_modules IS 'Modules enabled for this company (derived from plan)';
COMMENT ON COLUMN core.companies.trial_started_at IS 'When trial period started';
COMMENT ON COLUMN core.companies.trial_expired IS 'Flag when trial has expired';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. MENU_REGISTRY - Add module mapping for plan-based visibility
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE app_auth.menu_registry
ADD COLUMN IF NOT EXISTS required_module VARCHAR(50), -- HR, ATTENDANCE, PAYROLL, CRM, LMS, FINANCE
ADD COLUMN IF NOT EXISTS min_plan_level INTEGER DEFAULT 0; -- 0=TRIAL, 1=BASIC, 2=STANDARD, 3=ENTERPRISE

COMMENT ON COLUMN app_auth.menu_registry.required_module IS 'Module key required to see this menu';
COMMENT ON COLUMN app_auth.menu_registry.min_plan_level IS 'Minimum plan level required (0=all, 1=Basic+, 2=Standard+, 3=Enterprise only)';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. UPDATE SUBSCRIPTION PLANS WITH NEW DATA
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Clear existing and insert fresh plans
DELETE FROM core.subscription_plans WHERE name IN ('TRIAL', 'BASIC', 'STANDARD', 'ENTERPRISE');

INSERT INTO core.subscription_plans (
    name, display_name, description, 
    monthly_price, yearly_price, 
    plan_type, trial_days,
    max_employees, max_branches, max_users, max_departments, max_designations,
    enabled_modules, features, support_level, badge, sort_order
) VALUES 
-- TRIAL PLAN
(
    'TRIAL', 
    'Trial Plan', 
    'Experience all features free for 30 days. Perfect for evaluation.',
    0.00, 0.00,
    'TRIAL', 30,
    10, 1, 10, 5, 5,
    '["HR", "ATTENDANCE", "PAYROLL", "CRM", "LMS", "FINANCE"]'::jsonb,
    '["All Modules Unlocked", "Limited Users (10)", "Single Branch", "30 Days Validity", "Email Support"]'::jsonb,
    'EMAIL', NULL, 0
),
-- BASIC PLAN
(
    'BASIC', 
    'Basic Plan', 
    'Essential features for small teams and startups.',
    2999.00, 29990.00,
    'STANDARD', 0,
    25, 3, 25, 10, 10,
    '["HR", "ATTENDANCE"]'::jsonb,
    '["Core HR Management", "Attendance Tracking", "Basic Reports", "Up to 3 Branches", "25 Users", "Email Support"]'::jsonb,
    'EMAIL', NULL, 1
),
-- STANDARD PLAN (POPULAR)
(
    'STANDARD', 
    'Standard Plan', 
    'Full-featured solution for growing companies.',
    5999.00, 59990.00,
    'STANDARD', 0,
    100, 5, 100, 25, 25,
    '["HR", "ATTENDANCE", "PAYROLL", "CRM"]'::jsonb,
    '["Everything in Basic", "Payroll Automation", "CRM & Sales", "Advanced Analytics", "Up to 5 Branches", "100 Users", "Priority Support"]'::jsonb,
    'PRIORITY', 'POPULAR', 2
),
-- ENTERPRISE PLAN
(
    'ENTERPRISE', 
    'Enterprise Plan', 
    'Unlimited power for large organizations with custom requirements.',
    14999.00, 149990.00,
    'STANDARD', 0,
    0, 0, 0, 0, 0, -- 0 = Unlimited
    '["HR", "ATTENDANCE", "PAYROLL", "CRM", "LMS", "FINANCE"]'::jsonb,
    '["Everything Unlimited", "All Modules Included", "LMS Integration", "Finance & Accounting", "Custom Integrations", "API Access", "Dedicated Account Manager", "24/7 Support"]'::jsonb,
    '24X7', 'BEST_VALUE', 3
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. SEED MENU REGISTRY WITH MODULE MAPPINGS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Update existing menus with module requirements
UPDATE app_auth.menu_registry SET required_module = 'HR', min_plan_level = 0 WHERE menu_key ILIKE '%hrms%' OR menu_key ILIKE '%employee%';
UPDATE app_auth.menu_registry SET required_module = 'ATTENDANCE', min_plan_level = 0 WHERE menu_key ILIKE '%attendance%';
UPDATE app_auth.menu_registry SET required_module = 'PAYROLL', min_plan_level = 2 WHERE menu_key ILIKE '%payroll%';
UPDATE app_auth.menu_registry SET required_module = 'CRM', min_plan_level = 2 WHERE menu_key ILIKE '%crm%' OR menu_key ILIKE '%sales%';
UPDATE app_auth.menu_registry SET required_module = 'LMS', min_plan_level = 3 WHERE menu_key ILIKE '%lms%' OR menu_key ILIKE '%learning%';
UPDATE app_auth.menu_registry SET required_module = 'FINANCE', min_plan_level = 3 WHERE menu_key ILIKE '%finance%' OR menu_key ILIKE '%accounting%';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. CREATE HELPER FUNCTIONS FOR LIMIT CHECKING
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Function to get company usage stats
CREATE OR REPLACE FUNCTION core.get_company_usage(p_company_id BIGINT)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'users', (SELECT COUNT(*) FROM app_auth.user_roles WHERE company_id = p_company_id AND is_active = TRUE),
        'employees', (SELECT COUNT(*) FROM core.employees WHERE company_id = p_company_id AND is_active = TRUE AND deleted_at IS NULL),
        'branches', (SELECT COUNT(*) FROM core.branches WHERE company_id = p_company_id AND is_active = TRUE AND deleted_at IS NULL),
        'departments', (SELECT COUNT(*) FROM core.departments WHERE company_id = p_company_id AND is_active = TRUE AND deleted_at IS NULL),
        'designations', (SELECT COUNT(*) FROM core.designations WHERE company_id = p_company_id AND is_active = TRUE AND deleted_at IS NULL)
    ) INTO v_result;
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Function to get company plan limits
CREATE OR REPLACE FUNCTION core.get_company_plan_limits(p_company_id BIGINT)
RETURNS JSONB AS $$
DECLARE
    v_plan_name VARCHAR(50);
    v_result JSONB;
BEGIN
    SELECT subscription_plan INTO v_plan_name FROM core.companies WHERE id = p_company_id;
    
    SELECT jsonb_build_object(
        'plan_name', sp.name,
        'display_name', sp.display_name,
        'max_users', sp.max_users,
        'max_employees', sp.max_employees,
        'max_branches', sp.max_branches,
        'max_departments', sp.max_departments,
        'max_designations', sp.max_designations,
        'enabled_modules', sp.enabled_modules,
        'trial_days', sp.trial_days,
        'support_level', sp.support_level
    ) INTO v_result
    FROM core.subscription_plans sp
    WHERE sp.name = v_plan_name;
    
    IF v_result IS NULL THEN
        -- Default to TRIAL if plan not found
        SELECT jsonb_build_object(
            'plan_name', 'TRIAL',
            'display_name', 'Trial Plan',
            'max_users', 10,
            'max_employees', 10,
            'max_branches', 1,
            'max_departments', 5,
            'max_designations', 5,
            'enabled_modules', '["HR", "ATTENDANCE"]'::jsonb,
            'trial_days', 30,
            'support_level', 'EMAIL'
        ) INTO v_result;
    END IF;
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Function to check if company can add resource
CREATE OR REPLACE FUNCTION core.can_add_resource(
    p_company_id BIGINT,
    p_resource_type VARCHAR(50) -- 'user', 'employee', 'branch', 'department', 'designation'
)
RETURNS JSONB AS $$
DECLARE
    v_usage JSONB;
    v_limits JSONB;
    v_current INTEGER;
    v_max INTEGER;
    v_can_add BOOLEAN;
    v_message TEXT;
BEGIN
    v_usage := core.get_company_usage(p_company_id);
    v_limits := core.get_company_plan_limits(p_company_id);
    
    CASE p_resource_type
        WHEN 'user' THEN
            v_current := (v_usage->>'users')::INTEGER;
            v_max := (v_limits->>'max_users')::INTEGER;
        WHEN 'employee' THEN
            v_current := (v_usage->>'employees')::INTEGER;
            v_max := (v_limits->>'max_employees')::INTEGER;
        WHEN 'branch' THEN
            v_current := (v_usage->>'branches')::INTEGER;
            v_max := (v_limits->>'max_branches')::INTEGER;
        WHEN 'department' THEN
            v_current := (v_usage->>'departments')::INTEGER;
            v_max := (v_limits->>'max_departments')::INTEGER;
        WHEN 'designation' THEN
            v_current := (v_usage->>'designations')::INTEGER;
            v_max := (v_limits->>'max_designations')::INTEGER;
        ELSE
            RETURN jsonb_build_object('allowed', FALSE, 'message', 'Unknown resource type');
    END CASE;
    
    -- 0 means unlimited
    IF v_max = 0 THEN
        v_can_add := TRUE;
        v_message := 'Unlimited ' || p_resource_type || 's allowed';
    ELSIF v_current < v_max THEN
        v_can_add := TRUE;
        v_message := format('You can add %s more %s(s)', v_max - v_current, p_resource_type);
    ELSE
        v_can_add := FALSE;
        v_message := format('You have reached the maximum limit of %s %s(s) for your %s plan. Upgrade to add more.', 
            v_max, p_resource_type, v_limits->>'display_name');
    END IF;
    
    RETURN jsonb_build_object(
        'allowed', v_can_add,
        'current', v_current,
        'max', v_max,
        'remaining', GREATEST(0, v_max - v_current),
        'message', v_message
    );
END;
$$ LANGUAGE plpgsql;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 7. VERIFY & REPORT
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$
DECLARE
    v_plan_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_plan_count FROM core.subscription_plans;
    
    RAISE NOTICE '✅ Subscription Access Control System Applied!';
    RAISE NOTICE '📊 Total Plans: %', v_plan_count;
    RAISE NOTICE '🔑 Functions Created: get_company_usage, get_company_plan_limits, can_add_resource';
END $$;
