-- ============================================================================
-- Migration 48: Grant permissions on practice lab tables
-- ============================================================================

-- Grant schema usage
GRANT USAGE ON SCHEMA ems TO service_role;

-- Grant all privileges on new practice tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ems TO service_role;

-- Ensure future tables in ems schema also get permissions
ALTER DEFAULT PRIVILEGES IN SCHEMA ems GRANT ALL PRIVILEGES ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA ems GRANT ALL PRIVILEGES ON SEQUENCES TO service_role;

-- Explicit grants for new practice tables (in case defaults don't apply)
GRANT ALL PRIVILEGES ON TABLE ems.practice_quotas TO service_role;
GRANT ALL PRIVILEGES ON TABLE ems.student_practice_allocations TO service_role;
GRANT ALL PRIVILEGES ON TABLE ems.practice_gst_entries TO service_role;
GRANT ALL PRIVILEGES ON TABLE ems.practice_tds_entries TO service_role;
GRANT ALL PRIVILEGES ON TABLE ems.practice_it_returns TO service_role;

-- Also grant to anon key for public access (if needed)
GRANT USAGE ON SCHEMA ems TO anon;
GRANT ALL PRIVILEGES ON TABLE ems.practice_quotas TO anon;
GRANT ALL PRIVILEGES ON TABLE ems.student_practice_allocations TO anon;
GRANT ALL PRIVILEGES ON TABLE ems.practice_gst_entries TO anon;
GRANT ALL PRIVILEGES ON TABLE ems.practice_tds_entries TO anon;
GRANT ALL PRIVILEGES ON TABLE ems.practice_it_returns TO anon;
