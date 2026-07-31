// src/routes/auth_routes.js
const express         = require('express');
const router          = express.Router();
const authCtrl        = require('../controllers/authController');
const { verifyToken } = require('../middlewares/auth');

router.post('/login',   authCtrl.login);
router.post('/refresh', authCtrl.refresh);
router.post('/logout',  verifyToken, authCtrl.logout);
router.get( '/me',      verifyToken, authCtrl.getMe);   // ← nuevo

module.exports = router;