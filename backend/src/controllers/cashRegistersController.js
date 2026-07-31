// src/controllers/cashRegistersController.js
const cashRegService = require('../services/cashRegisterService');
const { resolveBranchId } = require('../helpers/helper');

const getAll = async (req, res, next) => {
  try {
    const branchId = resolveBranchId(req);
    res.json({ status: 'success', data: await cashRegService.getAllRegisters(branchId) });
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const branchId = resolveBranchId(req);
    res.status(201).json({ status: 'success', data: await cashRegService.createRegister({ branchId, name: req.body.name }) });
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const { name } = req.body;
    const { registerId } = req.params;

    // [FIX] Validación de ID numérico (faltaba en este endpoint)
    if (!registerId || isNaN(Number(registerId))) {
      return res.status(400).json({ status: 'error', message: 'El ID de la caja es requerido y debe ser numérico.' });
    }

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ status: 'error', message: 'El nombre es requerido y no puede estar vacío.' });
    }

    const cleanId = parseInt(registerId, 10);
    const cleanName = name.trim();

    // [FIX] Pasa branchId al service para filtrar por sucursal
    const updatedRegister = await cashRegService.updateRegister({
      cashRegisterId: cleanId,
      branchId: resolveBranchId(req),
      registerName: cleanName,
    });

    res.json({ 
      status: 'success', 
      data: updatedRegister 
    });

  } catch (err) { 
    next(err); 
  }
};

const toggleStatus = async (req, res, next) => {
  try {
    const { is_active } = req.body;
    if (is_active === undefined) {
      return res.status(400).json({ status: 'error', message: 'El campo is_active es requerido' });
    }

    // [FIX] Validación de ID numérico
    const { registerId } = req.params;
    if (!registerId || isNaN(Number(registerId))) {
      return res.status(400).json({ status: 'error', message: 'El ID de la caja es requerido y debe ser numérico.' });
    }

    // [FIX] Normalización consistente con los services (evita Boolean("false") === true)
    const normalizedIsActive = is_active === 'true' || is_active === '1' || is_active === true || is_active === 1;

    const result = await cashRegService.toggleRegisterStatus({
      cashRegisterId: parseInt(registerId, 10),
      branchId: resolveBranchId(req),          // [FIX] Pasa branchId para filtrar
      is_active: normalizedIsActive,
      requestingUser: req.user,
    });
    res.json({ status: 'success', data: result });
  } catch (err) { next(err); }
};

const open = async (req, res, next) => {
  try {
    // [FIX] Validación de ID numérico
    const { registerId } = req.params;
    if (!registerId || isNaN(Number(registerId))) {
      return res.status(400).json({ status: 'error', message: 'El ID de la caja es requerido y debe ser numérico.' });
    }
    const data = await cashRegService.openRegister({
      cashRegisterId: parseInt(registerId, 10),
      branchId:       resolveBranchId(req),
      userId:         req.user.user_id,
      openAmount:     parseFloat(req.body.openAmount ?? 0),
    });
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

const close = async (req, res, next) => {
  try {
    // [FIX] Validación de ID numérico
    const { registerId } = req.params;
    if (!registerId || isNaN(Number(registerId))) {
      return res.status(400).json({ status: 'error', message: 'El ID de la caja es requerido y debe ser numérico.' });
    }
    const data = await cashRegService.closeRegister({
      cashRegisterId: parseInt(registerId, 10),
      branchId:       resolveBranchId(req),
      userId:         req.user.user_id,
      closeAmount:    parseFloat(req.body.closeAmount ?? 0),
    });
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

const getStatus = async (req, res, next) => {
  try {
    // [FIX] Validación de ID numérico
    const { registerId } = req.params;
    if (!registerId || isNaN(Number(registerId))) {
      return res.status(400).json({ status: 'error', message: 'El ID de la caja es requerido y debe ser numérico.' });
    }
    const data = await cashRegService.getSessionStatus({
      cashRegisterId: parseInt(registerId, 10),
      branchId:       resolveBranchId(req),
    });
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

const createMovement = async (req, res, next) => {
  try {
    // [FIX] Validación de ID numérico
    const { registerId } = req.params;
    if (!registerId || isNaN(Number(registerId))) {
      return res.status(400).json({ status: 'error', message: 'El ID de la caja es requerido y debe ser numérico.' });
    }
    const data = await cashRegService.createMovement({
      cashRegisterId: parseInt(registerId, 10),
      branchId:       resolveBranchId(req),
      userId:         req.user.user_id,
      movementType:   req.body.movementType,
      amount:         parseFloat(req.body.amount),
      description:    req.body.description,
    });
    res.status(201).json({ status: 'success', data });
  } catch (err) { next(err); }
};

module.exports = { getAll, create, update, toggleStatus, open, close, getStatus, createMovement };