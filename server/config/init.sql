CREATE DATABASE IF NOT EXISTS smartmail_agent;

USE smartmail_agent;

CREATE TABLE IF NOT EXISTS users (
  id           INT          NOT NULL AUTO_INCREMENT,
  name         VARCHAR(100) NOT NULL,
  email        VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
);

CREATE TABLE IF NOT EXISTS companies (
  id           INT          NOT NULL AUTO_INCREMENT,
  user_id      INT          NOT NULL,
  company_name VARCHAR(150) NOT NULL,
  email_domain VARCHAR(255) NOT NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_company_domain_user (email_domain, user_id),
  CONSTRAINT fk_companies_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_settings (
  id                   INT       NOT NULL AUTO_INCREMENT,
  user_id              INT       NOT NULL,
  automation_enabled   BOOLEAN   NOT NULL DEFAULT FALSE,
  auto_create_folders  BOOLEAN   NOT NULL DEFAULT TRUE,
  updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_agent_settings_user (user_id),
  CONSTRAINT fk_agent_settings_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS emails (
  id               INT           NOT NULL AUTO_INCREMENT,
  message_id       VARCHAR(512)  NOT NULL,          -- RFC Message-ID; unique key for dedup
  user_id          INT           NOT NULL,           -- denormalized for fast user-scoped queries
  company_id       INT               NULL,           -- NULL = unclassified
  sender           VARCHAR(512)  NOT NULL,
  receiver         VARCHAR(512)      NULL,
  subject          VARCHAR(998)  NOT NULL DEFAULT '(no subject)',
  description      MEDIUMTEXT        NULL,           -- plain-text body
  attachment_names JSON              NULL,           -- ["file1.pdf", "file2.docx"]
  is_read          BOOLEAN       NOT NULL DEFAULT FALSE,  -- mirrors IMAP \Seen flag
  email_date       DATETIME          NULL,
  created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  -- Deduplication: never store the same email twice for the same user
  UNIQUE KEY uq_emails_message_user (message_id(255), user_id),

  -- Fast: all emails for a user, newest first
  INDEX idx_emails_user_date     (user_id, email_date DESC),

  -- Fast: all emails for a company folder, newest first
  INDEX idx_emails_company_date  (company_id, email_date DESC),

  -- Fast: search by sender domain
  INDEX idx_emails_sender        (sender(100)),

  CONSTRAINT fk_emails_user    FOREIGN KEY (user_id)    REFERENCES users     (id) ON DELETE CASCADE,
  CONSTRAINT fk_emails_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS cleanup_logs (
  id              INT       NOT NULL AUTO_INCREMENT,
  deleted_records INT       NOT NULL DEFAULT 0,
  cleanup_date    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_cleanup_date (cleanup_date DESC)
);
