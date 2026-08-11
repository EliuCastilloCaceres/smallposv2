// src/routes/cash_registers_routes.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/cashRegistersController');
const { verifyToken, requirePermission } = require('../middlewares/auth');

router.use(verifyToken);

// FIX: antes create/toggleStatus/update usaban settings.update — ahora
// conectados a cash_registers.*, el módulo granular que ya existía en el
// seed pero nunca se consultaba. open/close/movements/getStatus/getAll se
// dejan con pos.use: son acciones operativas del día a día (abrir/cerrar
// turno, registrar movimientos), no configuración administrativa, por eso
// no comparten el mismo permiso que crear o editar una caja registradora.
router.get('/',                          requirePermission('pos', 'use'),             ctrl.getAll);
router.post('/',                         requirePermission('cash_registers', 'create'), ctrl.create);
router.patch('/:registerId/status',      requirePermission('cash_registers', 'update'), ctrl.toggleStatus);
router.put('/:registerId',               requirePermission('cash_registers', 'update'), ctrl.update);
router.patch('/:registerId/open',        requirePermission('pos', 'use'),             ctrl.open);
router.patch('/:registerId/close',       requirePermission('pos', 'use'),             ctrl.close);
router.get('/:registerId/status',        requirePermission('pos', 'use'),             ctrl.getStatus);
router.post('/:registerId/movements',    requirePermission('pos', 'use'),             ctrl.createMovement);

module.exports = router;