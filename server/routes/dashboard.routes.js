const express  = require('express');
const router   = express.Router();
const { getDashboard } = require('../controllers/dashboard.controller');
const { protect }      = require('../middleware/auth.middleware');

router.get('/', protect, getDashboard);   // GET /api/dashboard

module.exports = router;
