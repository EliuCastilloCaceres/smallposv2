// src/routes/dashboard_routes.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/dashboardController');
const { verifyToken, requirePermission } = require('../middlewares/auth');

// FIX: antes esta ruta solo exigía verifyToken — CUALQUIER usuario
// autenticado, sin importar su rol, podía ver el dashboard. Ahora exige
// el permiso dashboard.read (ver seed_dashboard_permission.sql para
// crearlo y asignarlo — es un permiso nuevo que no existía en el seed).
router.use(verifyToken);
router.get('/', requirePermission('dashboard', 'read'), ctrl.getDashboard);

module.exports = router;