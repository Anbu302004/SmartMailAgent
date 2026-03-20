const CompanyModel = require('../models/company.model');

const CompanyService = {
  create: async ({ userId, companyName, emailDomain }) => {
    const duplicate = await CompanyModel.findByDomainAndUser(emailDomain, userId);
    if (duplicate) {
      const err = new Error(`A folder for domain "${emailDomain}" already exists`);
      err.statusCode = 409;
      throw err;
    }

    const id = await CompanyModel.create({ userId, companyName, emailDomain });
    return CompanyModel.findById(id);
  },

  listByUser: async (userId) => {
    return CompanyModel.findAllByUser(userId);
  },

  delete: async (id, userId) => {
    const company = await CompanyModel.findById(id);
    if (!company) {
      const err = new Error('Company folder not found');
      err.statusCode = 404;
      throw err;
    }
    if (company.user_id !== userId) {
      const err = new Error('Forbidden: you do not own this folder');
      err.statusCode = 403;
      throw err;
    }

    await CompanyModel.delete(id, userId);
  },

  /** Delete every company folder that contains zero emails for the user. */
  deleteEmpty: async (userId) => {
    return CompanyModel.deleteEmpty(userId);
  },
};

module.exports = CompanyService;
