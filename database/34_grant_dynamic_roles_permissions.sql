-- Grant permissions on ems.dynamic_roles and ems.dynamic_user_roles
-- Run AFTER: 32_dynamic_roles_layer.sql

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ems TO service_role, anon, authenticated;
GRANT USAGE ON SCHEMA ems TO service_role, anon, authenticated;

-- Specifically grant on the dynamic role tables
GRANT ALL PRIVILEGES ON TABLE ems.dynamic_roles TO service_role, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE ems.dynamic_user_roles TO service_role, anon, authenticated;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ems TO service_role, anon, authenticated;
