'use strict';

/**
 * emailAgent.js
 *
 * Autonomous email classification agent.
 *
 * Responsibilities:
 *   1. Run on a cron schedule (default: every 5 minutes).
 *   2. Fetch all users with automation_enabled = true.
 *   3. For each user: fetch new emails via IMAP.
 *   4. Extract the sender domain from each email.
 *   5. Match domain against the user's company folders.
 *   6. Matched   → assign email to that company folder.
 *      No match  → auto-create a new company folder, then assign.
 *   7. Return classified email objects (storage happens in the next layer).
 */

const cron                = require('node-cron');
const emailService        = require('../services/emailService');
const EmailService        = require('../services/email.service');
const AgentSettingsModel  = require('../models/agentSettings.model');
const CompanyModel        = require('../models/company.model');

// ─── Constants ────────────────────────────────────────────────────────────────

const LOG_PREFIX    = '[EmailAgent]';
const DEFAULT_CRON  = '*/1 * * * *';   // every 1 minute
const FETCH_LIMIT   = 500;             // max emails to process per cycle
const IMAP_UID_CAP  = 1000;            // max UIDs pulled from IMAP per cycle
const BATCH_SIZE    = 50;              // UIDs per parallel IMAP connection

// ─── Helpers ──────────────────────────────────────────────────────────────────

const log  = (msg)  => console.log(`${LOG_PREFIX} ${msg}`);
const warn = (msg)  => console.warn(`${LOG_PREFIX} WARN  ${msg}`);
const err  = (msg)  => console.error(`${LOG_PREFIX} ERROR ${msg}`);

/**
 * Extract the domain part from an email address.
 * "hr@hcl.com" → "hcl.com"
 * Returns null for malformed / missing addresses.
 */
function extractDomain(emailAddress) {
  if (!emailAddress || typeof emailAddress !== 'string') return null;
  const parts = emailAddress.trim().toLowerCase().split('@');
  return parts.length === 2 && parts[1] ? parts[1] : null;
}

/**
 * Derive a human-readable company name from a domain.
 * "hcl.com"        → "HCL"
 * "capgemini.co.in" → "Capgemini"
 */
function domainToCompanyName(domain) {
  const apex = domain.split('.')[0];                    // first label
  return apex.charAt(0).toUpperCase() + apex.slice(1); // Title-case
}

/**
 * Resolve the IMAP config for a given user.
 *
 * Currently reads from environment variables (single shared inbox for dev /
 * demo). When per-user IMAP credential storage is added, replace this
 * function body with a DB lookup — the rest of the agent is unchanged.
 *
 * @param {number} userId
 * @returns {object|null}  IMAP config or null if not configured
 */
function resolveImapConfig(userId) {
  const { IMAP_HOST, IMAP_USER, IMAP_PASS } = process.env;

  if (!IMAP_HOST || !IMAP_USER || !IMAP_PASS) {
    warn(`No IMAP credentials configured for user ${userId} — skipping.`);
    return null;
  }

  return {
    host:   IMAP_HOST,
    port:   Number(process.env.IMAP_PORT)   || 993,
    secure: process.env.IMAP_SECURE !== 'false',
    user:   IMAP_USER,
    pass:   IMAP_PASS,
  };
}

// ─── Core classification logic ────────────────────────────────────────────────

/**
 * Classify a single parsed email for a user.
 *
 * Decision tree:
 *   sender domain → look up companies → found: use it
 *                                     → not found + autoCreate ON  → create folder
 *                                     → not found + autoCreate OFF → unclassified
 *
 * @param {object}  email        - parsed email from emailService
 * @param {number}  userId
 * @param {boolean} autoCreate   - whether unknown domains should get a new folder
 * @returns {Promise<object>} classifiedEmail — ready for storage
 */
async function classifyEmail(email, userId, autoCreate) {
  const senderEmail  = email.sender?.email || null;
  const senderDomain = extractDomain(senderEmail);

  // ── 1. No domain → unclassified ─────────────────────────────────────────
  if (!senderDomain) {
    warn(`UID ${email.uid}: cannot extract domain from "${senderEmail}" — marking unclassified.`);
    return buildClassifiedEmail(email, userId, null, 'unclassified');
  }

  // ── 2. Check existing company folders ────────────────────────────────────
  let company = await CompanyModel.findByDomainAndUser(senderDomain, userId);

  // ── 3. No match ───────────────────────────────────────────────────────────
  if (!company) {
    if (!autoCreate) {
      log(`UID ${email.uid}: domain "${senderDomain}" unknown & auto-create OFF → unclassified.`);
      return buildClassifiedEmail(email, userId, null, 'unclassified');
    }

    const companyName = domainToCompanyName(senderDomain);
    log(`UID ${email.uid}: domain "${senderDomain}" unknown → auto-creating folder "${companyName}".`);

    const newId = await CompanyModel.create({
      userId,
      companyName,
      emailDomain: senderDomain,
    });
    company = await CompanyModel.findById(newId);

    log(`UID ${email.uid}: folder created → id=${company.id} name="${company.company_name}".`);
    return buildClassifiedEmail(email, userId, company, 'auto_classified');
  }

  // ── 4. Match found ────────────────────────────────────────────────────────
  log(`UID ${email.uid}: domain "${senderDomain}" matched folder "${company.company_name}" (id=${company.id}).`);
  return buildClassifiedEmail(email, userId, company, 'classified');
}

