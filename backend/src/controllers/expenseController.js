// src/controllers/expenseController.js
// Gastos (specs/12-modulo-de-gastos.md). La sucursal se resuelve aquí: un
// usuario con sucursal siempre opera sobre la suya; el admin central ve todas
// o filtra por una, y al registrar elige la sucursal (branch_id).
const expenseService = require('../services/expenseService');
const { removeFile } = require('../middlewares/uploadImage');
const { receiptPath } = require('../middlewares/uploadExpenseReceipt');
const { sendReceipt } = require('../middlewares/uploadReceipt');
const { resolveBranchId, resolveOptionalBranchId } = require('../helpers/helper');

const canRead = (user) =>
  user.role_name === 'superadmin' || user.permissions.includes('expenses.read');

// GET /expenses?start_date=&end_date=&branch_id=&category_id=&payment_method_id=&provider_id=&status=&search=&page=&limit=
const list = async (req, res, next) => {
  try {
    const q = req.query;
    const result = await expenseService.listExpenses({
      branchId:        resolveOptionalBranchId(req),
      startDate:       q.start_date,
      endDate:         q.end_date,
      categoryId:      q.category_id,
      paymentMethodId: q.payment_method_id,
      providerId:      q.provider_id,
      status:          q.status || 'active',
      search:          q.search,
      page:            q.page,
      limit:           q.limit,
    });
    res.json({ status: 'success', ...result });
  } catch (err) { next(err); }
};

// GET /expenses/options?branch_id=
const options = async (req, res, next) => {
  try {
    const data = await expenseService.getOptions({ branchId: resolveOptionalBranchId(req) });
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

// GET /expenses/:id
const getById = async (req, res, next) => {
  try {
    const data = await expenseService.getExpenseById({
      expenseId: req.params.id,
      branchId:  resolveOptionalBranchId(req),
    });
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

// GET /expenses/:id/receipt — el archivo, para verlo en el navegador
const getReceipt = async (req, res, next) => {
  try {
    const { fileName, originalName } = await expenseService.getReceipt({
      expenseId: req.params.id,
      branchId:  resolveOptionalBranchId(req),
    });
    sendReceipt(res, next, { filePath: receiptPath(fileName), fileName, originalName });
  } catch (err) { next(err); }
};

// POST /expenses (multipart, comprobante opcional en "receipt")
const create = async (req, res, next) => {
  try {
    const data = await expenseService.createExpense({
      branchId:        resolveBranchId(req),
      userId:          req.user.user_id,
      canReadExpenses: canRead(req.user),
      data:            req.body,
      receipt:         req.file ? { fileName: req.file.filename, originalName: req.file.originalname } : null,
    });
    res.status(201).json({ status: 'success', data });
  } catch (err) {
    // Si el gasto no se registró, el comprobante ya guardado sobra
    if (req.file) removeFile(req.file.path);
    next(err);
  }
};

// POST /expenses/:id/cancel  { reason }
const cancel = async (req, res, next) => {
  try {
    const data = await expenseService.cancelExpense({
      expenseId: req.params.id,
      branchId:  resolveOptionalBranchId(req),
      userId:    req.user.user_id,
      reason:    req.body.reason,
    });
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

// PUT /expenses/:id/receipt (multipart, el comprobante en "receipt"): agrega o
// reemplaza el comprobante de un gasto activo (specs/15-comprobante-despues-de-guardar.md)
const replaceReceipt = async (req, res, next) => {
  let result;
  try {
    result = await expenseService.replaceReceipt({
      expenseId: req.params.id,
      branchId:  resolveOptionalBranchId(req),
      userId:    req.user.user_id,
      receipt:   req.file ? { fileName: req.file.filename, originalName: req.file.originalname } : null,
    });
  } catch (err) {
    // Si no se guardó, el comprobante recién subido sobra
    if (req.file) removeFile(req.file.path);
    return next(err);
  }
  // El archivo anterior ya no es de ningún gasto
  if (result.previousFile) removeFile(receiptPath(result.previousFile));
  res.json({ status: 'success', data: result.expense });
};

module.exports = { list, options, getById, getReceipt, create, cancel, replaceReceipt };
