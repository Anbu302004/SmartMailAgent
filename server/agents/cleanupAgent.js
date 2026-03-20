'use strict';

/**
 * cleanupAgent.js
 *
 * Monthly maintenance agent.
 * Automatically deletes email records older than 30 days and logs
 * every cleanup run to the cleanup_logs table.
 *
 * Schedule: 2:00 AM on the 1st of every month (configurable via env).
 */

const cron = require('node-cron');
const db   = require('../config/db');

// ─── Constants ────────────────────────────────────────────────────────────────

const LOG_PREFIX         = '[CleanupAgent]';
const DEFAULT_CRON       = '0 2 1 * *';   // 02:00 on the 1st of every month
const RETENTION_DAYS     = 30;

// ─── Logging ──────────────────────────────────────────────────────────────────

const log  = (msg) => console.log(`${LOG_PREFIX} ${msg}`);
const warn = (msg) => console.warn(`${LOG_PREFIX} WARN  ${msg}`);
const err  = (msg) => console.error(`${LOG_PREFIX} ERROR ${msg}`);

// ─── Core cleanup logic ───────────────────────────────────────────────────────

/**
 * Delete all emails whose created_at is older than RETENTION_DAYS.
 * Returns the number of deleted rows.
 */
async function deleteOldEmails() {
  const [result] = await db.execute(
    `DELETE FROM emails
      WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [RETENTION_DAYS]
  );
  return result.affectedRows;
}

/**
 * Persist a cleanup run to cleanup_logs.
 */
async function logCleanup(deletedRecords) {
  await db.execute(
    'INSERT INTO cleanup_logs (deleted_records) VALUES (?)',
    [deletedRecords]
  );
}

/**
 * Fetch the full cleanup history, newest first.
 */
async function getHistory() {
  const [rows] = await db.execute(
    `SELECT id, deleted_records, cleanup_date
       FROM cleanup_logs
      ORDER BY cleanup_date DESC`
  );
  return rows;
}

// ─── Run cycle ────────────────────────────────────────────────────────────────

/**
 * Execute one full cleanup cycle:
 *   1. Delete emails older than 30 days.
 *   2. Write a log entry (even when deleted_records = 0).
 *   3. Print a summary.
 */
async function runCycle() {
  log('─── Cleanup cycle started ───────────────────────────────────────');

  let deleted = 0;

  try {
    deleted = await deleteOldEmails();
    log(`Deleted ${deleted} email record(s) older than ${RETENTION_DAYS} days.`);
  } catch (deleteErr) {
    err(`Failed to delete old emails: ${deleteErr.message}`);
    // Still write a log entry to record the failed attempt
  }

  try {
    await logCleanup(deleted);
    log('Cleanup log entry saved.');
  } catch (logErr) {
    err(`Failed to save cleanup log: ${logErr.message}`);
  }

  log(`─── Cleanup cycle complete — ${deleted} record(s) removed. ───────`);
  return { deleted_records: deleted, cleanup_date: new Date() };
}

// ─── Public API ───────────────────────────────────────────────────────────────

let scheduledTask = null;

/**
 * Start the cleanup agent on its monthly cron schedule.
 * Schedule can be overridden via CLEANUP_CRON_SCHEDULE env variable.
 */
function start() {
  const schedule = process.env.CLEANUP_CRON_SCHEDULE || DEFAULT_CRON;

  if (scheduledTask) {
    warn('Agent already running — ignoring duplicate start().');
    return;
  }

  if (!cron.validate(schedule)) {
    err(`Invalid cron schedule "${schedule}". Cleanup agent not started.`);
    return;
  }

  scheduledTask = cron.schedule(schedule, async () => {
    try {
      await runCycle();
    } catch (unexpectedErr) {
      err(`Unhandled error in cycle: ${unexpectedErr.message}`);
    }
  });

  log(`Started — schedule: "${schedule}".`);
}

/**
 * Stop the scheduled cleanup agent.
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
 * Trigger one immediate cleanup cycle outside the schedule.
 * Useful for testing or ad-hoc runs.
 */
async function runOnce() {
  log('Manual run triggered.');
  return runCycle();
}

/**
 * Return the full cleanup history from cleanup_logs.
 */
async function history() {
  return getHistory();
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { start, stop, runOnce, history };
