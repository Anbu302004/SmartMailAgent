const ExportService = require('../services/export.service');

const exportExcel = async (req, res, next) => {
  try {
    const userId    = req.user.id;
    const companyId = req.query.company_id ? Number(req.query.company_id) : null;

    if (req.query.company_id && (!Number.isInteger(companyId) || companyId < 1)) {
      return res.status(400).json({ message: 'Invalid company_id' });
    }

    const { buffer, filename, rowCount } = await ExportService.generateExcel(userId, companyId);

    res.setHeader('Content-Type',        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length',      buffer.length);
    res.setHeader('X-Row-Count',         rowCount);

    res.send(buffer);
  } catch (err) {
    next(err);
  }
};

module.exports = { exportExcel };
