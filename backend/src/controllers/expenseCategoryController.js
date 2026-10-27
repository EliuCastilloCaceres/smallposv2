// src/controllers/expenseCategoryController.js
const expenseCategoryService = require('../services/expenseCategoryService');

// GET /expense-categories
const getAll = async (req, res, next) => {
  try {
    res.json({ status: 'success', data: await expenseCategoryService.getAll() });
  } catch (err) { next(err); }
};

// POST /expense-categories  { name, counts_in_net_profit }
const create = async (req, res, next) => {
  try {
    const data = await expenseCategoryService.create({
      name:              req.body.name,
      countsInNetProfit: req.body.counts_in_net_profit,
    });
    res.status(201).json({ status: 'success', data });
  } catch (err) { next(err); }
};

// PUT /expense-categories/:id  { name, counts_in_net_profit }
const update = async (req, res, next) => {
  try {
    const data = await expenseCategoryService.update(req.params.id, {
      name:              req.body.name,
      countsInNetProfit: req.body.counts_in_net_profit,
    });
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

// PATCH /expense-categories/:id/status  { is_active }
const setStatus = async (req, res, next) => {
  try {
    if (req.body.is_active === undefined) {
      return res.status(400).json({ status: 'error', message: 'El campo is_active es requerido' });
    }
    const data = await expenseCategoryService.setStatus(req.params.id, req.body.is_active);
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

module.exports = { getAll, create, update, setStatus };
