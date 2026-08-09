// src/routes/return_routes.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/returnController');
const { verifyToken, requirePermission } = require('../middlewares/auth');

router.use(verifyToken);

// Rutas estáticas/con más segmentos antes del genérico /:returnId
router.get('/order/:orderId/returnable', requirePermission('returns', 'read'),   ctrl.getReturnableItems);
router.get('/',                          requirePermission('returns', 'read'),   ctrl.getByBranch);
router.get('/:returnId',                 requirePermission('returns', 'read'),   ctrl.getById);
router.post('/',                         requirePermission('returns', 'create'), ctrl.create);

module.exports = router;
