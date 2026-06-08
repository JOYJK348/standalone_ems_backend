-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 20 - SUBSCRIPTION MASTER SYSTEM
-- Features: Indian-based pricing, Feature matrices, Editable plans
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SET search_path TO core, public;

-- 1. Subscription Plans Master Table
CREATE TABLE IF NOT EXISTS core.subscription_plans (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,  -- BASIC, PREMIUM, ENTERPRISE
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Pricing (INR Based)
    monthly_price DECIMAL(12, 2) DEFAULT 0.00,
    yearly_price DECIMAL(12, 2) DEFAULT 0.00,
    currency VARCHAR(10) DEFAULT 'INR',
    
    -- Feature Matrix (JSONB for flexibility)
    features JSONB DEFAULT '[]'::jsonb,
    
    -- Limits
    max_employees INTEGER DEFAULT 0, -- 0 for unlimited
    max_branches INTEGER DEFAULT 0,
    storage_limit_gb INTEGER DEFAULT 0,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_public BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT,
    updated_by BIGINT
);

-- 2. Seed Default Indian-Based Plans
INSERT INTO core.subscription_plans (name, display_name, description, monthly_price, yearly_price, features, max_employees, max_branches)
VALUES 
(
    'BASIC', 
    'Basic Growth', 
    'Essential ERP features for small businesses and startups in India.', 
    999.00, 
    9999.00, 
    '["Core HRMS", "Attendance Tracking", "Basic Reports", "Single Branch Support"]'::jsonb,
    25, 
    1
),
(
    'PREMIUM', 
    'Premium Operations', 
    'Scaling businesses requiring multi-branch support and advanced analytics.', 
    4999.00, 
    49999.00, 
    '["Full HRMS", "Payroll Automation", "Multi-Branch Operations", "Advanced Analytics", "LMS Integration"]'::jsonb,
    100, 
    5
),
(
    'ENTERPRISE', 
    'Enterprise Strategy', 
    'Unlimited power for large organizations with custom requirements.', 
    0.00, 
    0.00, 
    '["Everything in Premium", "Unlimited Branches", "Custom Domain", "Priority 24/7 Support", "API Access"]'::jsonb,
    0, 
    0
)
ON CONFLICT (name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    monthly_price = EXCLUDED.monthly_price,
    yearly_price = EXCLUDED.yearly_price,
    features = EXCLUDED.features;

-- 3. Subscription History / Tracking (Optional but good for audit)
CREATE TABLE IF NOT EXISTS core.subscription_history (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    plan_id BIGINT REFERENCES core.subscription_plans(id),
    
    -- Period
    start_date DATE NOT NULL,
    end_date DATE,
    
    -- Billing
    amount_paid DECIMAL(12, 2),
    payment_status VARCHAR(50) DEFAULT 'PAID',
    invoice_url TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Update core.companies to link to plan_id if needed, 
-- but we'll stick to string-based for now to match existing logic while augmenting with the master table.

-- Create Index
CREATE INDEX IF NOT EXISTS idx_sub_plans_is_active ON core.subscription_plans(is_active);

-- Permissions
GRANT ALL ON TABLE core.subscription_plans TO postgres;
GRANT ALL ON TABLE core.subscription_plans TO authenticated;
GRANT ALL ON TABLE core.subscription_plans TO service_role;
