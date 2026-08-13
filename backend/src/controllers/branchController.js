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

// GET /branches/list
// Listado mínimo para selectores de otros módulos (ej. el filtro de
// sucursal en Créditos) — sin el permiso branches:read ni la restricción a
// la sucursal propia de getAll, porque no es una pantalla de
// administración: solo expone branch_id + name de sucursales activas.
const getActiveList = async (req, res, next) => {
  try {
    const branches = await branchService.getActiveList();
    res.json({ status: 'success', data: branches });
  } catch (err) { next(err); }
};

// GET /branches/me
// Cualquier usuario autenticado puede consultar SU PROPIA sucursal (incluye
// receipt) — a diferencia de GET /branches/:id, que exige el permiso
// settings:read porque es para administración. Un cajero necesita estos
// datos para imprimir el ticket, no para "administrar" sucursales.
const getMyBranch = async (req, res, next) => {
  try {
    if (req.user.branch_id === null) {
      return res.status(400).json({ status: 'error', message: 'Este usuario no tiene una sucursal asignada' });
    }
    const branch = await branchService.getById({
      branchId:       req.user.branch_id,
      requestingUser: req.user,
    });
    res.json({ status: 'success', data: branch });
  } catch (err) { next(err); }
};

module.exports = { getAll, getById, getMyBranch, getActiveList, create, update, toggleStatus, upsertReceipt };