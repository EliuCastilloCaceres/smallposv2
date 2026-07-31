// src/routes/providers_routes.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/providersController');
const { verifyToken, requirePermission } = require('../middlewares/auth');

router.use(verifyToken);

router.get('/',                          requirePermission('providers', 'read'),   ctrl.getAll);
router.get('/:providerId',               requirePermission('providers', 'read'),   ctrl.getById);
router.get('/:providerId/products',      requirePermission('providers', 'read'),   ctrl.getProducts);
router.post('/',                         requirePermission('providers', 'create'), ctrl.create);
router.put('/:providerId',               requirePermission('providers', 'update'), ctrl.update);
router.patch('/:providerId/status',      requirePermission('providers', 'update'), ctrl.toggleStatus);

module.exports = router;
