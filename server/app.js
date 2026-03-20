require('dotenv').config();
const express = require('express');
const cors = require('cors');

const healthRoutes        = require('./routes/health.routes');
const authRoutes          = require('./routes/auth.routes');
const companyRoutes       = require('./routes/company.routes');
const agentSettingsRoutes = require('./routes/agentSettings.routes');
const emailRoutes         = require('./routes/email.routes');
const exportRoutes        = require('./routes/export.routes');
const dashboardRoutes     = require('./routes/dashboard.routes');
const emailAgent          = require('./agents/emailAgent');
const cleanupAgent        = require('./agents/cleanupAgent');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api', healthRoutes);
app.use('/api/auth',    authRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/agent',   agentSettingsRoutes);
app.use('/api/emails',  emailRoutes);
app.use('/api/export',    exportRoutes);
app.use('/api/dashboard', dashboardRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  const status = err.statusCode || 500;
  const message = status < 500 ? err.message : 'Internal server error';
  if (status >= 500) console.error(err.stack);
  res.status(status).json({ message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SmartMail Agent server running on port ${PORT}`);
  emailAgent.start();
  cleanupAgent.start();
});

module.exports = app;
