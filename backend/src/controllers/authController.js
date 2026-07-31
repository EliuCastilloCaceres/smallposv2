// src/controllers/authController.js
const authService = require('../services/authService');

const COOKIE_OPTIONS = (req) => ({
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge:   7 * 24 * 60 * 60 * 1000,
});

const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const result = await authService.login({
      username, password,
      userAgent:  req.headers['user-agent'],
      ipAddress:  req.ip,
    });

    res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS(req));

    res.json({
      status:      'success',
      accessToken: result.accessToken,
      user:        result.user,   // ya incluye permissions[]
    });
  } catch (err) { next(err); }
};

const refresh = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    const result = await authService.refresh({
      refreshToken,
      userAgent:  req.headers['user-agent'],
      ipAddress:  req.ip,
    });

    res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS(req));
    res.json({ status: 'success', accessToken: result.accessToken });
  } catch (err) { next(err); }
};

const logout = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    await authService.logout(refreshToken);
    res.clearCookie('refreshToken');
    res.json({ status: 'success', message: 'Sesión cerrada' });
  } catch (err) { next(err); }
};

// GET /auth/me — devuelve usuario + permisos con el access token actual
const getMe = async (req, res, next) => {
  try {
    const user = await authService.getMe(req.user.user_id);
    res.json({ status: 'success', data: user });
  } catch (err) { next(err); }
};

module.exports = { login, refresh, logout, getMe };