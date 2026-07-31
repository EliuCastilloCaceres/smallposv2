// src/routes/inventory_routes.js
const express       = require('express');
const router        = express.Router();
const invCtrl       = require('../controllers/inventoryController');
const { verifyToken, requirePermission } = require('../middlewares/auth');

router.use(verifyToken);

// ── Stock ─────────────────────────────────────────────────────────────────────
router.get('/stock', requirePermission('inventory', 'read'), invCtrl.getStock);

// ── Bitácora ──────────────────────────────────────────────────────────────────
router.get('/movements', requirePermission('inventory', 'read'), invCtrl.getMovements);

// ── Ajuste individual ─────────────────────────────────────────────────────────
router.post('/adjustments',
  requirePermission('inventory', 'adjust'),
  invCtrl.createAdjustment
);

// ── Ajuste masivo ─────────────────────────────────────────────────────────────
// La plantilla no requiere permiso de ajuste — cualquier autenticado puede descargarla
router.get('/adjustments/bulk/template', invCtrl.getBulkTemplate);

router.post('/adjustments/bulk',
  requirePermission('inventory', 'adjust'),
  invCtrl.bulkAdjustment
);

// ── Traspasos ─────────────────────────────────────────────────────────────────
router.get('/transfers',
  requirePermission('inventory', 'read'),
  invCtrl.getTransfers
);

router.post('/transfers',
  requirePermission('inventory', 'transfer'),
  invCtrl.requestTransfer
);

router.post('/transfers/bulk',
  requirePermission('inventory', 'transfer'),
  invCtrl.bulkRequestTransfer
);

router.patch('/transfers/:id/confirm',
  requirePermission('inventory', 'transfer'),
  invCtrl.confirmTransfer
);

router.patch('/transfers/:id/cancel',
  requirePermission('inventory', 'transfer'),
  invCtrl.cancelTransfer
);

module.exports = router;