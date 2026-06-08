-- ============================================================================
-- Migration 80: Practice Lab Seed Data — Scenarios, HSN, Sections, Tax Slabs
-- ============================================================================

-- HSN/SAC Codes for GST practice
CREATE TABLE IF NOT EXISTS ems.practice_hsn_codes (
    id BIGSERIAL PRIMARY KEY,
    hsn_code TEXT NOT NULL,
    description TEXT NOT NULL,
    gst_rate NUMERIC(5,2) NOT NULL,
    category TEXT NOT NULL
);

INSERT INTO ems.practice_hsn_codes (hsn_code, description, gst_rate, category) VALUES
('8471', 'Laptops & Computers', 18, 'Electronics'),
('8473', 'Computer Accessories', 18, 'Electronics'),
('8517', 'Mobile Phones', 18, 'Electronics'),
('8528', 'TV & Monitors', 18, 'Electronics'),
('6109', 'T-shirts & Garments', 5, 'Apparel'),
('6204', 'Suits & Dresses', 12, 'Apparel'),
('6403', 'Footwear (>₹1k)', 18, 'Footwear'),
('6404', 'Footwear (<₹1k)', 5, 'Footwear'),
('1905', 'Biscuits & Bakery', 18, 'Food'),
('0402', 'Milk Powder', 5, 'Food'),
('2101', 'Coffee/Tea', 18, 'Beverages'),
('2202', 'Soft Drinks', 28, 'Beverages'),
('3003', 'Pharmaceuticals', 12, 'Healthcare'),
('3304', 'Cosmetics', 28, 'Personal Care'),
('3401', 'Soaps', 18, 'Personal Care'),
('3924', 'Plastic Houseware', 18, 'Household'),
('4818', 'Paper Products', 12, 'Stationery'),
('4901', 'Books & Print', 0, 'Education'),
('7323', 'Steel Utensils', 18, 'Household'),
('8443', 'Printers & Parts', 18, 'Electronics')
ON CONFLICT DO NOTHING;

-- TDS Sections for practice
CREATE TABLE IF NOT EXISTS ems.practice_tds_sections (
    id BIGSERIAL PRIMARY KEY,
    section_code TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    tds_rate NUMERIC(5,2) NOT NULL,
    threshold_amount NUMERIC(12,2),
    applicable_to TEXT NOT NULL,
    example_hint TEXT NOT NULL
);

INSERT INTO ems.practice_tds_sections (section_code, description, tds_rate, threshold_amount, applicable_to, example_hint) VALUES
('192A', 'Salary (Government)', 10, 250000, 'Government employees', 'Salary ₹8L/month, TDS = (8L - 2.5L) × 10%'),
('192B', 'Salary (Non-Government)', 10, 250000, 'Private employees', 'Monthly salary, calculate annual + slab'),
('194A', 'Interest on Securities', 10, 5000, 'Banks, Companies', 'FD interest ₹50k, TDS = (50k - 5k) × 10%'),
('194C', 'Contractors', 1, 30000, 'Individual/HUF Contractors', 'Contractor gets ₹1L, TDS = (1L - 30k) × 1%'),
('194H', 'Commission/Brokerage', 5, 15000, 'Agents, Brokers', 'Commission ₹50k, TDS = 50k × 5%'),
('194I', 'Rent', 10, 240000, 'Landlord/Tenant', 'Monthly rent ₹25k, Annual = 3L, TDS = (3L) × 10%'),
('194J', 'Professional Services', 10, 30000, 'Doctors, Lawyers, Consultants', 'Consultancy ₹75k, TDS = 75k × 10%'),
('194J(2)', 'Technical Services', 10, 30000, 'IT, Engineering Services', 'Software dev fees ₹2L, TDS = 2L × 10%'),
('194LA', 'Compulsory Acquisition', 10, 250000, 'Land Acquisition', 'Compensation ₹10L, TDS = (10L - 2.5L) × 10%'),
('194M', 'Contractor/Commission (Individual)', 5, 50000, 'Individuals/HUF', 'Payment to plumber ₹60k, TDS = 60k × 5%')
ON CONFLICT DO NOTHING;

