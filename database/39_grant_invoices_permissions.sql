-- Grant permissions on ems.invoices table
-- Run AFTER: 36_create_invoices_table.sql
-- Reason: 34_grant_dynamic_roles_permissions.sql ran BEFORE invoices table was created,
-- so GRANT ALL ON ALL TABLES did NOT cover ems.invoices

GRANT ALL PRIVILEGES ON TABLE ems.invoices TO service_role, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE ems.invoices_id_seq TO service_role, anon, authenticated;
