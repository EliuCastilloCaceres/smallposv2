// src/controllers/paymentMethodController.js
const paymentMethodService = require('../services/paymentMethodService');

// GET /payment-methods
const getAll = async (req, res, next) => {
  try {
    const result = await paymentMethodService.getAll({ filters: req.query });
    res.json({ status: 'success', ...result });
  } catch (err) { next(err); }
};

// GET /payment-methods/:id
const getById = async (req, res, next) => {
  try {
    const method = await paymentMethodService.getById(req.params.id);
    res.json({ status: 'success', data: method });
  } catch (err) { next(err); }
};

// POST /payment-methods
const create = async (req, res, next) => {
  try {
    const method = await paymentMethodService.create({
      data:           req.body,
      requestingUser: req.user,
    });
    res.status(201).json({ status: 'success', data: method });
  } catch (err) { next(err); }
};

// PUT /payment-methods/:id
const update = async (req, res, next) => {
  try {
    const method = await paymentMethodService.update({
      paymentMethodId: req.params.id,
      data:            req.body,
      requestingUser:  req.user,
    });
    res.json({ status: 'success', data: method });
  } catch (err) { next(err); }
};

// PATCH /payment-methods/:id/status
const toggleStatus = async (req, res, next) => {
  try {
    const { is_active } = req.body;
    if (is_active === undefined) {
      return res.status(400).json({ status: 'error', message: 'El campo is_active es requerido' });
    }
    const result = await paymentMethodService.toggleStatus({
      paymentMethodId: req.params.id,
      is_active:       Boolean(is_active),
      requestingUser:  req.user,
    });
    res.json({ status: 'success', data: result });
  } catch (err) { next(err); }
};

module.exports = { getAll, getById, create, update, toggleStatus };
