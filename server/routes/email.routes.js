const express  = require('express');
const router   = express.Router();
const { getByUser, getByCompany } = require('../controllers/email.controller');
const { protect } = require('../middleware/auth.middleware');

router.use(protect);

router.get('/',              getByUser);       // GET /api/emails
router.get('/company/:id',   getByCompany);    // GET /api/emails/company/:id

module.exports = router;
