// src/controllers/creditController.js
const creditService = require('../services/creditService');
const {resolveBranchId} = require('../helpers/helper');

const getByBranch = async (req, res, next) => {
  try {
    const branchId = resolveBranchId(req)
    const data = await creditService.getActiveCreditsByBranch(branchId);
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

const getByCustomer = async (req, res, next) => {
  try {
    const data = await creditService.getCreditsByCustomer(parseInt(req.params.customerId));
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
  try {
    const data = await creditService.getCreditById(parseInt(req.params.creditSaleId));
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

const getOverdue = async (req, res, next) => {
  try {
    const data = await creditService.getOverdueCredits();
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

const addPayment = async (req, res, next) => {
  try {
    const creditSaleId = parseInt(req.params.creditSaleId);
    const branchId     = resolveBranchId(req);
    const userId       = req.user.user_id;
    const { payments, notes } = req.body;

    if (!Array.isArray(payments) || payments.length === 0) {
      return res.status(400).json({ status: 'error', message: 'payments debe ser un arreglo con al menos un pago' });
    }

    const data = await creditService.addPayment({
      creditSaleId, branchId, userId,
      payments, notes,
    });
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

const updateCreditLimit = async (req, res, next) => {
  try {
    const customerId = parseInt(req.params.customerId);
    const newLimit   = parseFloat(req.body.creditLimit);
    const approvedBy = req.user.user_id;
    const data = await creditService.updateCreditLimit({ customerId, newLimit, approvedBy });
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

const markOverdue = async (req, res, next) => {
  try {
    const data = await creditService.markOverdueCredits();
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

module.exports = { getByBranch, getByCustomer, getById, getOverdue, addPayment, updateCreditLimit, markOverdue };