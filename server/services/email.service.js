const crypto        = require('crypto');
const EmailModel    = require('../models/email.model');
const CompanyModel  = require('../models/company.model');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSender(name, email) {
  if (name && email) return `${name} <${email}>`;
  return email || name || 'unknown';
}

function fallbackMessageId(classified) {
  const raw = [
    classified.sender_email || '',
    classified.subject      || '',
    classified.received_at  ? String(classified.received_at) : '',
    classified.uid          ? String(classified.uid) : '',
  ].join('|');
  return `generated-${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32)}`;
}

/**
 * Map a classified email object (from emailAgent) → DB row shape.
 */
function toDbRow(classified) {
  const messageId = classified.message_id || fallbackMessageId(classified);

  const attachmentNames = (classified.attachments || [])
    .filter(name => typeof name === 'string')
    .filter(Boolean);

  return {
    message_id:          messageId,
    user_id:             classified.user_id,
    company_id:          classified.company_id || null,
    sender:              formatSender(classified.sender_name, classified.sender_email),
    receiver:            classified.receiver   || null,
    subject:             classified.subject    || '(no subject)',
    description:         classified.body_text  || null,
    attachment_names:    attachmentNames.length ? attachmentNames : null,
    attachment_contents: classified.attachment_contents || [],
    is_read:             classified.is_read    || false,
    email_date:          classified.received_at || null,
  };
}
/**
 * Paginate helper — clamps values to safe ranges.
 */
function parsePagination(query) {
  const page  = Math.max(1, parseInt(query.page  || 1, 10));
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || 20, 10)));
  return { limit, offset: (page - 1) * limit, page };
}

// ─── Service ──────────────────────────────────────────────────────────────────

const EmailService = {
  /**
   * Persist an array of classified emails from the agent.
   * Saves one email at a time so a single bad body cannot abort the whole batch.
   * Skips duplicates via INSERT IGNORE on (message_id, user_id).
   * Returns { saved, skipped } counts.
   */
  saveMany: async (classifiedEmails) => {
    if (!classifiedEmails?.length) return { saved: 0, skipped: 0 };

    let saved   = 0;
    let skipped = 0;

    for (const classified of classifiedEmails) {
      try {
        const row = toDbRow(classified);

        // Save attachment files to disk
        const fs   = require('fs');
        const path = require('path');
        if (classified.attachment_contents && classified.attachment_contents.length) {
          for (const att of classified.attachment_contents) {
            if (att.content && att.filename) {
              const safeName = (row.message_id || 'unknown').replace(/[^a-z0-9]/gi, '_');
              const dir = path.join(__dirname, '..', 'uploads', 'attachments',
                String(classified.user_id), safeName
              );
              fs.mkdirSync(dir, { recursive: true });
              fs.writeFileSync(path.join(dir, att.filename), att.content);
            }
          }
        }

        const inserted = await EmailModel.saveMany([row]);
        if (inserted > 0) saved++;
        else              skipped++;   // duplicate
      } catch (saveErr) {
        console.warn(
          `[EmailService] Skipped UID ${classified.uid || '?'} (${classified.subject || ''}): ${saveErr.message}`
        );
        skipped++;
      }
    }

    return { saved, skipped };
  },

  /**
   * Retrieve paginated emails for a user across all company folders.
   * Supports ?read_filter=read|unread (omit for all).
   */
  getByUser: async (userId, query = {}) => {
    const { limit, offset, page } = parsePagination(query);
    const readFilter = query.read_filter || undefined;

    const [emails, total, readStats] = await Promise.all([
      EmailModel.findByUser(userId, { limit, offset, readFilter }),
      EmailModel.countByUser(userId, { readFilter }),
      EmailModel.readStatsByUser(userId),
    ]);

    return {
      emails,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      read_stats: readStats,
    };
  },

  /**
   * Retrieve paginated emails for a specific company folder.
   * Verifies the requesting user owns the folder before returning data.
   * Supports ?read_filter=read|unread (omit for all).
   */
  getByCompany: async (companyId, userId, query = {}) => {
    const company = await CompanyModel.findById(companyId);

    if (!company) {
      const e = new Error('Company folder not found');
      e.statusCode = 404;
      throw e;
    }
    if (company.user_id !== userId) {
      const e = new Error('Forbidden: you do not own this folder');
      e.statusCode = 403;
      throw e;
    }

    const { limit, offset, page } = parsePagination(query);
    const readFilter = query.read_filter || undefined;

    const [emails, total, readStats] = await Promise.all([
      EmailModel.findByCompany(companyId, { limit, offset, readFilter }),
      EmailModel.countByCompany(companyId, { readFilter }),
      EmailModel.readStatsByCompany(companyId),
    ]);

    return {
      company: { id: company.id, name: company.company_name, domain: company.email_domain },
      emails,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      read_stats: readStats,
    };
  },
};

module.exports = EmailService;
