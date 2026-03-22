const db = require('../config/db');

const CompanyModel = {
  create: async ({ userId, companyName, emailDomain }) => {
    const [result] = await db.execute(
      'INSERT INTO companies (user_id, company_name, email_domain) VALUES (?, ?, ?)',
      [userId, companyName, emailDomain]
    );
    return result.insertId;
  },

  findById: async (id) => {
    const [rows] = await db.execute(
      'SELECT * FROM companies WHERE id = ? LIMIT 1',
      [id]
    );
    return rows[0] || null;
  },

  findAllByUser: async (userId) => {
    const [rows] = await db.execute(
      'SELECT * FROM companies WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows;
  },

  // findByDomainAndUser: async (emailDomain, userId) => {
  //   const [rows] = await db.execute(
  //     'SELECT * FROM companies WHERE email_domain = ? AND user_id = ? LIMIT 1',
  //     [emailDomain, userId]
  //   );
  //   return rows[0] || null;
  // },

  findByDomainAndUser: async (emailDomain, userId, senderEmail = null) => {
  // First check exact full email match (e.g. moshika26@gmail.com)
  if (senderEmail) {
    const [exactRows] = await db.execute(
      'SELECT * FROM companies WHERE email_domain = ? AND user_id = ? LIMIT 1',
      [senderEmail, userId]
    );
    if (exactRows[0]) return exactRows[0];
  }

  // Then check domain match (e.g. gmail.com)
  const [rows] = await db.execute(
    'SELECT * FROM companies WHERE email_domain = ? AND user_id = ? LIMIT 1',
    [emailDomain, userId]
  );
  return rows[0] || null;
},

  delete: async (id, userId) => {
    const [result] = await db.execute(
      'DELETE FROM companies WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    return result.affectedRows;
  },

  /**
   * Delete all company folders that have zero emails for a given user.
   * Returns the number of folders deleted.
   */
  deleteEmpty: async (userId) => {
    const [result] = await db.execute(
      `DELETE c FROM companies c
       LEFT JOIN emails e ON e.company_id = c.id AND e.user_id = c.user_id
       WHERE c.user_id = ?
         AND e.id IS NULL`,
      [userId]
    );
    return result.affectedRows;
  },
};

module.exports = CompanyModel;
