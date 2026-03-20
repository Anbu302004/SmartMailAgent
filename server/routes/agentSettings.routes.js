const express = require('express');
const router  = express.Router();
const { toggle, getStatus, toggleAutoCreate } = require('../controllers/agentSettings.controller');
const { protect }           = require('../middleware/auth.middleware');

router.use(protect);

router.patch('/toggle',        toggle);            // toggle automation on/off
router.patch('/auto-create',   toggleAutoCreate);  // toggle auto-create folders
router.get('/status',          getStatus);         // read both flags

module.exports = router;
