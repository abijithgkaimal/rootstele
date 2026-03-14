const path = require('path');
const ApiError = require('../utils/ApiError');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_SESSION_TOKEN = process.env.ADMIN_SESSION_TOKEN || 'admin-session-token';
const ADMIN_COOKIE_NAME = 'admin_session';

const isJsonRequest = (req) => {
  const accept = req.headers.accept || '';
  return accept.includes('application/json') || req.path.startsWith('/api/');
};

const ensureAdminAuthenticated = (req, res, next) => {
  const token = req.cookies && req.cookies[ADMIN_COOKIE_NAME];
  if (token === ADMIN_SESSION_TOKEN) {
    return next();
  }

  if (isJsonRequest(req)) {
    return next(new ApiError(401, 'Admin session required'));
  }

  return res.redirect('/admin/login');
};

const renderLoginPage = (req, res) => {
  const token = req.cookies && req.cookies[ADMIN_COOKIE_NAME];
  if (token === ADMIN_SESSION_TOKEN) {
    return res.redirect('/admin/dashboard');
  }

  return res.sendFile(
    path.join(process.cwd(), 'public', 'admin-login.html')
  );
};

const handleAdminLogin = (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      res.cookie(ADMIN_COOKIE_NAME, ADMIN_SESSION_TOKEN, {
        httpOnly: true,
        sameSite: 'lax',
      });

      if (isJsonRequest(req)) {
        return res.json({ success: true });
      }

      return res.redirect('/admin/dashboard');
    }

    if (isJsonRequest(req)) {
      return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
    }

    return res.redirect('/admin/login?error=1');
  } catch (err) {
    next(err);
  }
};

const handleAdminLogout = (req, res, next) => {
  try {
    res.clearCookie(ADMIN_COOKIE_NAME);
    if (isJsonRequest(req)) {
      return res.json({ success: true });
    }
    return res.redirect('/admin/login');
  } catch (err) {
    next(err);
  }
};

const renderAdminApp = (req, res) => {
  return res.sendFile(
    path.join(process.cwd(), 'public', 'admin-app.html')
  );
};

module.exports = {
  ensureAdminAuthenticated,
  renderLoginPage,
  handleAdminLogin,
  handleAdminLogout,
  renderAdminApp,
};

