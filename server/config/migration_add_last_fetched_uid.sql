-- Migration: add last_fetched_uid to agent_settings
-- Tracks the highest IMAP UID processed per user so the agent can do
-- incremental fetches instead of re-scanning the full inbox every cycle.

ALTER TABLE agent_settings
  ADD COLUMN last_fetched_uid INT NULL DEFAULT NULL
    COMMENT 'Highest IMAP UID fully processed; NULL = first run not yet complete';
