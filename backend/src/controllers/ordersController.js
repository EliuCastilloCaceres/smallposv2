// src/controllers/ordersController.js
// Los controladores son delgados: validan el input y delegan al servicio.
// Nada de lógica de negocio ni queries directas aquí.

const orderService = require('../services/orderService');
const { resolveBranchId, resolveOptionalBranchId } = require('../helpers/helper');

const getOrderById = async (req, res, next) => {
  try {
    // FIX: opcional — en vista consolidada el admin central no manda
    // branch_id al abrir el detalle de una venta; orderService.getOrderById
    // ya trata branchId undefined/null como "sin restricción de sucursal"
    const branchId = resolveOptionalBranchId(req);
    const data = await orderService.getOrderById(parseInt(req.params.orderId), branchId);
    res.json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
};

const getOrdersByDateRange = async (req, res, next) => {
  try {
    const { startDate, endDate, status, search, user_id, page, limit } = req.query;

    // FIX: opcional — "todas las sucursales" es un filtro válido para el
    // admin central, no un error de validación
    const branchId = resolveOptionalBranchId(req)
    const userId   = user_id ? parseInt(user_id) : null;

    const result = await orderService.getOrdersByBranchAndDateRange({
      branchId,
      startDate: startDate ?? '1970-01-01',
      endDate:   endDate   ?? new Date().toISOString().split('T')[0],
      status, search, userId, page, limit,
    });
    res.json({ status: 'success', ...result });
  } catch (err) {
    next(err);
  }
};

// GET /orders/sold-products
// Agregado de productos vendidos (no órdenes) — para la pestaña
// "Productos vendidos" del módulo de Ventas.
const getSoldProducts = async (req, res, next) => {
  try {
    const { startDate, endDate, search, category_id, provider_id, user_id, page, limit } = req.query;

    const branchId    = resolveOptionalBranchId(req);
    const categoryId  = category_id  ? parseInt(category_id)  : null;
    const providerId  = provider_id  ? parseInt(provider_id)  : null;
    const userId      = user_id      ? parseInt(user_id)      : null;

    const result = await orderService.getSoldProducts({
      branchId,
      startDate: startDate ?? '1970-01-01',
      endDate:   endDate   ?? new Date().toISOString().split('T')[0],
      categoryId, providerId, userId, search, page, limit,
    });
    res.json({ status: 'success', ...result });
  } catch (err) {
    next(err);
  }
};

// GET /orders/cashiers
// Lista mínima de cajeros para el <select> de filtro en Ventas / Productos
// vendidos. Sin permiso propio a propósito — ver comentario en
// orderService.getCashiers.
const getCashiers = async (req, res, next) => {
  try {
    const branchId = resolveOptionalBranchId(req);
    const data = await orderService.getCashiers({ branchId });
    res.json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
};

const createOrder = async (req, res, next) => {
  try {
    const {
      cashRegisterId, customerId,
      subtotal, discount, total,
      payments,
      notes, items,
      due_date,
    } = req.body;

    if (!Array.isArray(payments)) {
      return res.status(400).json({ status: 'error', message: 'payments debe ser un arreglo' });
    }

    const branchId = resolveBranchId(req)
    const userId   = req.user.user_id;

    const result = await orderService.createOrder({
      branchId, cashRegisterId, customerId, userId,
      subtotal, discount, total,
      payments,
      notes, items,
      dueDate: due_date ?? null,
    });

    res.status(201).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

const cancelOrder = async (req, res, next) => {
  try {
    const orderId  = parseInt(req.params.orderId);
    const userId   = req.user.user_id;
    const branchId = resolveBranchId(req);

    const result = await orderService.cancelOrder({ orderId, userId, branchId });
    res.json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

module.exports = { getOrderById, getOrdersByDateRange, getSoldProducts, getCashiers, createOrder, cancelOrder };