// src/controllers/layawayController.js
const layawayService = require('../services/layawayService');
const { resolveBranchId, resolveUnrestrictedBranchId } = require('../helpers/helper');

const getByBranch = async (req, res, next) => {
  try {
    // FIX: listado sin restricción de sucursal propia — cualquier usuario
    // con permiso layaway:read puede ver apartados de cualquier sucursal
    // (o "todas"), no solo la suya. addPayment se queda con el resolver
    // estricto: el abono necesita saber en qué sucursal se recibió el
    // efectivo físicamente, eso no cambia.
    const branchId = resolveUnrestrictedBranchId(req);
    const { status, search, page, limit } = req.query;
    const result = await layawayService.getLayawaysByBranch({ branchId, status, search, page, limit });
    res.json({ status: 'success', ...result });
  } catch (err) { next(err); }
};

const getByCustomer = async (req, res, next) => {
  try {
    const data = await layawayService.getLayawaysByCustomer(parseInt(req.params.customerId));
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
  try {
    const data = await layawayService.getLayawayById(parseInt(req.params.layawayId));
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const userId   = req.user.user_id;
    const branchId = resolveBranchId(req);
    const { customerId, items, initialPayments, dueDate, notes } = req.body;

    if (initialPayments !== undefined && !Array.isArray(initialPayments)) {
      return res.status(400).json({ status: 'error', message: 'initialPayments debe ser un arreglo' });
    }

    const data = await layawayService.createLayaway({
      customerId: parseInt(customerId), branchId, userId,
      items, initialPayments: initialPayments ?? [],
      dueDate, notes,
    });
    res.status(201).json({ status: 'success', data });
  } catch (err) { next(err); }
};

const addPayment = async (req, res, next) => {
  try {
    const layawayId = parseInt(req.params.layawayId);
    const branchId  = resolveBranchId(req);
    const userId    = req.user.user_id;
    const { payments, notes, cashRegisterId } = req.body;

    if (!Array.isArray(payments) || payments.length === 0) {
      return res.status(400).json({ status: 'error', message: 'payments debe ser un arreglo con al menos un pago' });
    }

    const data = await layawayService.addPayment({
      layawayId, branchId, userId,
      payments, notes, cashRegisterId,
    });
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

const cancel = async (req, res, next) => {
  try {
    const data = await layawayService.cancelLayaway({
      layawayId: parseInt(req.params.layawayId),
      userId: req.user.user_id,
    });
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

module.exports = { getByBranch, getByCustomer, getById, create, addPayment, cancel };