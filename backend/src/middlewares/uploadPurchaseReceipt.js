// src/middlewares/uploadPurchaseReceipt.js
// Comprobante de una compra (specs/14-modulo-de-compras.md, requisito 13), en
// backend/storage/purchase-receipts. Las reglas están en uploadReceipt.js.
const { createReceiptUpload } = require('./uploadReceipt');

const { upload, receiptPath, receiptsDir } = createReceiptUpload({
  dirEnv: 'PURCHASE_RECEIPTS_DIR',
  folder: 'purchase-receipts',
});

module.exports = {
  uploadPurchaseReceipt: upload,
  receiptPath,
  receiptsDir,
};
