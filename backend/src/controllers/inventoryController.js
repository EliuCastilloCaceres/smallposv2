// src/controllers/inventoryController.js
const inventoryService = require('../services/inventoryService');
const Papa             = require('papaparse');
const {resolveBranchId} = require('../helpers/helper');

// GET /inventory/stock
const getStock = async (req, res, next) => {
  try {
    const branchId = resolveBranchId(req);
    const result   = await inventoryService.getStockByBranch({ branchId, filters: req.query });
    res.json({ status: 'success', ...result });
  } catch (err) { next(err); }
};

// GET /inventory/movements
const getMovements = async (req, res, next) => {
  try {
    const branchId = resolveBranchId(req);
    const result   = await inventoryService.getMovements({ branchId, filters: req.query });
    res.json({ status: 'success', ...result });
  } catch (err) { next(err); }
};

// POST /inventory/adjustments
const createAdjustment = async (req, res, next) => {
  try {
    const branchId = resolveBranchId(req);
    const result   = await inventoryService.createAdjustment({
      branchId,
      productId:     req.body.product_id,
      variantId:     req.body.variant_id   ?? null,
      operationType: req.body.operation_type,
      quantity:      Number(req.body.quantity),
      reason:        req.body.reason,
      userId:        req.user.user_id,
    });
    res.status(201).json({ status: 'success', data: result });
  } catch (err) { next(err); }
};

// GET /inventory/adjustments/bulk/template
const getBulkTemplate = (req, res) => {
  const csv = inventoryService.getBulkAdjustmentTemplate();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="ajuste_inventario.csv"');
  res.send('\uFEFF' + csv);
};

// POST /inventory/adjustments/bulk
const bulkAdjustment = async (req, res, next) => {
  try {
    const branchId    = resolveBranchId(req);
    const contentType = req.headers['content-type'] ?? '';

    let items;

    if (contentType.includes('text/csv')) {
      // Quitar BOM antes de que Papa vea el texto.
      const text = String(req.body).replace(/^\uFEFF/, '');

      // Parseamos SIN header primero — dejamos que Papa detecte el
      // delimitador y decodifique comillas de escape correctamente.
      // Filtrar comentarios con split/startsWith sobre texto crudo
      // (como se hacía antes) se rompe si el archivo pasó por Excel,
      // que puede reescribir el CSV con tabs y campos entrecomillados.
      const raw = Papa.parse(text, { skipEmptyLines: true });
      if (raw.errors.length > 0) {
        return res.status(400).json({
          status:  'error',
          message: 'El archivo CSV tiene errores de formato',
          errors:  raw.errors.map(e => e.message),
        });
      }

      const dataRows = raw.data.filter(row => !String(row[0] ?? '').trim().startsWith('#'));
      if (dataRows.length < 2) {
        return res.status(400).json({ status: 'error', message: 'El archivo no contiene filas de datos' });
      }

      const headerRow = dataRows[0].map(h => String(h).trim().toLowerCase());
      items = dataRows.slice(1).map(cells => {
        const obj = {};
        headerRow.forEach((h, i) => { obj[h] = cells[i] ?? ''; });
        return obj;
      });
    } else {
      items = req.body.items;
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ status: 'error', message: 'No se encontraron items en el archivo' });
    }

    const result = await inventoryService.bulkAdjustment({
      branchId,
      items,
      reason: req.body.reason,
      userId: req.user.user_id,
    });

    const statusCode = result.failed === 0 ? 201 : 207;
    res.status(statusCode).json({ status: 'success', data: result });
  } catch (err) { next(err); }
};

// ── Traspasos ─────────────────────────────────────────────────────────────────

// GET /inventory/transfers
const getTransfers = async (req, res, next) => {
  try {
    const branchId = resolveBranchId(req);
    const result   = await inventoryService.getTransfers({ branchId, filters: req.query });
    res.json({ status: 'success', ...result });
  } catch (err) { next(err); }
};

// POST /inventory/transfers
const requestTransfer = async (req, res, next) => {
  try {
    const fromBranchId = resolveBranchId(req);
    const result       = await inventoryService.requestTransfer({
      fromBranchId,
      toBranchId:  req.body.to_branch_id,
      productId:   req.body.product_id,
      variantId:   req.body.variant_id ?? null,
      quantity:    Number(req.body.quantity),
      notes:       req.body.notes,
      requestedBy: req.user.user_id,
    });
    res.status(201).json({ status: 'success', data: result });
  } catch (err) { next(err); }
};

// POST /inventory/transfers/bulk
const bulkRequestTransfer = async (req, res, next) => {
  try {
    const fromBranchId = resolveBranchId(req);
    const result = await inventoryService.bulkRequestTransfer({
      fromBranchId,
      toBranchId:  req.body.to_branch_id,
      items:       req.body.items,
      notes:       req.body.notes,
      requestedBy: req.user.user_id,
    });
    const statusCode = result.failed === 0 ? 201 : 207;
    res.status(statusCode).json({ status: 'success', data: result });
  } catch (err) { next(err); }
};

// PATCH /inventory/transfers/:id/confirm
const confirmTransfer = async (req, res, next) => {
  try {
    const result = await inventoryService.confirmTransfer({
      transferId:  req.params.id,
      confirmedBy: req.user.user_id,
    });
    res.json({ status: 'success', data: result });
  } catch (err) { next(err); }
};

// PATCH /inventory/transfers/:id/cancel
const cancelTransfer = async (req, res, next) => {
  try {
    const result = await inventoryService.cancelTransfer({ transferId: req.params.id });
    res.json({ status: 'success', data: result });
  } catch (err) { next(err); }
};

module.exports = {
  getStock, getMovements,
  createAdjustment, getBulkTemplate, bulkAdjustment,
  getTransfers, requestTransfer, bulkRequestTransfer, confirmTransfer, cancelTransfer,
};