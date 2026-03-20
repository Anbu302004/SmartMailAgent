const EmailService = require('../services/email.service');

const getByUser = async (req, res, next) => {
  try {
    const result = await EmailService.getByUser(req.user.id, req.query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

const getByCompany = async (req, res, next) => {
  try {
    const companyId = Number(req.params.id);

    if (!Number.isInteger(companyId) || companyId < 1) {
      return res.status(400).json({ message: 'Invalid company id' });
    }

    const result = await EmailService.getByCompany(companyId, req.user.id, req.query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

module.exports = { getByUser, getByCompany };