-- Income Tax Slabs (New Regime FY 2024-25)
CREATE TABLE IF NOT EXISTS ems.practice_tax_slabs (
    id BIGSERIAL PRIMARY KEY,
    regime TEXT NOT NULL,
    min_income NUMERIC(12,2) NOT NULL,
    max_income NUMERIC(12,2),
    rate NUMERIC(5,2) NOT NULL,
    cess_rate NUMERIC(5,2) NOT NULL DEFAULT 4,
    fy_year TEXT NOT NULL
);

INSERT INTO ems.practice_tax_slabs (regime, min_income, max_income, rate, fy_year) VALUES
('NEW', 0, 300000, 0, '2024-25'),
('NEW', 300000, 600000, 5, '2024-25'),
('NEW', 600000, 900000, 10, '2024-25'),
('NEW', 900000, 1200000, 15, '2024-25'),
('NEW', 1200000, 1500000, 20, '2024-25'),
('NEW', 1500000, 999999999, 30, '2024-25'),
('OLD', 0, 250000, 0, '2024-25'),
('OLD', 250000, 500000, 5, '2024-25'),
('OLD', 500000, 1000000, 20, '2024-25'),
('OLD', 1000000, 999999999, 30, '2024-25')
ON CONFLICT DO NOTHING;

-- 80C Deductions
CREATE TABLE IF NOT EXISTS ems.practice_deduction_types (
    id BIGSERIAL PRIMARY KEY,
    section TEXT NOT NULL,
    deduction_name TEXT NOT NULL,
    max_limit NUMERIC(12,2),
    description TEXT NOT NULL
);

INSERT INTO ems.practice_deduction_types (section, deduction_name, max_limit, description) VALUES
('80C', 'PPF', 150000, 'Public Provident Fund — max ₹1.5L/year'),
('80C', 'LIC Premium', 150000, 'Life Insurance premium paid for self/family'),
('80C', 'ELSS', 150000, 'Equity Linked Savings Scheme — 3yr lock-in'),
('80C', 'EPF', 150000, 'Employee Provident Fund contribution'),
('80C', 'Tuition Fees', 150000, 'For 2 children, full-time education'),
('80C', 'Home Loan Principal', 150000, 'Principal repayment of housing loan'),
('80C', 'NPS (80CCD(1B))', 50000, 'Additional NPS deduction over 80C'),
('80D', 'Health Insurance (Self <60)', 25000, 'Medical insurance premium for self & family'),
('80D', 'Health Insurance (Self ≥60)', 50000, 'Senior citizen health insurance'),
('80D', 'Parents Health (<60)', 25000, 'Medical insurance premium for parents'),
('80D', 'Parents Health (≥60)', 50000, 'Senior citizen parents insurance'),
('80E', 'Education Loan', 999999, 'Interest on education loan — no upper limit'),
('80G', 'Donations', 999999, 'Donations to specified funds (50%/100% deduction)'),
('24(b)', 'Home Loan Interest', 200000, 'Interest on housing loan — max ₹2L')
ON CONFLICT DO NOTHING;

