require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const authRoutes = require('./src/routes/authRoutes');
const leadRoutes = require('./src/routes/leadRoutes');
const followupRoutes = require('./src/routes/followupRoutes');
const bookingConfirmationRoutes = require('./src/routes/bookingConfirmationRoutes');
const returnRoutes = require('./src/routes/returnRoutes');
const syncRoutes = require('./src/routes/syncRoutes');
const storeRoutes = require('./src/routes/storeRoutes');
const {
  ensureAdminAuthenticated,
  renderLoginPage,
  handleAdminLogin,
  handleAdminLogout,
  renderAdminApp,
} = require('./src/middlewares/adminSession');
const { setupSwagger } = require('./src/swagger/swagger');
const notFound = require('./src/middlewares/notFound');
const errorHandler = require('./src/middlewares/errorHandler');

const app = express();

app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));

// Serve static assets (including admin UI)
app.use(express.static(path.join(process.cwd(), 'public')));

// Telecaller + sync APIs
app.use('/api', authRoutes);
app.use('/api', leadRoutes);
app.use('/api', followupRoutes);
app.use('/api', bookingConfirmationRoutes);
app.use('/api', returnRoutes);
app.use('/api', syncRoutes);
app.use('/api', storeRoutes);

// Admin UI routes
app.get('/', (req, res) => {
  const token = req.cookies && req.cookies.admin_session;
  if (token) {
    return res.redirect('/admin/dashboard');
  }
  return res.redirect('/admin/login');
});

app.get('/admin/login', renderLoginPage);
app.post('/admin/login', handleAdminLogin);
app.post('/admin/logout', handleAdminLogout);

app.get('/admin/dashboard', ensureAdminAuthenticated, renderAdminApp);
app.get('/admin/reports', ensureAdminAuthenticated, renderAdminApp);
app.get('/admin/complaints', ensureAdminAuthenticated, renderAdminApp);
app.get('/admin/performance', ensureAdminAuthenticated, renderAdminApp);

setupSwagger(app);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
