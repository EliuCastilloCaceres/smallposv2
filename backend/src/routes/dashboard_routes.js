// src/routes/dashboard_routes.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/dashboardController');
const { verifyToken } = require('../middlewares/auth');

router.use(verifyToken);
router.get('/', ctrl.getDashboard);

module.exports = router;
