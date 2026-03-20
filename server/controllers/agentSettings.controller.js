const AgentSettingsService = require('../services/agentSettings.service');

const toggle = async (req, res, next) => {
  try {
    const settings = await AgentSettingsService.toggle(req.user.id);

    const state = settings.automation_enabled ? 'enabled' : 'disabled';

    res.status(200).json({
      message:            `Automation ${state}`,
      automation_enabled: Boolean(settings.automation_enabled),
      updated_at:         settings.updated_at,
    });
  } catch (err) {
    next(err);
  }
};

const getStatus = async (req, res, next) => {
  try {
    const settings = await AgentSettingsService.getSettings(req.user.id);

    res.status(200).json({
      automation_enabled:  Boolean(settings.automation_enabled),
      auto_create_folders: Boolean(settings.auto_create_folders),
      updated_at:          settings.updated_at,
    });
  } catch (err) {
    next(err);
  }
};

const toggleAutoCreate = async (req, res, next) => {
  try {
    const settings = await AgentSettingsService.toggleAutoCreate(req.user.id);
    const on       = Boolean(settings.auto_create_folders);

    res.status(200).json({
      message:             `Auto-create folders ${on ? 'enabled' : 'disabled'}`,
      auto_create_folders: on,
      updated_at:          settings.updated_at,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { toggle, getStatus, toggleAutoCreate };
