// src/controllers/returnController.js
const returnService = require('../services/returnService');
const { resolveBranchId } = require('../helpers/helper');

const getByBranch = async (req, res, next) => {
  try {
    const branchId = resolveBranchId(req);
    const { status, search, startDate, endDate, page, limit } = req.query;
    const result = await returnService.getReturnsByBranch({
      branchId, status, search, startDate, endDate, page, limit,
    });
    res.json({ status: 'success', ...result });
  } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
  try {
    const branchId = resolveBranchId(req);
    const data = await returnService.getReturnById(parseInt(req.params.returnId), branchId);
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

// GET /returns/order/:orderId/returnable — items de la orden + cuánto de
// cada línea ya se devolvió, para el modal de creación.
const getReturnableItems = async (req, res, next) => {
  try {
    const branchId = resolveBranchId(req);
    const data = await returnService.getReturnableItems(parseInt(req.params.orderId), branchId);
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const branchId = resolveBranchId(req);
    const userId   = req.user.user_id;
    const { orderId, items, reason, refundAmount, paymentMethodId, cashRegisterId } = req.body;

    if (!orderId) {
      return res.status(400).json({ status: 'error', message: 'orderId es requerido' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ status: 'error', message: 'items debe ser un arreglo con al menos un producto' });
    }

    const data = await returnService.createReturn({
      orderId: parseInt(orderId), branchId, userId,
      items, reason,
      refundAmount:    Number(refundAmount) || 0,
      paymentMethodId: paymentMethodId ?? null,
      cashRegisterId:  cashRegisterId ?? null,
    });
    res.status(201).json({ status: 'success', data });
  } catch (err) { next(err); }
};

module.exports = { getByBranch, getById, getReturnableItems, create };
