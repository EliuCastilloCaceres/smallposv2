// src/middlewares/uploadImage.js
// Multer con validación reforzada en 3 capas:
//   1) Extensión del nombre (rápido, spoofable)
//   2) mimetype reportado por el cliente (spoofable, pero filtra ruido)
//   3) Magic bytes reales del archivo ya en disco (fuente de verdad)
//
// npm install file-type@16.5.4  (última versión compatible con CommonJS)

const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const FileType = require('file-type'); // v16.5.4 (CJS): expone .fromFile, .fromBuffer, etc.
const { ValidationError } = require('../errors/AppError');

const ALLOWED_EXT  = ['.jpg', '.jpeg', '.png', '.webp'];
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

// Borra un archivo de forma segura (no truena si ya no existe).
// Se usa tanto internamente como desde los controladores, para limpiar
// archivos huérfanos cuando la subida se hizo pero la operación de negocio falló.
const removeFile = (filePath) => {
  if (!filePath) return;
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.error('No se pudo borrar el archivo:', filePath, err.message);
    }
  });
};

const makeStorage = (destination) =>
  multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(destination, { recursive: true });
      cb(null, destination);
    },
    filename: (req, file, cb) => {
      const ext      = path.extname(file.originalname).toLowerCase();
      // Timestamp + bytes aleatorios: evita colisiones en cargas concurrentes
      const unique   = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
      cb(null, `${unique}${ext}`);
    },
  });

// Capa 1 y 2: extensión + mimetype declarado (filtro previo, barato)
const imageFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (!ALLOWED_EXT.includes(ext)) {
    return cb(new ValidationError('Extensión no permitida. Solo JPG, PNG o WEBP.'));
  }
  if (!ALLOWED_MIME.includes(file.mimetype)) {
    return cb(new ValidationError('Tipo MIME no permitido.'));
  }
  cb(null, true);
};

// Capa 3: verificación real del contenido ya guardado en disco.
// Se usa como middleware DESPUÉS de multer, porque diskStorage no expone
// el buffer completo en fileFilter (solo un stream que aún no terminó).
const verifyRealFileType = () => async (req, res, next) => {
  const file = req.file || (req.files && req.files[0]);
  if (!file) return next();

  try {
    const type = await FileType.fromFile(file.path);

    const isValid = type && ALLOWED_MIME.includes(type.mime);

    if (!isValid) {
      removeFile(file.path); // borrar el archivo falso subido
      return next(new ValidationError(
        'El contenido del archivo no coincide con una imagen válida (JPG, PNG o WEBP).'
      ));
    }

    next();
  } catch (err) {
    removeFile(file.path);
    next(err);
  }
};

const uploadProductImage = multer({
  storage: makeStorage(path.join(__dirname, '../../public/images/products')),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

const uploadReceiptImage = multer({
  storage: makeStorage(path.join(__dirname, '../../public/images/receipts')),
  fileFilter: imageFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
});

module.exports = {
  uploadProductImage,
  uploadReceiptImage,
  verifyRealFileType,
  removeFile,
};