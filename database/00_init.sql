-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- DURKKAS ERP - DATABASE INITIALIZATION
-- Durkkas Innovations Private Limited
-- Production-Ready | Supabase Compatible | Enterprise Grade
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- STEP 1: ENABLE REQUIRED EXTENSIONS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- UUID generation (for certificate verification, etc.)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- pgcrypto for password hashing
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Full-text search
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

COMMENT ON EXTENSION "uuid-ossp" IS 'UUID generation for unique identifiers';
COMMENT ON EXTENSION "pgcrypto" IS 'Cryptographic functions for password hashing';
COMMENT ON EXTENSION "pg_trgm" IS 'Trigram matching for fuzzy search';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- STEP 2: CREATE SCHEMAS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Core organizational schema
CREATE SCHEMA IF NOT EXISTS core;
COMMENT ON SCHEMA core IS 'Core organizational structure (companies, branches, employees, users)';

-- Authentication and authorization (RBAC)
CREATE SCHEMA IF NOT EXISTS app_auth;
COMMENT ON SCHEMA app_auth IS 'Authentication, RBAC, and security layer';

-- Education Management System (Students, Courses, Teachers) - Previously education
CREATE SCHEMA IF NOT EXISTS ems;
COMMENT ON SCHEMA ems IS 'Students, courses, teachers, batches, enrollments';

-- Human Resource Management System (Merged Employee Master, Strategic HR, Ops)
CREATE SCHEMA IF NOT EXISTS hrms;
COMMENT ON SCHEMA hrms IS 'Employee Master, attendance, leaves, payroll, recruitment, appraisals';

-- Finance and accounting
CREATE SCHEMA IF NOT EXISTS finance;
COMMENT ON SCHEMA finance IS 'Invoices, payments, accounting';

-- Back office operations
CREATE SCHEMA IF NOT EXISTS backoffice;
COMMENT ON SCHEMA backoffice IS 'Internal operations, support, governance';

-- Customer Relationship Management
CREATE SCHEMA IF NOT EXISTS crm;
COMMENT ON SCHEMA crm IS 'Lead management and conversion';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- STEP 3: VERIFY SCHEMA CREATION
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$
DECLARE
    schema_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO schema_count
    FROM information_schema.schemata
    WHERE schema_name IN ('core', 'app_auth', 'ems', 'hrms', 'finance', 'backoffice', 'crm');
    
    IF schema_count = 7 THEN
        RAISE NOTICE '✅ All 7 schemas created successfully';
    ELSE
        RAISE WARNING '⚠️  Expected 7 schemas, found %', schema_count;
    END IF;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- STEP 4: SET DEFAULT SEARCH PATH
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Set search path for current session
SET search_path TO core, app_auth, hrms, ems, finance, backoffice, crm, public;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- INITIALIZATION COMPLETE
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Next steps:
-- 1. Run 01_core_schema.sql
-- 2. Run 02_auth_schema.sql
-- 3. Run 03_ems_schema.sql (Updated to EMS/Education)
-- 4. Run 08_hrms_schema.sql (Updated to HRMS)
-- 5. Run 05_finance_schema.sql
-- 6. Run 06_backoffice_schema.sql
-- 7. Run 07_crm_schema.sql