-- Scenarios for practice
CREATE TABLE IF NOT EXISTS ems.practice_scenarios (
    id BIGSERIAL PRIMARY KEY,
    module_type TEXT NOT NULL CHECK (module_type IN ('GST', 'TDS', 'INCOME_TAX')),
    difficulty TEXT NOT NULL CHECK (difficulty IN ('BEGINNER', 'EASY', 'MEDIUM', 'HARD')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    setup_data JSONB NOT NULL DEFAULT '{}',
    expected_hints JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO ems.practice_scenarios (module_type, difficulty, title, description, setup_data, expected_hints) VALUES
-- GST Scenarios
('GST', 'BEGINNER', 'Sell a Laptop to Mumbai Customer',
 'You run "TechPro Solutions" in Chennai. Sell 1 laptop (HSN 8471, ₹50,000) to a customer in Mumbai (Maharashtra — Inter-state supply).',
 '{"gstin":"33ABCDE1234F1Z5","business_name":"TechPro Solutions","default_state":"Tamil Nadu"}',
 '["Inter-state → Use IGST", "Laptop HSN: 8471 (18% GST)", "Taxable Value: ₹50,000", "IGST = 50,000 × 18% = ₹9,000"]'),

('GST', 'BEGINNER', 'Sell Garments to Local Customer',
 'You run "Fashion Hub" in Coimbatore. Sell T-shirts (HSN 6109, ₹20,000) to a customer in Chennai (Intra-state).',
 '{"gstin":"33FGHIJ5678K1Z5","business_name":"Fashion Hub","default_state":"Tamil Nadu"}',
 '["Intra-state → Use CGST + SGST", "T-shirt HSN: 6109 (5% GST)", "CGST = 2.5%, SGST = 2.5%", "Each = ₹500"]'),

('GST', 'EASY', 'Restaurant Supply Chain',
 'Your restaurant "Spice Kitchen" in Bangalore supplies ₹1,20,000 worth of food to a caterer in Mysore (Intra-state Karnataka).',
 '{"gstin":"29KLMNO9012P1Z5","business_name":"Spice Kitchen","default_state":"Karnataka"}',
 '["Intra-state → CGST + SGST", "Restaurant food: 5% GST", "CGST = 2.5%, SGST = 2.5%", "Each = ₹3,000"]'),

('GST', 'MEDIUM', 'Export Electronics to USA',
 'Export 100 mobile phones (HSN 8517, ₹5,000 each) to "BestBuy Inc., USA" — export invoice with LUT. Total value: ₹5,00,000.',
 '{"gstin":"33PQRST3456U1Z5","business_name":"ElectroWorld","default_state":"Tamil Nadu"}',
 '["Exports: Zero-rated supply (0% GST)", "Claim refund of ITC", "Need LUT/bond submission", "Invoice: ₹5,00,000, GST = ₹0"]'),

('GST', 'HARD', 'Mixed Supply with Different Rates',
 'Supply 50 laptops (HSN 8471, ₹40,000 each) AND 200 T-shirts (HSN 6109, ₹500 each) to "ABC Corp, Pune" (Inter-state).',
 '{"gstin":"27UVWXY7890Z1Z5","business_name":"MegaSupplies Inc","default_state":"Gujarat"}',
 '["Mixed supply: HSN 8471 (18%) + HSN 6109 (5%)", "Laptops: 50 × 40k = ₹20L → IGST = ₹3.6L", "T-shirts: 200 × 500 = ₹1L → IGST = ₹5,000"]'),

-- TDS Scenarios
('TDS', 'BEGINNER', 'Contractor Payment',
 'Pay ₹50,000 to "Ravi Constructions" (Individual contractor) for repair work. Section 194C applies.',
 '{}',
 '["Section: 194C — Contractor (Individual/HUF)", "TDS Rate: 1%", "TDS = 50,000 × 1% = ₹500"]'),

('TDS', 'BEGINNER', 'Professional Fees to Doctor',
 'Pay ₹75,000 consultation fees to "Dr. Sharma". Section 194J applies.',
 '{}',
 '["Section: 194J — Professional Services", "TDS Rate: 10%", "TDS = 75,000 × 10% = ₹7,500"]'),

('TDS', 'EASY', 'Rent Payment',
 'Pay monthly rent of ₹30,000 to landlord "Mr. Verma" for office space. Section 194I applies.',
 '{}',
 '["Section: 194I — Rent of Land/Building", "TDS Rate: 10%", "Annual rent: 30,000 × 12 = ₹3,60,000", "TDS = 3,60,000 × 10% = ₹36,000/year"]'),

-- Income Tax Scenarios
('INCOME_TAX', 'BEGINNER', 'Salaried Employee — Simple Return',
 'Ravi (age 28) has salary income of ₹6,00,000. He invested ₹50,000 in PPF (80C). Calculate tax under NEW regime.',
 '{}',
 '["Gross Income: ₹6,00,000", "80C Deduction: ₹50,000", "Taxable: ₹5,50,000", "New Regime: 0-3L = ₹0, 3-5L = ₹10,000, 5-5.5L = ₹2,500", "Total Tax: ₹12,500 + 4% Cess"]'),

('INCOME_TAX', 'EASY', 'Salary + House Property',
 'Priya (age 35) has salary ₹9,00,000. She owns a house with rental income ₹1,20,000, municipal tax ₹12,000, home loan interest ₹1,80,000.',
 '{}',
 '["Salary: ₹9,00,000", "House Income: 1,20,000 - 30% (std deduction) - 12,000 (tax) - 1,80,000 (interest) = ₹ -1,08,000", "Gross: ₹7,92,000", "Tax under New Regime: slab rates apply"]')
ON CONFLICT DO NOTHING;

-- Permission grants for new tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ems TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA ems GRANT ALL PRIVILEGES ON TABLES TO service_role;
