const express  = require('express');
const router   = express.Router();
const { exportExcel }  = require('../controllers/export.controller');
const { protect }      = require('../middleware/auth.middleware');

router.use(protect);

router.get('/excel', exportExcel);   // GET /api/export/excel
                                     // GET /api/export/excel?company_id=2

module.exports = router;
