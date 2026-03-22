const express  = require('express');
const router   = express.Router();
const path     = require('path');
const fs       = require('fs');
const { getByUser, getByCompany } = require('../controllers/email.controller');
const { protect } = require('../middleware/auth.middleware');

router.use(protect);

router.get('/',              getByUser);       // GET /api/emails
router.get('/company/:id',   getByCompany);    // GET /api/emails/company/:id

router.get('/:id/attachment/:filename', async (req, res) => {
  try {
    const userId   = req.user.id;
    const filename = req.params.filename;
    const userDir  = path.join(__dirname, '..', 'uploads', 'attachments', String(userId));

    let filePath = null;

    if (fs.existsSync(userDir)) {
      const folders = fs.readdirSync(userDir);
      for (const folder of folders) {
        const candidate = path.join(userDir, folder, filename);
        if (fs.existsSync(candidate)) {
          filePath = candidate;
          break;
        }
      }
    }

    if (!filePath) {
      return res.status(404).json({ message: 'File not found' });
    }

    res.download(filePath);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
