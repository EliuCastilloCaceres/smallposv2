// src/controllers/branchController.js
const branchService = require('../services/branchService');

// GET /branches
const getAll = async (req, res, next) => {
  try {
    const result = await branchService.getAll({
      requestingUser: req.user,
      filters:        req.query,
    });
    res.json({ status: 'success', ...result });
  } catch (err) { next(err); }
};

// GET /branches/:id
const getById = async (req, res, next) => {
  try {
    const branch = await branchService.getById({
      branchId:       req.params.id,
      requestingUser: req.user,
    });
    res.json({ status: 'success', data: branch });
  } catch (err) { next(err); }
};

// POST /branches
const create = async (req, res, next) => {
  try {
    const branch = await branchService.create({
      data:           req.body,
      requestingUser: req.user,
    });
    res.status(201).json({ status: 'success', data: branch });
  } catch (err) { next(err); }
};

// PUT /branches/:id
const update = async (req, res, next) => {
  try {
    const branch = await branchService.update({
      branchId:       req.params.id,
      data:           req.body,
      requestingUser: req.user,
    });
    res.json({ status: 'success', data: branch });
  } catch (err) { next(err); }
};

// PATCH /branches/:id/status
const toggleStatus = async (req, res, next) => {
  try {
    const { is_active } = req.body;
    if (is_active === undefined) {
      return res.status(400).json({ status: 'error', message: 'El campo is_active es requerido' });
    }
    const result = await branchService.toggleStatus({
      branchId:       req.params.id,
      is_active:      Boolean(is_active),
      requestingUser: req.user,
    });
    res.json({ status: 'success', data: result });
  } catch (err) { next(err); }
};

// PUT /branches/:id/receipt
const upsertReceipt = async (req, res, next) => {
  try {
    const branch = await branchService.upsertReceipt({
      branchId:       req.params.id,
      data:           req.body,
      requestingUser: req.user,
    });
    res.json({ status: 'success', data: branch });
  } catch (err) { next(err); }
};

module.exports = { getAll, getById, create, update, toggleStatus, upsertReceipt };