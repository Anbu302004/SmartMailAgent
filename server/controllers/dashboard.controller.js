const DashboardService = require('../services/dashboard.service');

const getDashboard = async (req, res, next) => {
  try {
    const data = await DashboardService.getDashboard(req.user.id);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

module.exports = { getDashboard };
