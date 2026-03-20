const AgentSettingsModel = require('../models/agentSettings.model');

const AgentSettingsService = {
  /**
   * Toggle automation for a user.
   * If no settings row exists yet, it is created (defaulting to enabled).
   * Returns the updated settings object.
   */
  toggle: async (userId) => {
    let settings = await AgentSettingsModel.findByUser(userId);

    if (!settings) {
      // First-time: create row with automation ON, then return it
      await AgentSettingsModel.create(userId, true);
      return AgentSettingsModel.findByUser(userId);
    }

    const next = !settings.automation_enabled;
    await AgentSettingsModel.updateAutomation(userId, next);
    return AgentSettingsModel.findByUser(userId);
  },

  /**
   * Returns the current settings for a user.
   * Creates a default row (automation disabled) if none exists.
   */
  getSettings: async (userId) => {
    let settings = await AgentSettingsModel.findByUser(userId);

    if (!settings) {
      await AgentSettingsModel.create(userId, false);
      return AgentSettingsModel.findByUser(userId);
    }

    return settings;
  },

  /**
   * Guard used by the email agent before processing any emails.
   * Returns true  → automation is on, safe to proceed.
   * Returns false → automation is off, agent must skip.
   */
  isAutomationEnabled: async (userId) => {
    const settings = await AgentSettingsModel.findByUser(userId);
    return settings ? Boolean(settings.automation_enabled) : false;
  },

  /**
   * Toggle auto_create_folders for a user.
   * Creates a settings row (automation disabled) if none exists yet.
   */
  toggleAutoCreate: async (userId) => {
    let settings = await AgentSettingsModel.findByUser(userId);

    if (!settings) {
      await AgentSettingsModel.create(userId, false);
      settings = await AgentSettingsModel.findByUser(userId);
    }

    const next = !settings.auto_create_folders;
    await AgentSettingsModel.updateAutoCreate(userId, next);
    return AgentSettingsModel.findByUser(userId);
  },
};

module.exports = AgentSettingsService;
