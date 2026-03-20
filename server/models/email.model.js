const db = require('../config/db');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a WHERE fragment + params array for the optional read/unread filter.
 * readFilter: 'read' | 'unread' | anything else → no filter
 */
function readFilterClause(readFilter) {
  if (readFilter === 'read')   return { clause: 'AND is_read = 1', params: [] };
  if (readFilter === 'unread') return { clause: 'AND is_read = 0', params: [] };
  return { clause: '', params: [] };
}

// ─── Model ────────────────────────────────────────────────────────────────────

const EmailModel = {
  /**
   * Bulk-insert classified emails.
   * INSERT IGNORE skips rows whose (message_id, user_id) pair already exists.
   * Returns the number of rows actually inserted.
   */
  saveMany: async (rows) => {
    if (!rows.length) return 0;

    const values = rows.map((r) => [
      r.message_id,
      r.user_id,
      r.company_id  || null,
      r.sender,
      r.receiver    || null,
      r.subject,
      r.description || null,
      r.attachment_names ? JSON.stringify(r.attachment_names) : null,
      r.is_read     ? 1 : 0,
      r.email_date  || null,
    ]);

    const placeholders = values.map(() => '(?,?,?,?,?,?,?,?,?,?)').join(',');
    const flat = values.flat();

    const [result] = await db.execute(
      `INSERT IGNORE INTO emails
         (message_id, user_id, company_id, sender, receiver,
          subject, description, attachment_names, is_read, email_date)
       VALUES ${placeholders}`,
      flat
    );

    return result.affectedRows;
  },

  /**
   * All emails for a user, newest first, paginated.
   * @param {string} [readFilter] - 'read' | 'unread' | undefined (all)
   */
  findByUser: async (userId, { limit = 20, offset = 0, readFilter } = {}) => {
    const { clause, params } = readFilterClause(readFilter);
    const [rows] = await db.execute(
      `SELECT e.*,
              COALESCE(c.company_name, 'Unclassified') AS company_name
         FROM emails e
         LEFT JOIN companies c ON c.id = e.company_id
        WHERE e.user_id = ? ${clause}
        ORDER BY e.email_date DESC, e.id DESC
        LIMIT ? OFFSET ?`,
      [userId, ...params, limit, offset]
    );
    return rows;
  },

  /**
   * Total email count for a user, with optional read filter.
   */
  countByUser: async (userId, { readFilter } = {}) => {
    const { clause, params } = readFilterClause(readFilter);
    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) AS total FROM emails WHERE user_id = ? ${clause}`,
      [userId, ...params]
    );
    return total;
  },

  /**
   * Read / unread counts for a user (for the summary line).
   */
  readStatsByUser: async (userId) => {
    const [[row]] = await db.execute(
      `SELECT
         SUM(is_read = 1) AS read_count,
         SUM(is_read = 0) AS unread_count
       FROM emails WHERE user_id = ?`,
      [userId]
    );
    return {
      read_count:   Number(row.read_count   || 0),
      unread_count: Number(row.unread_count || 0),
    };
  },

  /**
   * All emails for a specific company folder, newest first, paginated.
   * @param {string} [readFilter] - 'read' | 'unread' | undefined (all)
   */
  findByCompany: async (companyId, { limit = 20, offset = 0, readFilter } = {}) => {
    const { clause, params } = readFilterClause(readFilter);
    const [rows] = await db.execute(
      `SELECT e.*,
              COALESCE(c.company_name, 'Unclassified') AS company_name
         FROM emails e
         LEFT JOIN companies c ON c.id = e.company_id
        WHERE e.company_id = ? ${clause}
        ORDER BY e.email_date DESC, e.id DESC
        LIMIT ? OFFSET ?`,
      [companyId, ...params, limit, offset]
    );
    return rows;
  },

  /**
   * Total email count for a company folder, with optional read filter.
   */
  countByCompany: async (companyId, { readFilter } = {}) => {
    const { clause, params } = readFilterClause(readFilter);
    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) AS total FROM emails WHERE company_id = ? ${clause}`,
      [companyId, ...params]
    );
    return total;
  },

  /**
   * Read / unread counts for a company folder.
   */
  readStatsByCompany: async (companyId) => {
    const [[row]] = await db.execute(
      `SELECT
         SUM(is_read = 1) AS read_count,
         SUM(is_read = 0) AS unread_count
       FROM emails WHERE company_id = ?`,
      [companyId]
    );
    return {
      read_count:   Number(row.read_count   || 0),
      unread_count: Number(row.unread_count || 0),
    };
  },

  /**
   * Fetch all emails for export — no pagination cap, optional company filter.
   */
  findForExport: async (userId, companyId = null) => {
    const params = [userId];
    const companyFilter = companyId ? 'AND e.company_id = ?' : '';
    if (companyId) params.push(companyId);

    const [rows] = await db.execute(
      `SELECT e.sender,
              e.subject,
              e.email_date,
              e.attachment_names,
              e.description,
              e.is_read,
              COALESCE(c.company_name, 'Unclassified') AS company_name
         FROM emails e
         LEFT JOIN companies c ON c.id = e.company_id
        WHERE e.user_id = ? ${companyFilter}
        ORDER BY e.email_date DESC, e.id DESC`,
      params
    );
    return rows;
  },
};

module.exports = EmailModel;
