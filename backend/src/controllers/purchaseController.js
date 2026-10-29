// src/controllers/purchaseController.js
// Compras (specs/14-modulo-de-compras.md). La sucursal se resuelve aquí: un
// usuario con sucursal siempre opera sobre la suya; el admin central ve todas
// o filtra por una, y al registrar elige la sucursal (branch_id).
const purchaseService = require('../services/purchaseService');
const { removeFile } = require('../middlewares/uploadImage');
const { receiptPath } = require('../middlewares/uploadPurchaseReceipt');
const { sendReceipt } = require('../middlewares/uploadReceipt');
const { resolveBranchId, resolveOptionalBranchId } = require('../helpers/helper');

const canRead = (user) =>
  user.role_name === 'superadmin' || user.permissions.includes('purchases.read');

// GET /purchases?start_date=&end_date=&branch_id=&provider_id=&payment_method_id=&status=&search=&page=&limit=
const list = async (req, res, next) => {
  try {
    const q = req.query;
    const result = await purchaseService.listPurchases({
      branchId:        resolveOptionalBranchId(req),
      startDate:       q.start_date,
      endDate:         q.end_date,
      providerId:      q.provider_id,
      paymentMethodId: q.payment_method_id,
      status:          q.status || 'active',
      search:          q.search,
      page:            q.page,
      limit:           q.limit,
    });
    res.json({ status: 'success', ...result });
  } catch (err) { next(err); }
};

// GET /purchases/options?branch_id=
const options = async (req, res, next) => {
  try {
    const data = await purchaseService.getOptions({ branchId: resolveOptionalBranchId(req) });
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

// GET /purchases/products?search=&branch_id=
const products = async (req, res, next) => {
  try {
    const data = await purchaseService.searchProducts({
      branchId: resolveOptionalBranchId(req),
      search:   req.query.search,
    });
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

// GET /purchases/:id
const getById = async (req, res, next) => {
  try {
    const data = await purchaseService.getPurchaseById({
      purchaseId: req.params.id,
      branchId:   resolveOptionalBranchId(req),
    });
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

// GET /purchases/:id/receipt — el archivo, para verlo en el navegador
const getReceipt = async (req, res, next) => {
  try {
    const { fileName, originalName } = await purchaseService.getReceipt({
      purchaseId: req.params.id,
      branchId:   resolveOptionalBranchId(req),
    });
    sendReceipt(res, next, { filePath: receiptPath(fileName), fileName, originalName });
  } catch (err) { next(err); }
};

// POST /purchases (multipart: comprobante opcional en "receipt" y las líneas
// en "items" como JSON; o JSON sin comprobante)
const create = async (req, res, next) => {
  try {
    const data = await purchaseService.createPurchase({
      branchId:         resolveBranchId(req),
      userId:           req.user.user_id,
      canReadPurchases: canRead(req.user),
      data:             req.body,
      receipt:          req.file ? { fileName: req.file.filename, originalName: req.file.originalname } : null,
    });
    res.status(201).json({ status: 'success', data });
  } catch (err) {
    // Si la compra no se registró, el comprobante ya guardado sobra
    if (req.file) removeFile(req.file.path);
    next(err);
  }
};

// POST /purchases/:id/cancel  { reason }
const cancel = async (req, res, next) => {
  try {
    const data = await purchaseService.cancelPurchase({
      purchaseId: req.params.id,
      branchId:   resolveOptionalBranchId(req),
      userId:     req.user.user_id,
      reason:     req.body.reason,
    });
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

// PUT /purchases/:id/receipt (multipart, el comprobante en "receipt"): agrega o
// reemplaza el comprobante de una compra activa (specs/15-comprobante-despues-de-guardar.md)
const replaceReceipt = async (req, res, next) => {
  let result;
  try {
    result = await purchaseService.replaceReceipt({
      purchaseId: req.params.id,
      branchId:   resolveOptionalBranchId(req),
      userId:     req.user.user_id,
      receipt:    req.file ? { fileName: req.file.filename, originalName: req.file.originalname } : null,
    });
  } catch (err) {
    // Si no se guardó, el comprobante recién subido sobra
    if (req.file) removeFile(req.file.path);
    return next(err);
  }
  // El archivo anterior ya no es de ninguna compra
  if (result.previousFile) removeFile(receiptPath(result.previousFile));
  res.json({ status: 'success', data: result.purchase });
};

module.exports = { list, options, products, getById, getReceipt, create, cancel, replaceReceipt };
