const db = require('../config/db');

const AgentSettingsModel = {
  /**
   * Return the row for a user, or null if none exists yet.
   */
  findByUser: async (userId) => {
    const [rows] = await db.execute(
      'SELECT * FROM agent_settings WHERE user_id = ? LIMIT 1',
      [userId]
    );
    return rows[0] || null;
  },

  /**
   * Insert a new settings row for a user.
   */
  create: async (userId, automationEnabled) => {
    const [result] = await db.execute(
      'INSERT INTO agent_settings (user_id, automation_enabled, auto_create_folders) VALUES (?, ?, TRUE)',
      [userId, automationEnabled]
    );
    return result.insertId;
  },

  /**
   * Return full settings rows for all users with automation ON.
   * The agent uses auto_create_folders from each row at classify-time.
   */
  findAllEnabled: async () => {
    const [rows] = await db.execute(
      'SELECT user_id, auto_create_folders FROM agent_settings WHERE automation_enabled = TRUE'
    );
    return rows;
  },

  /**
   * Flip automation_enabled and refresh updated_at.
   */
  updateAutomation: async (userId, automationEnabled) => {
    await db.execute(
      'UPDATE agent_settings SET automation_enabled = ?, updated_at = NOW() WHERE user_id = ?',
      [automationEnabled, userId]
    );
  },

  /**
   * Flip auto_create_folders and refresh updated_at.
   */
  updateAutoCreate: async (userId, autoCreate) => {
    await db.execute(
      'UPDATE agent_settings SET auto_create_folders = ?, updated_at = NOW() WHERE user_id = ?',
      [autoCreate, userId]
    );
  },

  /**
   * Return the last IMAP UID that was fully processed for a user.
   * Returns null if no UID has been saved yet (first run).
   */
  getLastUid: async (userId) => {
    const [rows] = await db.execute(
      'SELECT last_fetched_uid FROM agent_settings WHERE user_id = ? LIMIT 1',
      [userId]
    );
    return rows[0]?.last_fetched_uid ?? null;
  },

  /**
   * Persist the highest UID processed in this cycle so the next cycle
   * can skip all already-seen emails.
   */
  saveLastUid: async (userId, uid) => {
    await db.execute(
      'UPDATE agent_settings SET last_fetched_uid = ?, updated_at = NOW() WHERE user_id = ?',
      [uid, userId]
    );
  },
};

module.exports = AgentSettingsModel;
