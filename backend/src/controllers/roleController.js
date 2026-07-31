// src/controllers/roleController.js
const roleService = require('../services/roleService');

// ─── Roles ────────────────────────────────────────────────────────────────────

// GET /roles
const getAllRoles = async (req, res, next) => {
  try {
    const roles = await roleService.getAllRoles({ filters: req.query });
    res.json({ status: 'success', data: roles });
  } catch (err) { next(err); }
};

// GET /roles/:id
const getRoleById = async (req, res, next) => {
  try {
    const role = await roleService.getRoleById(req.params.id);
    res.json({ status: 'success', data: role });
  } catch (err) { next(err); }
};

// POST /roles
const createRole = async (req, res, next) => {
  try {
    const role = await roleService.createRole({
      data:           req.body,
      requestingUser: req.user,
    });
    res.status(201).json({ status: 'success', data: role });
  } catch (err) { next(err); }
};

// PUT /roles/:id
const updateRole = async (req, res, next) => {
  try {
    const role = await roleService.updateRole({
      roleId:         req.params.id,
      data:           req.body,
      requestingUser: req.user,
    });
    res.json({ status: 'success', data: role });
  } catch (err) { next(err); }
};

// PATCH /roles/:id/status
const toggleRoleStatus = async (req, res, next) => {
  try {
    const { is_active } = req.body;
    if (is_active === undefined) {
      return res.status(400).json({ status: 'error', message: 'El campo is_active es requerido' });
    }
    const result = await roleService.toggleRoleStatus({
      roleId:         req.params.id,
      is_active:      Boolean(is_active),
      requestingUser: req.user,
    });
    res.json({ status: 'success', data: result });
  } catch (err) { next(err); }
};

// ─── Permisos ─────────────────────────────────────────────────────────────────

// GET /permissions
const getAllPermissions = async (req, res, next) => {
  try {
    const permissions = await roleService.getAllPermissions();
    res.json({ status: 'success', data: permissions });
  } catch (err) { next(err); }
};

// PUT /roles/:id/permissions
const syncRolePermissions = async (req, res, next) => {
  try {
    const { permission_ids } = req.body;
    if (!Array.isArray(permission_ids)) {
      return res.status(400).json({ status: 'error', message: 'permission_ids debe ser un array' });
    }
    const role = await roleService.syncRolePermissions({
      roleId:        req.params.id,
      permissionIds: permission_ids,
      requestingUser: req.user,
    });
    res.json({ status: 'success', data: role });
  } catch (err) { next(err); }
};

module.exports = {
  getAllRoles,
  getRoleById,
  createRole,
  updateRole,
  toggleRoleStatus,
  getAllPermissions,
  syncRolePermissions,
};
