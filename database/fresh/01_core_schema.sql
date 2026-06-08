-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 01 - CORE SCHEMA (ORGANIZATIONAL FOUNDATION)
-- Durkkas Innovations Private Limited
-- Multi-Tenant SaaS | Production-Ready | Enterprise Grade
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Drop and Recreate Schema (CAUTION: This will delete ALL data in core)
DROP SCHEMA IF EXISTS core CASCADE;
CREATE SCHEMA core;

-- Set Search Path
SET search_path TO core, public;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. COMPANIES (MULTI-TENANT ROOT)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS core.companies (
    id BIGSERIAL PRIMARY KEY,
    
    -- Company Details
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    legal_name VARCHAR(255),
    
    -- Contact Information
    email VARCHAR(255),
    phone VARCHAR(20),
    website VARCHAR(255),
    
    -- Address
    address_line1 TEXT,
    address_line2 TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100) DEFAULT 'India',
    postal_code VARCHAR(20),
    
    -- Tax & Legal
    tax_id VARCHAR(50),  -- GST/VAT/TIN
    pan_number VARCHAR(20),
    registration_number VARCHAR(100),
    
    -- Subscription & Status
    subscription_plan VARCHAR(50) DEFAULT 'TRIAL',  -- TRIAL, BASIC, PREMIUM, ENTERPRISE
    subscription_start_date DATE,
    subscription_end_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT,
    updated_by BIGINT
);

COMMENT ON TABLE core.companies IS 'Multi-tenant root: Each company is a separate tenant';
COMMENT ON COLUMN core.companies.code IS 'Unique company code (used in URLs, APIs)';
COMMENT ON COLUMN core.companies.subscription_plan IS 'Subscription tier for billing';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. BRANCHES (ORGANIZATIONAL HIERARCHY)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS core.branches (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    
    -- Branch Details
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    branch_type VARCHAR(50) DEFAULT 'BRANCH',  -- HEAD_OFFICE, BRANCH, WAREHOUSE
    
    -- Contact
    email VARCHAR(255),
    phone VARCHAR(20),
    
    -- Address
    address_line1 TEXT,
    address_line2 TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100) DEFAULT 'India',
    postal_code VARCHAR(20),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_head_office BOOLEAN DEFAULT FALSE,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT,
    updated_by BIGINT,
    
    -- Soft Delete
    deleted_at TIMESTAMPTZ,
    deleted_by BIGINT,
    delete_reason TEXT,
    
    UNIQUE(company_id, code)
);

COMMENT ON TABLE core.branches IS 'Company branches/locations';
COMMENT ON COLUMN core.branches.is_head_office IS 'Mark primary/head office branch';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. DEPARTMENTS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS core.departments (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    branch_id BIGINT REFERENCES core.branches(id),
    
    -- Department Details
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    description TEXT,
    
    -- Hierarchy
    parent_department_id BIGINT REFERENCES core.departments(id),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT,
    updated_by BIGINT,
    
    UNIQUE(company_id, code)
);

COMMENT ON TABLE core.departments IS 'Organizational departments';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. DESIGNATIONS (JOB TITLES)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS core.designations (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    
    -- Designation Details
    title VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    description TEXT,
    
    -- Hierarchy
    level INTEGER DEFAULT 0,  -- 0=Entry, 1=Junior, 2=Mid, 3=Senior, 4=Lead, 5=Manager
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT,
    updated_by BIGINT,
    
    UNIQUE(company_id, code)
);

COMMENT ON TABLE core.designations IS 'Job titles and positions';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. EMPLOYEES (MASTER RECORD)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS core.employees (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    branch_id BIGINT REFERENCES core.branches(id),
    department_id BIGINT REFERENCES core.departments(id),
    designation_id BIGINT REFERENCES core.designations(id),
    
    -- Employee Code
    employee_code VARCHAR(50) NOT NULL,
    
    -- Personal Information
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    last_name VARCHAR(100),
    date_of_birth DATE,
    gender VARCHAR(20),
    
    -- Contact
    email VARCHAR(255),
    phone VARCHAR(20),
    alternate_phone VARCHAR(20),
    
    -- Address
    address_line1 TEXT,
    address_line2 TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100) DEFAULT 'India',
    postal_code VARCHAR(20),
    
    -- Employment
    date_of_joining DATE,
    date_of_leaving DATE,
    employment_type VARCHAR(50) DEFAULT 'FULL_TIME',  -- FULL_TIME, PART_TIME, CONTRACT, INTERN
    
    -- Reporting
    reporting_manager_id BIGINT REFERENCES core.employees(id),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT,
    updated_by BIGINT,
    
    UNIQUE(company_id, employee_code)
);

