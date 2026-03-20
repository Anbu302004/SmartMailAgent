const CompanyService = require('../services/company.service');

const create = async (req, res, next) => {
  try {
    const { company_name, email_domain } = req.body;

    if (!company_name || !email_domain) {
      return res.status(400).json({ message: 'company_name and email_domain are required' });
    }

    const domainPattern = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!domainPattern.test(email_domain)) {
      return res.status(400).json({ message: 'email_domain must be a valid domain (e.g. hcl.com)' });
    }

    const company = await CompanyService.create({
      userId: req.user.id,
      companyName: company_name.trim(),
      emailDomain: email_domain.toLowerCase().trim(),
    });

    res.status(201).json({ message: 'Company folder created', company });
  } catch (err) {
    next(err);
  }
};

const list = async (req, res, next) => {
  try {
    const companies = await CompanyService.listByUser(req.user.id);
    res.status(200).json({ companies });
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!Number.isInteger(Number(id)) || Number(id) < 1) {
      return res.status(400).json({ message: 'Invalid company id' });
    }

    await CompanyService.delete(Number(id), req.user.id);
    res.status(200).json({ message: 'Company folder deleted' });
  } catch (err) {
    next(err);
  }
};

const removeEmpty = async (req, res, next) => {
  try {
    const deleted = await CompanyService.deleteEmpty(req.user.id);
    res.status(200).json({ message: `${deleted} empty folder(s) deleted`, deleted });
  } catch (err) {
    next(err);
  }
};

module.exports = { create, list, remove, removeEmpty };
