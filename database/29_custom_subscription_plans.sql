-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- CUSTOM SUBSCRIPTION PLANS SYSTEM
-- "Subscription defines access, Menu registry defines structure, 
--  Permissions map subscription to menus"
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SET search_path TO core, app_auth, public;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. SUBSCRIPTION_TEMPLATES - Custom Plan Configurations
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS core.subscription_templates (
    id BIGSERIAL PRIMARY KEY,
    
    -- Template Identity
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,  -- e.g., CUSTOM-001
    display_name VARCHAR(255),
    description TEXT,
    
    -- Template Type
    template_type VARCHAR(20) DEFAULT 'CUSTOM',  -- PREDEFINED, CUSTOM
    base_plan VARCHAR(50),  -- Base plan if derived (TRIAL, BASIC, STANDARD, ENTERPRISE)
    
    -- Pricing
    monthly_price DECIMAL(12, 2) DEFAULT 0.00,
    yearly_price DECIMAL(12, 2) DEFAULT 0.00,
    setup_fee DECIMAL(12, 2) DEFAULT 0.00,
    
    -- Limits
    max_users INTEGER DEFAULT 10,
    max_employees INTEGER DEFAULT 10,
    max_branches INTEGER DEFAULT 1,
    max_departments INTEGER DEFAULT 5,
    max_designations INTEGER DEFAULT 5,
    
    -- Module Access (JSON Array of module keys)
    enabled_modules JSONB DEFAULT '[]'::jsonb,
    -- e.g., ["HR", "ATTENDANCE", "PAYROLL"]
    
    -- Menu Access (JSON Array of menu_ids from menu_registry)
    allowed_menu_ids JSONB DEFAULT '[]'::jsonb,
    -- e.g., [1, 2, 5, 8, 12]
    
    -- Features List
    features JSONB DEFAULT '[]'::jsonb,
    
    -- Support
    support_level VARCHAR(50) DEFAULT 'EMAIL',  -- EMAIL, PRIORITY, 24X7
    
    -- Validity
    trial_days INTEGER DEFAULT 0,
    validity_days INTEGER DEFAULT 365,  -- 0 = unlimited
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_published BOOLEAN DEFAULT FALSE,  -- Only published templates can be assigned
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT,
    updated_by BIGINT
);

COMMENT ON TABLE core.subscription_templates IS 'Custom subscription plan templates with granular module and menu access';
COMMENT ON COLUMN core.subscription_templates.enabled_modules IS 'JSON array of enabled module keys: HR, ATTENDANCE, PAYROLL, CRM, LMS, FINANCE';
COMMENT ON COLUMN core.subscription_templates.allowed_menu_ids IS 'JSON array of allowed menu IDs from app_auth.menu_registry';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. COMPANY_SUBSCRIPTION_MENUS - Company-Specific Menu Access
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS core.company_subscription_menus (
    id BIGSERIAL PRIMARY KEY,
    
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    menu_id BIGINT NOT NULL REFERENCES app_auth.menu_registry(id) ON DELETE CASCADE,
    
    -- Access Level
    can_view BOOLEAN DEFAULT TRUE,
    can_create BOOLEAN DEFAULT FALSE,
    can_edit BOOLEAN DEFAULT FALSE,
    can_delete BOOLEAN DEFAULT FALSE,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT,
    
    UNIQUE(company_id, menu_id)
);

COMMENT ON TABLE core.company_subscription_menus IS 'Maps company subscription to allowed menus (auto-generated from template)';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. ENHANCE COMPANIES TABLE - Link to Template
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE core.companies
ADD COLUMN IF NOT EXISTS subscription_template_id BIGINT REFERENCES core.subscription_templates(id),
ADD COLUMN IF NOT EXISTS allowed_menu_ids JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'ACTIVE',
ADD COLUMN IF NOT EXISTS max_users INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS max_employees INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS max_branches INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS max_departments INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS max_designations INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS enabled_modules JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS trial_expired BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN core.companies.subscription_template_id IS 'Reference to custom subscription template';
COMMENT ON COLUMN core.companies.allowed_menu_ids IS 'Cached list of allowed menu IDs for fast access';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. ENHANCE MENU_REGISTRY - Add Module Mapping & Hierarchy
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Add module mapping columns if not exist
ALTER TABLE app_auth.menu_registry
ADD COLUMN IF NOT EXISTS module_key VARCHAR(50),  -- HR, ATTENDANCE, PAYROLL, CRM, LMS, FINANCE
ADD COLUMN IF NOT EXISTS is_core BOOLEAN DEFAULT FALSE,  -- Core menus (always visible: Dashboard, Profile)
ADD COLUMN IF NOT EXISTS requires_subscription BOOLEAN DEFAULT TRUE;  -- Requires subscription check

