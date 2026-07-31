// src/routes/layaway_routes.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/layawayController');
const { verifyToken, requirePermission } = require('../middlewares/auth');

router.use(verifyToken);

router.get('/',                                   requirePermission('layaway', 'read'),   ctrl.getByBranch);
router.get('/customer/:customerId',               requirePermission('layaway', 'read'),   ctrl.getByCustomer);
router.get('/:layawayId',                         requirePermission('layaway', 'read'),   ctrl.getById);
router.post('/',                                  requirePermission('layaway', 'create'), ctrl.create);
router.post('/:layawayId/payments',               requirePermission('layaway', 'create'), ctrl.addPayment);
router.patch('/:layawayId/cancel',                requirePermission('layaway', 'create'), ctrl.cancel);

module.exports = router;
