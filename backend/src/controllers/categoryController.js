// src/controllers/categoryController.js
const categoryService = require('../services/categoryService');

// GET /categories
const getAll = async (req, res, next) => {
  try {
    const result = await categoryService.getAll({ filters: req.query });
    res.json({ status: 'success', ...result });
  } catch (err) { next(err); }
};

// GET /categories/:id
const getById = async (req, res, next) => {
  try {
    const category = await categoryService.getById(req.params.id);
    res.json({ status: 'success', data: category });
  } catch (err) { next(err); }
};

// POST /categories
const create = async (req, res, next) => {
  try {
    const category = await categoryService.create({
      data:           req.body,
      requestingUser: req.user,
    });
    res.status(201).json({ status: 'success', data: category });
  } catch (err) { next(err); }
};

// PUT /categories/:id
const update = async (req, res, next) => {
  try {
    const category = await categoryService.update({
      categoryId:     req.params.id,
      data:           req.body,
      requestingUser: req.user,
    });
    res.json({ status: 'success', data: category });
  } catch (err) { next(err); }
};

// PATCH /categories/:id/status
const toggleStatus = async (req, res, next) => {
  try {
    const { is_active } = req.body;
    if (is_active === undefined) {
      return res.status(400).json({ status: 'error', message: 'El campo is_active es requerido' });
    }
    const result = await categoryService.toggleStatus({
      categoryId:     req.params.id,
      is_active:      Boolean(is_active),
      requestingUser: req.user,
    });
    res.json({ status: 'success', data: result });
  } catch (err) { next(err); }
};

// GET /categories/branch/:branchId
// Todas las categorías activas + si están visibles/ocultas para esa sucursal.
// Para la UI de administración (BranchCategoriesModal).
const getVisibilityForBranch = async (req, res, next) => {
  try {
    const data = await categoryService.getVisibilityForBranch(req.params.branchId);
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

// GET /categories/branch/:branchId/visible
// Solo las categorías que debe mostrar esa sucursal. Para el módulo de POS.
const getVisibleForBranch = async (req, res, next) => {
  try {
    const data = await categoryService.getVisibleForBranch(req.params.branchId);
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

// PUT /categories/branch/:branchId
const setHiddenForBranch = async (req, res, next) => {
  try {
    const data = await categoryService.setHiddenForBranch({
      branchId:          req.params.branchId,
      hiddenCategoryIds: req.body.hidden_category_ids,
      requestingUser:    req.user,
    });
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

module.exports = {
  getAll, getById, create, update, toggleStatus,
  getVisibilityForBranch, getVisibleForBranch, setHiddenForBranch,
};