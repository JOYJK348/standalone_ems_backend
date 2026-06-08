-- Migration: Add columns to ems.notifications needed by the notifications route
-- The route uses sender_id, target_type, target_role_level, branch_id, type, category, action_url
-- These columns were missing from the original CREATE TABLE, causing 500 errors

ALTER TABLE ems.notifications
    ADD COLUMN IF NOT EXISTS sender_id        BIGINT REFERENCES app_auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS target_type      VARCHAR(50) NOT NULL DEFAULT 'GLOBAL',
    ADD COLUMN IF NOT EXISTS target_role_level INTEGER,
    ADD COLUMN IF NOT EXISTS branch_id        BIGINT REFERENCES core.branches(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS type             VARCHAR(50),
    ADD COLUMN IF NOT EXISTS category         VARCHAR(50),
    ADD COLUMN IF NOT EXISTS action_url       VARCHAR(500);

-- Add indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_ems_notifications_sender ON ems.notifications(sender_id);
CREATE INDEX IF NOT EXISTS idx_ems_notifications_target ON ems.notifications(target_type, target_role_level);
CREATE INDEX IF NOT EXISTS idx_ems_notifications_branch ON ems.notifications(branch_id);