COMMENT ON TABLE core.employees IS 'Master employee record - single source of truth for all staff';
COMMENT ON COLUMN core.employees.employee_code IS 'Unique employee identifier within company';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. LOCATION MASTER DATA (GLOBAL)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS core.countries (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(10) NOT NULL UNIQUE,  -- ISO 3166-1 alpha-2
    phone_code VARCHAR(10),
    currency_code VARCHAR(10),
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS core.states (
    id BIGSERIAL PRIMARY KEY,
    country_id BIGINT NOT NULL REFERENCES core.countries(id),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(10),
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(country_id, code)
);

CREATE TABLE IF NOT EXISTS core.cities (
    id BIGSERIAL PRIMARY KEY,
    state_id BIGINT NOT NULL REFERENCES core.states(id),
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

COMMENT ON TABLE core.countries IS 'Global country master (shared across all tenants)';
COMMENT ON TABLE core.states IS 'State/province master';
COMMENT ON TABLE core.cities IS 'City master';

CREATE TABLE IF NOT EXISTS core.locations (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    branch_id BIGINT REFERENCES core.branches(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    address_line1 TEXT,
    address_line2 TEXT,
    city_id BIGINT REFERENCES core.cities(id),
    pincode VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT,
    updated_by BIGINT
);

COMMENT ON TABLE core.locations IS 'Detailed locations/facilities within branches';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- INDEXES (PERFORMANCE OPTIMIZATION)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Companies
CREATE INDEX IF NOT EXISTS idx_companies_code ON core.companies(code);
CREATE INDEX IF NOT EXISTS idx_companies_is_active ON core.companies(is_active);

-- Branches
CREATE INDEX IF NOT EXISTS idx_branches_company_id ON core.branches(company_id);
CREATE INDEX IF NOT EXISTS idx_branches_is_active ON core.branches(is_active);

-- Departments
CREATE INDEX IF NOT EXISTS idx_departments_company_id ON core.departments(company_id);
CREATE INDEX IF NOT EXISTS idx_departments_branch_id ON core.departments(branch_id);

-- Designations
CREATE INDEX IF NOT EXISTS idx_designations_company_id ON core.designations(company_id);

-- Employees (CRITICAL for multi-tenant filtering)
CREATE INDEX IF NOT EXISTS idx_employees_company_id ON core.employees(company_id);
CREATE INDEX IF NOT EXISTS idx_employees_branch_id ON core.employees(branch_id);
CREATE INDEX IF NOT EXISTS idx_employees_department_id ON core.employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_is_active ON core.employees(is_active);
CREATE INDEX IF NOT EXISTS idx_employees_email ON core.employees(email);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TRIGGERS (AUTO-UPDATE TIMESTAMPS)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION core.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE table_schema = 'core' 
        AND column_name = 'updated_at'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS update_%I_updated_at ON core.%I', t, t);
        EXECUTE format('CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON core.%I FOR EACH ROW EXECUTE FUNCTION core.update_updated_at_column()', t, t);
    END LOOP;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- BOOTSTRAP DATA (DEMO COMPANIES FOR TESTING)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Insert demo companies
INSERT INTO core.companies (name, code, email, phone, subscription_plan, is_active) VALUES
('ABC School', 'ABC', 'admin@abcschool.com', '9876543210', 'PREMIUM', TRUE),
('XYZ College', 'XYZ', 'admin@xyzcollege.com', '9876543211', 'ENTERPRISE', TRUE)
ON CONFLICT (code) DO NOTHING;

-- Insert India (for location master)
INSERT INTO core.countries (name, code, phone_code, currency_code) VALUES
('India', 'IN', '+91', 'INR')
ON CONFLICT (code) DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 7. ACADEMIC YEARS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS core.academic_years (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT,
    updated_by BIGINT,
    UNIQUE(company_id, name)
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 8. GLOBAL SETTINGS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS core.global_settings (
    id BIGSERIAL PRIMARY KEY,
    "group" VARCHAR(100) DEFAULT 'GENERAL',
    "key" VARCHAR(255) NOT NULL UNIQUE,
    "value" TEXT,
    description TEXT,
    is_system_setting BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT,
    updated_by BIGINT
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- END OF CORE SCHEMA
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
