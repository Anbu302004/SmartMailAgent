const express = require('express');
const router = express.Router();
const { create, list, remove, removeEmpty } = require('../controllers/company.controller');
const { protect } = require('../middleware/auth.middleware');

router.use(protect); // all company routes require authentication

router.post('/',         create);
router.get('/',          list);
router.delete('/empty',  removeEmpty);   // must be before /:id to avoid route collision
router.delete('/:id',    remove);

module.exports = router;