/**
 * Build the final classified email object.
 * Shape is the storage contract — insert into `emails` table when ready.
 *
 * @param {object}      email
 * @param {number}      userId
 * @param {object|null} company
 * @param {string}      status   'classified' | 'auto_classified' | 'unclassified'
 */
function buildClassifiedEmail(email, userId, company, status) {
  return {
    // ── Identity ─────────────────────────────────────────────────────────
    uid:          email.uid,
    message_id:   email.messageId,

    // ── Classification ────────────────────────────────────────────────────
    user_id:      userId,
    company_id:   company?.id   || null,
    company_name: company?.company_name || null,
    status,                              // classified | auto_classified | unclassified

    // ── Email fields ──────────────────────────────────────────────────────
    sender_name:   email.sender?.name  || null,
    sender_email:  email.sender?.email || null,
    sender_domain: extractDomain(email.sender?.email),
    receiver:      email.to?.[0]?.email || null,
    subject:       email.subject,
    received_at:   email.date,
    body_text:     email.bodyText,
    body_html:     email.bodyHtml,

    // ── Read status ───────────────────────────────────────────────────────
    is_read:          email.isRead || false,   // mirrors IMAP \Seen flag

    // ── Attachment metadata ───────────────────────────────────────────────
    has_attachments:  email.hasAttachments,
    attachments:      email.attachments,    // array of metadata objects

    // ── Agent audit ───────────────────────────────────────────────────────
    classified_at: new Date(),
  };
}

// ─── Per-user processing ──────────────────────────────────────────────────────

/**
 * Full pipeline for one user:
 *   resolve IMAP → fetch emails → classify each → return results.
 *
 * @param {number} userId
 * @returns {Promise<object[]>} classified email objects
 */
async function processUser(userId, autoCreate = true) {
  log(`Processing user ${userId} … (auto-create: ${autoCreate ? 'ON' : 'OFF'})`);

  const imapConfig = resolveImapConfig(userId);
  if (!imapConfig) return [];

  // ── 1. Load last processed UID (null = first run → full sync) ──────────
  let lastUid = null;
  try {
    lastUid = await AgentSettingsModel.getLastUid(userId);
  } catch (e) {
    warn(`User ${userId}: could not load lastUid — ${e.message}`);
  }

  // ── 2. List all UIDs in the mailbox (incremental after first run) ───────
  let allUids;
  try {
    allUids = await emailService.listUids(imapConfig, { sinceUid: lastUid });
  } catch (e) {
    err(`User ${userId}: IMAP UID listing failed — ${e.message}`);
    return [];
  }

  if (!allUids.length) {
    log(`User ${userId}: no new emails (lastUid=${lastUid}).`);
    return [];
  }

  // Take the newest IMAP_UID_CAP UIDs from the full list, then cap at FETCH_LIMIT
  const targetUids = allUids.slice(-IMAP_UID_CAP).slice(-FETCH_LIMIT);
  log(`User ${userId}: ${allUids.length} new UID(s), fetching ${targetUids.length} in parallel batches of ${BATCH_SIZE} …`);

  // ── 3. Split into batches and fetch in parallel ──────────────────────────
  const batches = [];
  for (let i = 0; i < targetUids.length; i += BATCH_SIZE) {
    batches.push(targetUids.slice(i, i + BATCH_SIZE));
  }

  let emails;
  try {
    const batchResults = await Promise.all(
      batches.map(batch => emailService.fetchEmailsByUids(imapConfig, batch))
    );
    emails = batchResults.flat();
  } catch (fetchErr) {
    err(`User ${userId}: batch fetch failed — ${fetchErr.message}`);
    return [];
  }

  if (!emails.length) {
    log(`User ${userId}: no emails returned from fetch.`);
    return [];
  }

  log(`User ${userId}: fetched ${emails.length} email(s). Starting classification …`);

  // ── 4. Classify each email ───────────────────────────────────────────────
  const results = [];
  for (const email of emails) {
    try {
      const classified = await classifyEmail(email, userId, autoCreate);
      results.push(classified);
    } catch (classifyErr) {
      err(`User ${userId} UID ${email.uid}: classification failed — ${classifyErr.message}`);
    }
  }

  // ── 5. Persist the highest UID so next cycle is incremental ─────────────
  const maxUid = Math.max(...emails.map(e => e.uid));
  try {
    await AgentSettingsModel.saveLastUid(userId, maxUid);
    log(`User ${userId}: lastUid updated → ${maxUid}.`);
  } catch (e) {
    warn(`User ${userId}: could not save lastUid — ${e.message}`);
  }

  log(`User ${userId}: classified ${results.length}/${emails.length} email(s).`);
  return results;
}

