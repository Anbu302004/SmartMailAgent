const DashboardModel = require('../models/dashboard.model');

const DashboardService = {
  /**
   * Assemble the full dashboard payload for a user.
   * All four queries run in parallel via Promise.all — minimum latency.
   */
  getDashboard: async (userId) => {
    const [summary, companyStats, recentEmails, lastCleanup] = await Promise.all([
      DashboardModel.getSummary(userId),
      DashboardModel.getCompanyStats(userId),
      DashboardModel.getRecentEmails(userId, 5),
      DashboardModel.getLastCleanup(),
    ]);

    return {
      summary: {
        total_emails:             Number(summary.total_emails)             || 0,
        automation_enabled:       Boolean(summary.automation_enabled),
        emails_with_attachments:  Number(summary.emails_with_attachments)  || 0,
        unclassified_count:       Number(summary.unclassified_count)       || 0,
      },
      company_stats: companyStats.map((c) => ({
        company_id:   c.company_id,
        company_name: c.company_name,
        email_domain: c.email_domain,
        email_count:  Number(c.email_count),
        last_email_at: c.last_email_at || null,
      })),
      recent_emails: recentEmails.map((e) => ({
        id:              e.id,
        company_name:    e.company_name,
        company_id:      e.company_id   || null,
        subject:         e.subject,
        sender:          e.sender,
        receiver:        e.receiver     || null,
        email_date:      e.email_date   || null,
        has_attachments: Boolean(e.has_attachments),
      })),
      last_cleanup: lastCleanup
        ? {
            deleted_records: lastCleanup.deleted_records,
            cleanup_date:    lastCleanup.cleanup_date,
          }
        : null,
    };
  },
};

module.exports = DashboardService;
