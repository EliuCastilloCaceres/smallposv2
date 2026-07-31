const express = require('express');
const router = express.Router();
const { uploadProductImage, uploadReceiptImage } = require('../middlewares/uploadImage');
const { verifyToken } = require('../middlewares/auth');
const { ValidationError } = require('../errors/AppError');

// POST /api/upload/product
router.post('/product', verifyToken, uploadProductImage.single('image'), (req, res, next) => {
  try {
    if (!req.file) throw new ValidationError('No se subió ninguna imagen');
    const url = `/api/product/images/${req.file.filename}`;
    res.json({ status: 'success', data: { url, filename: req.file.filename } });
  } catch (err) { next(err); }
});

// POST /api/upload/receipt
router.post('/receipt', verifyToken, uploadReceiptImage.single('image'), (req, res, next) => {
  try {
    if (!req.file) throw new ValidationError('No se subió ninguna imagen');
    const url = `/api/receipt/images/${req.file.filename}`;
    res.json({ status: 'success', data: { url, filename: req.file.filename } });
  } catch (err) { next(err); }
});

module.exports = router;