COMMENT ON COLUMN app_auth.menu_registry.module_key IS 'Module this menu belongs to';
COMMENT ON COLUMN app_auth.menu_registry.is_core IS 'Core menus are always visible regardless of subscription';
COMMENT ON COLUMN app_auth.menu_registry.requires_subscription IS 'Whether this menu requires subscription check';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. SEED COMPREHENSIVE MENU REGISTRY
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Clear and reseed menu registry with complete structure
DELETE FROM app_auth.menu_registry WHERE menu_key LIKE 'mod.%';

-- Insert Module-based Menu Structure
INSERT INTO app_auth.menu_registry 
(menu_key, menu_name, display_name, parent_menu_id, sort_order, module_key, is_core, requires_subscription, route, icon, is_active, is_visible, product)
VALUES
-- ━━━ CORE (Always Visible) ━━━
('mod.core.dashboard', 'Dashboard', 'Dashboard', NULL, 1, 'CORE', TRUE, FALSE, '/workspace/dashboard', 'LayoutDashboard', TRUE, TRUE, NULL),
('mod.core.profile', 'Profile', 'My Profile', NULL, 100, 'CORE', TRUE, FALSE, '/workspace/profile', 'UserCircle', TRUE, TRUE, NULL),
('mod.core.notifications', 'Notifications', 'Notifications', NULL, 99, 'CORE', TRUE, FALSE, '/workspace/notifications', 'Bell', TRUE, TRUE, NULL),
('mod.core.settings', 'Settings', 'Settings', NULL, 98, 'CORE', TRUE, FALSE, '/workspace/settings', 'Settings', TRUE, TRUE, NULL),

