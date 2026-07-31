// src/controllers/customersController.js
const customerService = require('../services/customerService');

// GET /customers
const getAll = async (req, res, next) => {
  try {
    const result = await customerService.getAllCustomers({ filters: req.query });
    res.json({ status: 'success', ...result });
  } catch (err) { next(err); }
};

// GET /customers/:id
const getById = async (req, res, next) => {
  try {
    const customer = await customerService.getCustomerById(req.params.id);
    res.json({ status: 'success', data: customer });
  } catch (err) { next(err); }
};

// POST /customers
const create = async (req, res, next) => {
  try {
    const customer = await customerService.createCustomer(req.body);
    res.status(201).json({ status: 'success', data: customer });
  } catch (err) { next(err); }
};

// PUT /customers/:id
const update = async (req, res, next) => {
  try {
    // Verificar si el usuario tiene permiso de crédito para editar credit_limit.
    // requirePermission ya validó customers.update — aquí solo chequeamos credit.create
    // consultando directamente en BD con el role_id del token.
    const db = require('../config/db');
    const [[creditPerm]] = await db.query(
      `SELECT 1 FROM role_permissions rp
       JOIN permissions p ON rp.permission_id = p.permission_id
       WHERE rp.role_id = ? AND p.module = 'credit' AND p.action = 'create'
       LIMIT 1`,
      [req.user.role_id]
    );
    const canEditCredit = !!creditPerm;

    const customer = await customerService.updateCustomer(
      req.params.id,
      req.body,
      { canEditCredit }
    );
    res.json({ status: 'success', data: customer });
  } catch (err) { next(err); }
};

// PATCH /customers/:id/status
const toggleStatus = async (req, res, next) => {
  try {
    const { is_active } = req.body;
    if (is_active === undefined) {
      return res.status(400).json({ status: 'error', message: 'El campo is_active es requerido' });
    }
    const customer = await customerService.toggleStatus(req.params.id, Boolean(is_active));
    res.json({ status: 'success', data: customer });
  } catch (err) { next(err); }
};

// ─── Historial ────────────────────────────────────────────────────────────────

// GET /customers/:id/orders
const getOrders = async (req, res, next) => {
  try {
    const orders = await customerService.getCustomerOrders(
      req.params.id,
      { limit: req.query.limit }
    );
    res.json({ status: 'success', data: orders });
  } catch (err) { next(err); }
};

// GET /customers/:id/credits
const getCredits = async (req, res, next) => {
  try {
    const credits = await customerService.getCustomerCredits(req.params.id);
    res.json({ status: 'success', data: credits });
  } catch (err) { next(err); }
};

// GET /customers/:id/layaways
const getLayaways = async (req, res, next) => {
  try {
    const layaways = await customerService.getCustomerLayaways(req.params.id);
    res.json({ status: 'success', data: layaways });
  } catch (err) { next(err); }
};

module.exports = {
  getAll, getById, create, update, toggleStatus,
  getOrders, getCredits, getLayaways,
};