// ─── Agent cycle ──────────────────────────────────────────────────────────────

/**
 * One full agent cycle:
 *   1. Get all users with automation ON.
 *   2. Process each user independently.
 *   3. Return a summary report.
 */
async function runCycle() {
  log('─── Cycle started ───────────────────────────────────────────');

  let enabledUsers;
  try {
    enabledUsers = await AgentSettingsModel.findAllEnabled();
  } catch (dbErr) {
    err(`Cannot load enabled users: ${dbErr.message}`);
    return;
  }

  if (!enabledUsers.length) {
    log('No users with automation enabled — cycle complete.');
    return;
  }

  log(`Active users: [${enabledUsers.map(r => r.user_id).join(', ')}]`);

  const report = { users: enabledUsers.length, totalClassified: 0, byUser: {} };

  for (const { user_id: userId, auto_create_folders } of enabledUsers) {
    const autoCreate  = Boolean(auto_create_folders);
    const classified  = await processUser(userId, autoCreate);
    report.byUser[userId]  = classified.length;
    report.totalClassified += classified.length;

    // ── Persist classified emails ────────────────────────────────────────
    if (classified.length) {
      const { saved, skipped } = await EmailService.saveMany(classified);
      log(`User ${userId}: saved=${saved} skipped(dup)=${skipped}.`);
    }
    // ────────────────────────────────────────────────────────────────────
  }

  // ── Purge empty company folders for every processed user ────────────────
  for (const { user_id: userId } of enabledUsers) {
    try {
      const removed = await CompanyModel.deleteEmpty(userId);
      if (removed > 0) log(`User ${userId}: removed ${removed} empty folder(s).`);
    } catch (cleanErr) {
      warn(`User ${userId}: empty-folder cleanup failed — ${cleanErr.message}`);
    }
  }

  log(`─── Cycle complete — ${report.totalClassified} email(s) classified across ${report.users} user(s). ───`);
  return report;
}

// ─── Public API ───────────────────────────────────────────────────────────────

let scheduledTask = null;

/**
 * Start the agent on a cron schedule.
 * Schedule can be overridden via AGENT_CRON_SCHEDULE env variable.
 */
function start() {
  const schedule = process.env.AGENT_CRON_SCHEDULE || DEFAULT_CRON;

  if (scheduledTask) {
    warn('Agent already running — ignoring duplicate start().');
    return;
  }

  if (!cron.validate(schedule)) {
    err(`Invalid cron schedule "${schedule}". Agent not started.`);
    return;
  }

  scheduledTask = cron.schedule(schedule, async () => {
    try {
      await runCycle();
    } catch (unexpectedErr) {
      err(`Unhandled error in cycle: ${unexpectedErr.message}`);
    }
  });

  log(`Started — schedule: "${schedule}" (next run in ~${cronDescription(schedule)}).`);

  // Run one cycle immediately on startup so emails appear without waiting for cron
  log('Running immediate startup cycle …');
  runCycle().catch(e => err(`Startup cycle failed: ${e.message}`));
}

/**
 * Stop the scheduled agent.
 */
function stop() {
  if (!scheduledTask) {
    warn('Agent is not running.');
    return;
  }
  scheduledTask.stop();
  scheduledTask = null;
  log('Stopped.');
}

/**
 * Trigger one immediate cycle outside the schedule.
 * Useful for testing or manual triggers.
 */
async function runOnce() {
  log('Manual run triggered.');
  return runCycle();
}

// ─── Internal ─────────────────────────────────────────────────────────────────

/** Human-readable hint about the cron interval (best-effort). */
function cronDescription(schedule) {
  const parts = schedule.split(' ');
  const minuteField = parts[0];
  const match = minuteField.match(/^\*\/(\d+)$/);
  return match ? `${match[1]} min` : 'next tick';
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { start, stop, runOnce };
