-- Migration: add is_read column to emails table
-- Run this once on existing databases (fresh installs get it via init.sql automatically).

USE smartmail_agent;

ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE
  AFTER attachment_names;
