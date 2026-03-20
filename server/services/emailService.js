/**
 * emailService.js
 *
 * Connects to an IMAP inbox, fetches emails, and returns structured
 * parsed email objects. Does NOT persist any data.
 *
 * Packages:
 *   imapflow  – modern promise-based IMAP client
 *   mailparser – MIME parser (Nodemailer team)
 */

'use strict';

const { ImapFlow }   = require('imapflow');
const { simpleParser } = require('mailparser');

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_MAILBOX = 'INBOX';
const DEFAULT_FETCH_LIMIT = 20;        // how many emails to pull per call

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Build an ImapFlow client from a plain config object.
 * Config shape mirrors what callers pass (no env coupling).
 */
function buildClient(config) {
  return new ImapFlow({
    host:    config.host,
    port:    config.port    || 993,
    secure:  config.secure  !== false,   // TLS by default
    auth: {
      user: config.user,
      pass: config.pass,
    },
    logger: false,   // suppress verbose IMAP logs; set to console for debugging
  });
}

/**
 * Parse a raw RFC-2822 email buffer with mailparser.
 * Returns a clean, flat object — no mailparser internals leak out.
 */
async function parseRawEmail(rawBuffer) {
  const parsed = await simpleParser(rawBuffer);

  // ── Sender ──────────────────────────────────────────────────────────────
  const from = parsed.from?.value?.[0] ?? null;
  const sender = from
    ? { name: from.name || null, email: from.address }
    : null;

  // ── Recipients ──────────────────────────────────────────────────────────
  const extractAddresses = (field) =>
    (field?.value ?? []).map((a) => ({ name: a.name || null, email: a.address }));

  const to  = extractAddresses(parsed.to);
  const cc  = extractAddresses(parsed.cc);
  const bcc = extractAddresses(parsed.bcc);

  // ── Attachments (metadata only — no binary content) ─────────────────────
  const attachments = (parsed.attachments ?? []).map((att) => ({
    filename:    att.filename    || null,
    contentType: att.contentType || null,
    size:        att.size        || 0,          // bytes
    contentId:   att.contentId   || null,       // for inline images
    disposition: att.contentDisposition || null,
  }));

  // Strip all HTML tags completely, then limit lengths to avoid max_allowed_packet errors
  const stripHtml   = (str) => (str || '').replace(/<[^>]*>/g, '').trim();
  const safeSubject = (parsed.subject || '(no subject)').substring(0, 150);
  const safeBody    = stripHtml(parsed.text || parsed.html).substring(0, 500);

  return {
    messageId: parsed.messageId || null,
    subject:   safeSubject,
    date:      parsed.date      || null,          // JS Date object
    sender,
    to,
    cc,
    bcc,
    bodyText: safeBody || null,   // plain-text only, HTML stripped, max 500 chars
    bodyHtml: null,               // not stored — body_text is the canonical field
    attachments,
    hasAttachments: attachments.length > 0,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch and parse emails from an IMAP mailbox.
 *
 * @param {object} config          - IMAP credentials
 * @param {string}  config.host    - IMAP server hostname
 * @param {number}  config.port    - port (default 993)
 * @param {boolean} config.secure  - use TLS (default true)
 * @param {string}  config.user    - email address / username
 * @param {string}  config.pass    - password or app password
 *
 * @param {object} [options]
 * @param {string}  [options.mailbox]    - mailbox to open (default 'INBOX')
 * @param {number}  [options.limit]      - max emails to fetch (default 20)
 * @param {boolean} [options.unreadOnly] - fetch only unseen emails (default false)
 * @param {boolean} [options.markSeen]   - mark fetched emails as seen (default false)
 *
 * @returns {Promise<object[]>} array of parsed email objects
 */
async function fetchEmails(config, options = {}) {
  if (!config?.host || !config?.user || !config?.pass) {
    throw new Error('emailService.fetchEmails: host, user and pass are required');
  }

  const mailbox    = options.mailbox    || DEFAULT_MAILBOX;
  const limit      = options.limit      || DEFAULT_FETCH_LIMIT;
  const unreadOnly = options.unreadOnly || false;
  const markSeen   = options.markSeen   || false;

  const client = buildClient(config);
  const emails = [];

  try {
    await client.connect();

    const status = await client.status(mailbox, { messages: true, unseen: true });

    const total    = status.messages;
    const fetchSeq = buildSequenceRange(total, limit);

    if (!fetchSeq) return [];   // empty mailbox

    await client.mailboxOpen(mailbox, { readOnly: !markSeen });

    const searchCriteria = unreadOnly ? { seen: false } : { all: true };
    const uids = await client.search(searchCriteria, { uid: true });

    if (!uids.length) return [];

    // Take the most-recent `limit` UIDs (server returns ascending order)
    const targetUids = uids.slice(-limit);

    for await (const message of client.fetch(
      targetUids,
      { source: true, flags: true },
      { uid: true }
    )) {
      try {
        const parsed = await parseRawEmail(message.source);
        parsed.uid    = message.uid;
        parsed.isRead = message.flags ? message.flags.has('\\Seen') : false;
        emails.push(parsed);
      } catch (parseErr) {
        // Skip malformed messages; don't abort the whole batch
        console.warn(`emailService: skipped UID ${message.uid} – ${parseErr.message}`);
      }
    }

    // Newest first
    emails.sort((a, b) => (b.date || 0) - (a.date || 0));

    return emails;
  } finally {
    // Always close gracefully — avoids IMAP server-side session leaks
    await client.logout().catch(() => {});
  }
}

/**
 * Fetch a single email by UID.
 *
 * @param {object} config   - same IMAP config as fetchEmails
 * @param {number} uid      - IMAP UID of the email
 * @param {string} [mailbox]
 * @returns {Promise<object|null>}
 */
async function fetchEmailByUid(config, uid, mailbox = DEFAULT_MAILBOX) {
  if (!uid) throw new Error('emailService.fetchEmailByUid: uid is required');

  const client = buildClient(config);

  try {
    await client.connect();
    await client.mailboxOpen(mailbox, { readOnly: true });

    let parsed = null;

    for await (const message of client.fetch(`${uid}`, { source: true }, { uid: true })) {
      parsed = await parseRawEmail(message.source);
      parsed.uid = message.uid;
      break;
    }

    return parsed;
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Return basic mailbox statistics without downloading emails.
 *
 * @param {object} config
 * @param {string} [mailbox]
 * @returns {Promise<{ total: number, unseen: number }>}
 */
async function getMailboxStats(config, mailbox = DEFAULT_MAILBOX) {
  const client = buildClient(config);

  try {
    await client.connect();
    const status = await client.status(mailbox, { messages: true, unseen: true });
    return { total: status.messages, unseen: status.unseen };
  } finally {
    await client.logout().catch(() => {});
  }
}

// ─── Internal utility ─────────────────────────────────────────────────────────

/** Build a sequence-set string for the last `n` messages (e.g. "81:100"). */
function buildSequenceRange(total, limit) {
  if (!total) return null;
  const from = Math.max(1, total - limit + 1);
  return `${from}:${total}`;
}

/**
 * Return all UIDs in a mailbox, optionally only those after sinceUid.
 *
 * @param {object} config
 * @param {object} [options]
 * @param {string}  [options.mailbox]   - mailbox to open (default 'INBOX')
 * @param {number}  [options.sinceUid]  - if set, return only UIDs > sinceUid
 * @returns {Promise<number[]>} sorted ascending
 */
async function listUids(config, options = {}) {
  const mailbox  = options.mailbox  || DEFAULT_MAILBOX;
  const sinceUid = options.sinceUid || null;

  const client = buildClient(config);

  try {
    await client.connect();
    await client.mailboxOpen(mailbox, { readOnly: true });

    const uids = await client.search({ all: true }, { uid: true });

    if (sinceUid) {
      return uids.filter(uid => uid > sinceUid);
    }

    return uids;
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Fetch and parse a specific list of emails by UID.
 * Each call opens its own IMAP connection, enabling parallel batch fetching.
 *
 * @param {object}   config
 * @param {number[]} uids     - UIDs to fetch
 * @param {string}   [mailbox]
 * @returns {Promise<object[]>}
 */
async function fetchEmailsByUids(config, uids, mailbox = DEFAULT_MAILBOX) {
  if (!uids || !uids.length) return [];

  const client = buildClient(config);
  const emails = [];

  try {
    await client.connect();
    await client.mailboxOpen(mailbox, { readOnly: true });

    for await (const message of client.fetch(
      uids,
      { source: true, flags: true },
      { uid: true }
    )) {
      try {
        const parsed  = await parseRawEmail(message.source);
        parsed.uid    = message.uid;
        parsed.isRead = message.flags ? message.flags.has('\\Seen') : false;
        emails.push(parsed);
      } catch (parseErr) {
        console.warn(`emailService: skipped UID ${message.uid} – ${parseErr.message}`);
      }
    }

    return emails;
  } finally {
    await client.logout().catch(() => {});
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  fetchEmails,
  fetchEmailByUid,
  getMailboxStats,
  listUids,
  fetchEmailsByUids,
};
