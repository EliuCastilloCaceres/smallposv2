// src/middlewares/uploadExpenseReceipt.js
// Comprobante de un gasto (specs/12-modulo-de-gastos.md, requisito 10), en
// backend/storage/expense-receipts. Las reglas están en uploadReceipt.js.
const { createReceiptUpload } = require('./uploadReceipt');

const { upload, receiptPath, receiptsDir } = createReceiptUpload({
  dirEnv: 'EXPENSE_RECEIPTS_DIR',
  folder: 'expense-receipts',
});

module.exports = {
  uploadExpenseReceipt: upload,
  receiptPath,
  receiptsDir,
};
