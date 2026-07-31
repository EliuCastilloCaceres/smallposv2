// src/routes/cash_registers_routes.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/cashRegistersController');
const { verifyToken, requirePermission } = require('../middlewares/auth');

router.use(verifyToken);
router.get('/',                          requirePermission('pos', 'use'),         ctrl.getAll);
router.post('/',                         requirePermission('settings', 'update'), ctrl.create);
router.patch('/:registerId/status',      requirePermission('settings', 'update'), ctrl.toggleStatus);
router.put('/:registerId',               requirePermission('settings', 'update'), ctrl.update);
router.patch('/:registerId/open',        requirePermission('pos', 'use'),         ctrl.open);
router.patch('/:registerId/close',       requirePermission('pos', 'use'),         ctrl.close);
router.get('/:registerId/status',        requirePermission('pos', 'use'),         ctrl.getStatus);
router.post('/:registerId/movements',    requirePermission('pos', 'use'),         ctrl.createMovement);

module.exports = router;