// src/routes/purchase_routes.js
// Compras (specs/14-modulo-de-compras.md, requisito 35, y
// specs/15-comprobante-despues-de-guardar.md, requisito 4).
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/purchaseController');
const { verifyToken, requirePermission, requireAnyPermission } = require('../middlewares/auth');
const { uploadPurchaseReceipt } = require('../middlewares/uploadPurchaseReceipt');

router.use(verifyToken);

// Datos de los formularios: también para el cajero, que registra compras
// desde el POS sin purchases.read
const canUseForm = requireAnyPermission(['purchases', 'create'], ['purchases', 'read']);
router.get('/options',  canUseForm, ctrl.options);
router.get('/products', canUseForm, ctrl.products);

router.get('/',            requirePermission('purchases', 'read'), ctrl.list);
router.get('/:id',         requirePermission('purchases', 'read'), ctrl.getById);
router.get('/:id/receipt', requirePermission('purchases', 'read'), ctrl.getReceipt);

// Sin purchases.read solo se aceptan compras pagadas desde caja (el service lo valida)
router.post('/',           requirePermission('purchases', 'create'), uploadPurchaseReceipt, ctrl.create);
router.post('/:id/cancel', requirePermission('purchases', 'cancel'), ctrl.cancel);

// Agregar o reemplazar el comprobante: desde el detalle, así que pide ver y registrar
router.put('/:id/receipt',
  requirePermission('purchases', 'read'),
  requirePermission('purchases', 'create'),
  uploadPurchaseReceipt,
  ctrl.replaceReceipt
);

module.exports = router;
