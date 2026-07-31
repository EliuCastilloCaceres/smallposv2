// src/middlewares/uploadImage.js
// Una sola definición de multer con configuración por destino.
// Reemplaza uploadProductImage.js y uploadReceiptImage.js separados.
// El problema original: product_id llegaba como undefined porque el
// middleware se ejecutaba antes de que el body estuviera parseado.
// Solución: el filename ahora usa Date.now() + extensión, y el
// controlador es responsable de renombrar si necesita incluir el ID.

const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const makeStorage = (destination) =>
  multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(destination, { recursive: true });
      cb(null, destination);
    },
    filename: (req, file, cb) => {
      const ext      = path.extname(file.originalname).toLowerCase();
      const filename = `${Date.now()}${ext}`;
      cb(null, filename);
    },
  });

const imageFilter = (req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
  const ext     = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten imágenes JPG, PNG o WEBP'), false);
  }
};

const uploadProductImage = multer({
  storage: makeStorage(path.join(__dirname, '../../public/images/products')),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

const uploadReceiptImage = multer({
  storage: makeStorage(path.join(__dirname, '../../public/images/receipt')),
  fileFilter: imageFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
});

module.exports = { uploadProductImage, uploadReceiptImage };
