// src/middlewares/uploadExpenseReceipt.js
// Comprobante de un gasto (specs/12-modulo-de-gastos.md, requisito 10): una
// foto (JPG, PNG o WEBP) o un PDF de hasta 5 MB, en el campo "receipt" de un
// formulario multipart.
//
// A diferencia de las imágenes de productos (uploadImage.js), el comprobante
// NO es público: se guarda fuera de public/, con un nombre generado, y solo
// se descarga con GET /expenses/:id/receipt, que pide permiso y respeta la
// sucursal. En producción la carpeta es un volumen (docker-compose.prod.yml)
// para que no se pierda al reconstruir el contenedor. Los tests la cambian
// con EXPENSE_RECEIPTS_DIR.
//
// Igual que uploadImage.js, se valida en dos pasos: la extensión al recibir
// el archivo y el contenido real (magic bytes) ya en disco.

const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const FileType = require('file-type'); // v16.5.4 (CJS)
const { ValidationError } = require('../errors/AppError');
const { removeFile } = require('./uploadImage');

const MAX_RECEIPT_MB = 5;
const RECEIPT_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
const RECEIPT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const INVALID_TYPE_MESSAGE = 'El comprobante debe ser una foto (JPG, PNG o WEBP) o un PDF.';

const receiptsDir = () =>
  process.env.EXPENSE_RECEIPTS_DIR || path.join(__dirname, '../../storage/expense-receipts');

// Ruta en disco de un comprobante guardado. basename: el nombre lo genera
// este middleware, pero así nunca sale de la carpeta.
const receiptPath = (fileName) => path.resolve(receiptsDir(), path.basename(fileName));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = receiptsDir();
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

const extensionFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!RECEIPT_EXTENSIONS.includes(ext)) return cb(new ValidationError(INVALID_TYPE_MESSAGE));
  cb(null, true);
};

const receiptUpload = multer({
  storage,
  fileFilter: extensionFilter,
  limits: { fileSize: MAX_RECEIPT_MB * 1024 * 1024, files: 1 },
}).single('receipt');

// Errores de multer → 400 con un mensaje en español
const uploadReceipt = (req, res, next) => {
  receiptUpload(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? `El comprobante no puede pesar más de ${MAX_RECEIPT_MB} MB.`
        : 'Solo se acepta un comprobante, en el campo "receipt".';
      return next(new ValidationError(message));
    }
    next(err);
  });
};

// Contenido real del archivo. Si la extensión no coincide con el contenido
// (p. ej. un PNG llamado .jpg), se renombra con la extensión real, para que
// la descarga lleve el tipo correcto.
const verifyReceiptType = async (req, res, next) => {
  if (!req.file) return next();
  try {
    const type = await FileType.fromFile(req.file.path);
    if (!type || !RECEIPT_MIME_TYPES.includes(type.mime)) {
      removeFile(req.file.path);
      return next(new ValidationError(INVALID_TYPE_MESSAGE));
    }
    const realExt = `.${type.ext}`;
    const currentExt = path.extname(req.file.filename).toLowerCase();
    if (realExt !== currentExt && !(realExt === '.jpg' && currentExt === '.jpeg')) {
      const filename = `${path.basename(req.file.filename, path.extname(req.file.filename))}${realExt}`;
      const newPath = path.join(path.dirname(req.file.path), filename);
      fs.renameSync(req.file.path, newPath);
      req.file.filename = filename;
      req.file.path = newPath;
    }
    next();
  } catch (err) {
    removeFile(req.file.path);
    next(err);
  }
};

module.exports = {
  uploadExpenseReceipt: [uploadReceipt, verifyReceiptType],
  receiptPath,
  receiptsDir,
};