-- ━━━ HR MODULE ━━━
('mod.hr', 'HR Management', 'HR Management', NULL, 10, 'HR', FALSE, TRUE, NULL, 'Users', TRUE, TRUE, 'HRMS'),
('mod.hr.employees', 'Employees', 'Employee Directory', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.hr'), 1, 'HR', FALSE, TRUE, '/workspace/employees', 'Users', TRUE, TRUE, 'HRMS'),
('mod.hr.departments', 'Departments', 'Departments', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.hr'), 2, 'HR', FALSE, TRUE, '/workspace/settings?tab=DEPARTMENTS', 'LayoutGrid', TRUE, TRUE, 'HRMS'),
('mod.hr.designations', 'Designations', 'Designations', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.hr'), 3, 'HR', FALSE, TRUE, '/workspace/settings?tab=DESIGNATIONS', 'Award', TRUE, TRUE, 'HRMS'),
('mod.hr.branches', 'Branches', 'Branch Management', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.hr'), 4, 'HR', FALSE, TRUE, '/workspace/branches', 'Building', TRUE, TRUE, 'HRMS'),
('mod.hr.onboarding', 'Onboarding', 'Employee Onboarding', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.hr'), 5, 'HR', FALSE, TRUE, '/workspace/onboarding', 'UserPlus', TRUE, TRUE, 'HRMS'),
('mod.hr.documents', 'Documents', 'HR Documents', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.hr'), 6, 'HR', FALSE, TRUE, '/workspace/documents', 'FileText', TRUE, TRUE, 'HRMS'),

-- ━━━ ATTENDANCE MODULE ━━━
('mod.attendance', 'Attendance', 'Attendance Management', NULL, 20, 'ATTENDANCE', FALSE, TRUE, NULL, 'CalendarCheck', TRUE, TRUE, 'HRMS'),
('mod.attendance.daily', 'Daily Attendance', 'Daily Attendance', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.attendance'), 1, 'ATTENDANCE', FALSE, TRUE, '/workspace/attendance', 'Calendar', TRUE, TRUE, 'HRMS'),
('mod.attendance.leaves', 'Leave Management', 'Leave Requests', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.attendance'), 2, 'ATTENDANCE', FALSE, TRUE, '/workspace/leaves', 'CalendarOff', TRUE, TRUE, 'HRMS'),
('mod.attendance.holidays', 'Holidays', 'Holiday Calendar', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.attendance'), 3, 'ATTENDANCE', FALSE, TRUE, '/workspace/holidays', 'CalendarHeart', TRUE, TRUE, 'HRMS'),
('mod.attendance.shifts', 'Shifts', 'Shift Management', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.attendance'), 4, 'ATTENDANCE', FALSE, TRUE, '/workspace/shifts', 'Clock', TRUE, TRUE, 'HRMS'),
('mod.attendance.reports', 'Attendance Reports', 'Attendance Reports', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.attendance'), 5, 'ATTENDANCE', FALSE, TRUE, '/workspace/attendance/reports', 'BarChart', TRUE, TRUE, 'HRMS'),

-- ━━━ PAYROLL MODULE ━━━
('mod.payroll', 'Payroll', 'Payroll Management', NULL, 30, 'PAYROLL', FALSE, TRUE, NULL, 'Wallet', TRUE, TRUE, 'HRMS'),
('mod.payroll.salary', 'Salary Processing', 'Salary Processing', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.payroll'), 1, 'PAYROLL', FALSE, TRUE, '/workspace/payroll', 'DollarSign', TRUE, TRUE, 'HRMS'),
('mod.payroll.payslips', 'Payslips', 'Generate Payslips', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.payroll'), 2, 'PAYROLL', FALSE, TRUE, '/workspace/payroll/payslips', 'Receipt', TRUE, TRUE, 'HRMS'),
('mod.payroll.deductions', 'Deductions', 'Salary Deductions', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.payroll'), 3, 'PAYROLL', FALSE, TRUE, '/workspace/payroll/deductions', 'MinusCircle', TRUE, TRUE, 'HRMS'),
('mod.payroll.bonuses', 'Bonuses & Incentives', 'Bonuses', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.payroll'), 4, 'PAYROLL', FALSE, TRUE, '/workspace/payroll/bonuses', 'Gift', TRUE, TRUE, 'HRMS'),
('mod.payroll.reports', 'Payroll Reports', 'Payroll Reports', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.payroll'), 5, 'PAYROLL', FALSE, TRUE, '/workspace/payroll/reports', 'FileSpreadsheet', TRUE, TRUE, 'HRMS'),

-- ━━━ CRM MODULE ━━━
('mod.crm', 'CRM', 'Customer Relations', NULL, 40, 'CRM', FALSE, TRUE, NULL, 'Handshake', TRUE, TRUE, 'CRM'),
('mod.crm.leads', 'Leads', 'Lead Management', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.crm'), 1, 'CRM', FALSE, TRUE, '/workspace/crm/leads', 'UserPlus', TRUE, TRUE, 'CRM'),
('mod.crm.contacts', 'Contacts', 'Contact Database', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.crm'), 2, 'CRM', FALSE, TRUE, '/workspace/crm/contacts', 'Contact', TRUE, TRUE, 'CRM'),
('mod.crm.deals', 'Deals', 'Deal Pipeline', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.crm'), 3, 'CRM', FALSE, TRUE, '/workspace/crm/deals', 'TrendingUp', TRUE, TRUE, 'CRM'),
('mod.crm.tasks', 'Tasks', 'CRM Tasks', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.crm'), 4, 'CRM', FALSE, TRUE, '/workspace/crm/tasks', 'CheckSquare', TRUE, TRUE, 'CRM'),
('mod.crm.reports', 'CRM Reports', 'Sales Reports', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.crm'), 5, 'CRM', FALSE, TRUE, '/workspace/crm/reports', 'PieChart', TRUE, TRUE, 'CRM'),

-- ━━━ LMS MODULE ━━━
('mod.lms', 'LMS', 'Learning Management', NULL, 50, 'LMS', FALSE, TRUE, NULL, 'GraduationCap', TRUE, TRUE, 'EMS'),
('mod.lms.courses', 'Courses', 'Course Management', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.lms'), 1, 'LMS', FALSE, TRUE, '/workspace/lms/courses', 'BookOpen', TRUE, TRUE, 'EMS'),
('mod.lms.classes', 'Online Classes', 'Live Classes', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.lms'), 2, 'LMS', FALSE, TRUE, '/workspace/lms/classes', 'Video', TRUE, TRUE, 'EMS'),
('mod.lms.assessments', 'Assessments', 'Tests & Exams', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.lms'), 3, 'LMS', FALSE, TRUE, '/workspace/lms/assessments', 'FileCheck', TRUE, TRUE, 'EMS'),
('mod.lms.certificates', 'Certificates', 'Certificate Generation', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.lms'), 4, 'LMS', FALSE, TRUE, '/workspace/lms/certificates', 'Award', TRUE, TRUE, 'EMS'),
('mod.lms.attendance', 'LMS Attendance', 'Class Attendance', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.lms'), 5, 'LMS', FALSE, TRUE, '/workspace/lms/attendance', 'ClipboardCheck', TRUE, TRUE, 'EMS'),
('mod.lms.students', 'Student Directory', 'Student Management', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.lms'), 6, 'LMS', FALSE, TRUE, '/workspace/lms/students', 'Users', TRUE, TRUE, 'EMS'),
('mod.lms.batches', 'Batches', 'Batch Management', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.lms'), 7, 'LMS', FALSE, TRUE, '/workspace/lms/batches', 'Calendar', TRUE, TRUE, 'EMS'),

-- ━━━ FINANCE MODULE ━━━
('mod.finance', 'Finance', 'Finance & Accounting', NULL, 60, 'FINANCE', FALSE, TRUE, NULL, 'CircleDollarSign', TRUE, TRUE, 'FINANCE'),
('mod.finance.invoices', 'Invoices', 'Invoice Management', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.finance'), 1, 'FINANCE', FALSE, TRUE, '/workspace/finance/invoices', 'FileText', TRUE, TRUE, 'FINANCE'),
('mod.finance.payments', 'Payments', 'Payment Tracking', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.finance'), 2, 'FINANCE', FALSE, TRUE, '/workspace/finance/payments', 'CreditCard', TRUE, TRUE, 'FINANCE'),
('mod.finance.expenses', 'Expenses', 'Expense Management', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.finance'), 3, 'FINANCE', FALSE, TRUE, '/workspace/finance/expenses', 'Receipt', TRUE, TRUE, 'FINANCE'),
('mod.finance.ledger', 'Ledger', 'General Ledger', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.finance'), 4, 'FINANCE', FALSE, TRUE, '/workspace/finance/ledger', 'BookOpen', TRUE, TRUE, 'FINANCE'),
('mod.finance.reports', 'Financial Reports', 'Financial Reports', (SELECT id FROM app_auth.menu_registry WHERE menu_key = 'mod.finance'), 5, 'FINANCE', FALSE, TRUE, '/workspace/finance/reports', 'BarChart3', TRUE, TRUE, 'FINANCE'),

-- ━━━ REPORTS (Cross-Module) ━━━
('mod.reports', 'Reports', 'Analytics & Reports', NULL, 70, 'CORE', FALSE, TRUE, '/workspace/reports', 'BarChart2', TRUE, TRUE, NULL),

-- ━━━ ACCESS CONTROL ━━━
('mod.access', 'Access Control', 'User Permissions', NULL, 80, 'CORE', FALSE, TRUE, '/workspace/access', 'Lock', TRUE, TRUE, NULL)

ON CONFLICT (menu_key) DO UPDATE
SET 
    menu_name = EXCLUDED.menu_name,
    display_name = EXCLUDED.display_name,
    module_key = EXCLUDED.module_key,
    is_core = EXCLUDED.is_core,
    requires_subscription = EXCLUDED.requires_subscription,
    route = EXCLUDED.route,
    icon = EXCLUDED.icon,
    product = EXCLUDED.product,
    sort_order = EXCLUDED.sort_order;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. FUNCTION: Generate Company Menu Permissions from Template
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION core.apply_subscription_to_company(
    p_company_id BIGINT,
    p_template_id BIGINT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_template RECORD;
    v_menu_id BIGINT;
    v_modules JSONB;
    v_allowed_ids JSONB;
BEGIN
    -- Get template or company's existing configuration
    IF p_template_id IS NOT NULL THEN
        SELECT * INTO v_template FROM core.subscription_templates WHERE id = p_template_id;
        v_modules := v_template.enabled_modules;
        v_allowed_ids := v_template.allowed_menu_ids;
    ELSE
        SELECT enabled_modules, allowed_menu_ids INTO v_modules, v_allowed_ids
        FROM core.companies WHERE id = p_company_id;
    END IF;

    -- Clear existing menu permissions for this company
    DELETE FROM core.company_subscription_menus WHERE company_id = p_company_id;

    -- If specific menu IDs are provided, use them
    IF v_allowed_ids IS NOT NULL AND jsonb_array_length(v_allowed_ids) > 0 THEN
        FOR v_menu_id IN SELECT jsonb_array_elements_text(v_allowed_ids)::BIGINT
        LOOP
            INSERT INTO core.company_subscription_menus (company_id, menu_id, can_view, can_create, can_edit, can_delete)
            VALUES (p_company_id, v_menu_id, TRUE, TRUE, TRUE, TRUE)
            ON CONFLICT (company_id, menu_id) DO NOTHING;
        END LOOP;
    -- Otherwise, derive from modules
    ELSIF v_modules IS NOT NULL AND jsonb_array_length(v_modules) > 0 THEN
        INSERT INTO core.company_subscription_menus (company_id, menu_id, can_view, can_create, can_edit, can_delete)
        SELECT 
            p_company_id,
            mr.id,
            TRUE, TRUE, TRUE, TRUE
        FROM app_auth.menu_registry mr
        WHERE mr.is_active = TRUE
          AND (
              mr.is_core = TRUE  -- Always include core menus
              OR mr.module_key IN (SELECT jsonb_array_elements_text(v_modules))
          )
        ON CONFLICT (company_id, menu_id) DO NOTHING;
    ELSE
        -- Default: Only core menus
        INSERT INTO core.company_subscription_menus (company_id, menu_id, can_view, can_create, can_edit, can_delete)
        SELECT 
            p_company_id,
            mr.id,
            TRUE, TRUE, TRUE, TRUE
        FROM app_auth.menu_registry mr
        WHERE mr.is_active = TRUE AND mr.is_core = TRUE
        ON CONFLICT (company_id, menu_id) DO NOTHING;
    END IF;

    -- Update company's cached allowed_menu_ids
    UPDATE core.companies 
    SET allowed_menu_ids = (
        SELECT jsonb_agg(menu_id) 
        FROM core.company_subscription_menus 
        WHERE company_id = p_company_id AND is_active = TRUE
    ),
    subscription_template_id = p_template_id
    WHERE id = p_company_id;

    RAISE NOTICE 'Applied subscription to company %', p_company_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION core.apply_subscription_to_company IS 'Auto-generates menu permissions for a company based on subscription template';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 7. FUNCTION: Get Company Allowed Menus (for Frontend)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION core.get_company_allowed_menus(p_company_id BIGINT)
RETURNS TABLE(
    menu_id BIGINT,
    menu_key VARCHAR,
    menu_name VARCHAR,
    display_name VARCHAR,
    parent_menu_id BIGINT,
    route VARCHAR,
    icon VARCHAR,
    sort_order INTEGER,
    module_key VARCHAR,
    can_view BOOLEAN,
    can_create BOOLEAN,
    can_edit BOOLEAN,
    can_delete BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mr.id AS menu_id,
        mr.menu_key,
        mr.menu_name,
        mr.display_name,
        mr.parent_menu_id,
        mr.route,
        mr.icon,
        mr.sort_order,
        mr.module_key,
        csm.can_view,
        csm.can_create,
        csm.can_edit,
        csm.can_delete
    FROM app_auth.menu_registry mr
    INNER JOIN core.company_subscription_menus csm ON csm.menu_id = mr.id
    WHERE csm.company_id = p_company_id
      AND csm.is_active = TRUE
      AND mr.is_active = TRUE
      AND mr.is_visible = TRUE
    ORDER BY mr.sort_order, mr.id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION core.get_company_allowed_menus IS 'Returns allowed menus for company based on subscription';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 8. INDEXES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE INDEX IF NOT EXISTS idx_subscription_templates_code ON core.subscription_templates(code);
CREATE INDEX IF NOT EXISTS idx_subscription_templates_active ON core.subscription_templates(is_active, is_published);
CREATE INDEX IF NOT EXISTS idx_company_sub_menus_company ON core.company_subscription_menus(company_id);
CREATE INDEX IF NOT EXISTS idx_company_sub_menus_menu ON core.company_subscription_menus(menu_id);
CREATE INDEX IF NOT EXISTS idx_menu_registry_module ON app_auth.menu_registry(module_key);
CREATE INDEX IF NOT EXISTS idx_menu_registry_core ON app_auth.menu_registry(is_core);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 9. SEED PREDEFINED SUBSCRIPTION TEMPLATES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO core.subscription_templates (
    code, name, display_name, description, template_type, base_plan,
    monthly_price, yearly_price,
    max_users, max_employees, max_branches, max_departments, max_designations,
    enabled_modules, features, support_level, trial_days, is_active, is_published
) VALUES 
(
    'TPL-TRIAL',
    'Trial Template',
    'Trial Plan',
    'Experience all features free for 30 days',
    'PREDEFINED', 'TRIAL',
    0.00, 0.00,
    10, 10, 1, 5, 5,
    '["HR", "ATTENDANCE", "PAYROLL", "CRM", "LMS", "FINANCE"]'::jsonb,
    '["All Modules Unlocked", "Limited Users (10)", "30 Days Trial"]'::jsonb,
    'EMAIL', 30, TRUE, TRUE
),
(
    'TPL-BASIC',
    'Basic Template',
    'Basic Plan',
    'Essential features for small teams',
    'PREDEFINED', 'BASIC',
    2999.00, 29990.00,
    25, 25, 3, 10, 10,
    '["HR", "ATTENDANCE"]'::jsonb,
    '["Core HR", "Attendance Tracking", "25 Users", "3 Branches"]'::jsonb,
    'EMAIL', 0, TRUE, TRUE
),
(
    'TPL-STANDARD',
    'Standard Template',
    'Standard Plan',
    'Full-featured solution for growing companies',
    'PREDEFINED', 'STANDARD',
    5999.00, 59990.00,
    100, 100, 5, 25, 25,
    '["HR", "ATTENDANCE", "PAYROLL", "CRM"]'::jsonb,
    '["Everything in Basic", "Payroll", "CRM", "100 Users", "5 Branches"]'::jsonb,
    'PRIORITY', 0, TRUE, TRUE
),
(
    'TPL-ENTERPRISE',
    'Enterprise Template',
    'Enterprise Plan',
    'Unlimited power for large organizations',
    'PREDEFINED', 'ENTERPRISE',
    14999.00, 149990.00,
    0, 0, 0, 0, 0,
    '["HR", "ATTENDANCE", "PAYROLL", "CRM", "LMS", "FINANCE"]'::jsonb,
    '["Everything Unlimited", "All Modules", "24/7 Support", "Custom Integrations"]'::jsonb,
    '24X7', 0, TRUE, TRUE
)
ON CONFLICT (code) DO UPDATE
SET 
    name = EXCLUDED.name,
    display_name = EXCLUDED.display_name,
    enabled_modules = EXCLUDED.enabled_modules,
    features = EXCLUDED.features;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 10. VERIFICATION
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$
DECLARE
    v_templates INTEGER;
    v_menus INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_templates FROM core.subscription_templates;
    SELECT COUNT(*) INTO v_menus FROM app_auth.menu_registry WHERE menu_key LIKE 'mod.%';
    
    RAISE NOTICE '✅ Custom Subscription System Applied!';
    RAISE NOTICE '📋 Subscription Templates: %', v_templates;
    RAISE NOTICE '📝 Menu Registry Entries: %', v_menus;
    RAISE NOTICE '🔧 Functions: apply_subscription_to_company, get_company_allowed_menus';
END $$;
