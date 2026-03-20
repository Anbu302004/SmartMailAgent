const db = require('../config/db');

const DashboardModel = {

  /**
   * Single query — total emails + automation status for a user.
   * Uses a LEFT JOIN so we always get a row even if agent_settings doesn't exist yet.
   */
  getSummary: async (userId) => {
    const [[row]] = await db.execute(
      `SELECT
         COUNT(e.id)                                      AS total_emails,
         COALESCE(ag.automation_enabled, FALSE)           AS automation_enabled,
         SUM(e.attachment_names IS NOT NULL
             AND JSON_LENGTH(e.attachment_names) > 0)     AS emails_with_attachments,
         SUM(e.company_id IS NULL)                        AS unclassified_count
       FROM emails e
       LEFT JOIN agent_settings ag ON ag.user_id = e.user_id
       WHERE e.user_id = ?`,
      [userId]
    );
    return row;
  },

  /**
   * Company-wise email count + domain — only companies that belong to the user.
   * LEFT JOIN emails so folders with zero emails still appear.
   * Sorted by email count descending.
   */
  getCompanyStats: async (userId) => {
    const [rows] = await db.execute(
      `SELECT
         c.id                          AS company_id,
         c.company_name,
         c.email_domain,
         COUNT(e.id)                   AS email_count,
         MAX(e.email_date)             AS last_email_at
       FROM companies c
       LEFT JOIN emails e
         ON e.company_id = c.id
         AND e.user_id   = c.user_id
       WHERE c.user_id = ?
       GROUP BY c.id
       ORDER BY email_count DESC, c.company_name ASC`,
      [userId]
    );
    return rows;
  },

  /**
   * Five most-recent emails for the user — joined to company name.
   */
  getRecentEmails: async (userId, limit = 5) => {
    const [rows] = await db.execute(
      `SELECT
         e.id,
         e.subject,
         e.sender,
         e.receiver,
         e.email_date,
         (e.attachment_names IS NOT NULL
          AND JSON_LENGTH(e.attachment_names) > 0)        AS has_attachments,
         COALESCE(c.company_name, 'Unclassified') AS company_name,
         c.id                                      AS company_id
       FROM emails e
       LEFT JOIN companies c ON c.id = e.company_id
       WHERE e.user_id = ?
       ORDER BY e.email_date DESC, e.id DESC
       LIMIT ?`,
      [userId, limit]
    );
    return rows;
  },

  /**
   * Last cleanup run — single row from cleanup_logs.
   */
  getLastCleanup: async () => {
    const [[row]] = await db.execute(
      `SELECT deleted_records, cleanup_date
         FROM cleanup_logs
        ORDER BY cleanup_date DESC
        LIMIT 1`
    );
    return row || null;
  },
};

module.exports = DashboardModel;
