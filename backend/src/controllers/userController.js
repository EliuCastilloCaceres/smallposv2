// src/controllers/userController.js
const userService = require('../services/userService');

// GET /users
const getAll = async (req, res, next) => {
  try {
    const result = await userService.getAll({
      requestingUser: req.user,
      filters:        req.query,
    });
    res.json({ status: 'success', ...result });
  } catch (err) { next(err); }
};

// GET /users/:id
const getById = async (req, res, next) => {
  try {
    const user = await userService.getById({
      userId:         req.params.id,
      requestingUser: req.user,
    });
    res.json({ status: 'success', data: user });
  } catch (err) { next(err); }
};

// POST /users
const create = async (req, res, next) => {
  try {
    const user = await userService.create({
      data:           req.body,
      requestingUser: req.user,
    });
    res.status(201).json({ status: 'success', data: user });
  } catch (err) { next(err); }
};

// PUT /users/:id
const update = async (req, res, next) => {
  try {
    const user = await userService.update({
      userId:         req.params.id,
      data:           req.body,
      requestingUser: req.user,
    });
    res.json({ status: 'success', data: user });
  } catch (err) { next(err); }
};

// PATCH /users/:id/password
const changePassword = async (req, res, next) => {
  try {
    const result = await userService.changePassword({
      userId:         req.params.id,
      data:           req.body,
      requestingUser: req.user,
    });
    res.json({ status: 'success', ...result });
  } catch (err) { next(err); }
};

// PATCH /users/:id/status
const toggleStatus = async (req, res, next) => {
  try {
    const { is_active } = req.body;
    if (is_active === undefined) {
      return res.status(400).json({ status: 'error', message: 'El campo is_active es requerido' });
    }
    const user = await userService.toggleStatus({
      userId:         req.params.id,
      is_active:      Boolean(is_active),
      requestingUser: req.user,
    });
    res.json({ status: 'success', data: user });
  } catch (err) { next(err); }
};

module.exports = { getAll, getById, create, update, changePassword, toggleStatus };
