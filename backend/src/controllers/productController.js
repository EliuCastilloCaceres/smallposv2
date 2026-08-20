// src/controllers/productController.js
const path            = require('path');
const productService  = require('../services/productService');
const Papa             = require('papaparse');
const { removeFile }   = require('../middlewares/uploadImage');
const { ValidationError } = require('../errors/AppError');

// Carpeta pública donde uploadImage.js guarda las imágenes de producto.
// Debe coincidir con el destino configurado en uploadProductImage.
const PRODUCTS_IMAGE_DIR = path.join(__dirname, '../../public/images/products');

// req.body llega con strings cuando el request es multipart/form-data
// (subida de archivo), a diferencia de JSON donde ya vienen tipados.
const parseBoolField = (value) => value === 'true' || value === true;

const parseVariantsField = (value) => {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value; // ya viene como array (request JSON puro, sin archivo)
  try {
    return JSON.parse(value);
  } catch {
    throw new ValidationError('El campo "variants" debe ser un JSON válido');
  }
};

// GET /products
const getAll = async (req, res, next) => {
  try {
    const result = await productService.getAllProducts({ filters: req.query });
    res.json({ status: 'success', ...result });
  } catch (err) { next(err); }
};

// GET /products/:id
const getById = async (req, res, next) => {
  try {
    const product = await productService.getProductById(req.params.id);
    res.json({ status: 'success', data: product });
  } catch (err) { next(err); }
};

// POST /products
// multipart/form-data: campo "image" (archivo, opcional) + resto de campos como texto.
const create = async (req, res, next) => {
  try {
    // req.file lo agrega uploadProductImage.single('image') si vino un archivo válido
    const image = req.file
      ? `/api/product/images/${req.file.filename}`
      : (req.body.image ?? null); // fallback: por si algún flujo sigue mandando una URL como texto

    const product = await productService.createProduct({
      userId:        req.user.user_id,
      providerId:    req.body.provider_id,
      categoryId:    req.body.category_id     ?? null,
      isVariable:    parseBoolField(req.body.is_variable),
      sku:           req.body.sku,
      name:          req.body.name,
      description:   req.body.description,
      color:         req.body.color,
      purchasePrice: req.body.purchase_price,
      salePrice:     req.body.sale_price,
      uom:           req.body.uom,
      image,
      variants:      parseVariantsField(req.body.variants),
    });
    res.status(201).json({ status: 'success', data: product });
  } catch (err) {
    // Si multer ya guardó el archivo pero createProduct falló (ej. SKU duplicado,
    // validación), no dejamos el archivo huérfano en disco.
    if (req.file) removeFile(req.file.path);
    next(err);
  }
};

// PUT /products/:id
const update = async (req, res, next) => {
  // Ruta del archivo viejo en disco, si hay que borrarlo al final.
  // Se resuelve ANTES del try principal porque necesitamos su valor también
  // en caso de éxito, no solo en el catch.
  let oldImageDiskPath = null;

  try {
    // Solo nos importa la imagen anterior si de verdad se está reemplazando
    if (req.file) {
      const current = await productService.getProductById(req.params.id);
      if (current.image) {
        // current.image se guarda como URL pública, ej: /api/product/images/xxx.jpg
      // (coincide con el mount de express.static en index.js: /api/product/images -> public/images/products)
        const filename = path.basename(current.image);
        oldImageDiskPath = path.join(PRODUCTS_IMAGE_DIR, filename);
      }
    }

    const isVariableRaw = req.body.is_variable;
    const isVariable = isVariableRaw !== undefined ? parseBoolField(isVariableRaw) : undefined;

    const newImage = req.file
      ? `/api/product/images/${req.file.filename}`
      : undefined; // undefined = "no tocar la imagen actual" (ver productService.updateProduct)

    const product = await productService.updateProduct({
      productId: req.params.id,
      updates: {
        name:          req.body.name,
        sku:           req.body.sku,
        description:   req.body.description,
        color:         req.body.color,
        purchasePrice: req.body.purchase_price,
        salePrice:     req.body.sale_price,
        uom:           req.body.uom,
        providerId:    req.body.provider_id,
        categoryId:    req.body.category_id,
        isVariable,
      },
      newImage,
      variants: parseVariantsField(req.body.variants),
      userId: req.user.user_id,
    });

    // Recién AHORA que el update fue exitoso borramos la imagen anterior.
    // Si borráramos antes y el update fallara, quedaríamos sin la imagen vieja
    // Y sin la nueva guardada en la base de datos.
    if (oldImageDiskPath) removeFile(oldImageDiskPath);

    res.json({ status: 'success', data: product });
  } catch (err) {
    // El update falló: limpiamos el archivo NUEVO que multer ya guardó,
    // pero dejamos intacta la imagen vieja (sigue siendo la válida).
    if (req.file) removeFile(req.file.path);
    next(err);
  }
};

// PATCH /products/:id/status
const toggleStatus = async (req, res, next) => {
  try {
    const { is_active } = req.body;
    if (is_active === undefined) {
      return res.status(400).json({ status: 'error', message: 'El campo is_active es requerido' });
    }
    const product = await productService.toggleStatus({
      productId: req.params.id,
      is_active: Boolean(is_active),
    });
    res.json({ status: 'success', data: product });
  } catch (err) { next(err); }
};

// ── Variantes ─────────────────────────────────────────────────────────────────

// GET /products/:id/variants
const getVariants = async (req, res, next) => {
  try {
    const variants = await productService.getVariantsByProduct(req.params.id);
    res.json({ status: 'success', data: variants });
  } catch (err) { next(err); }
};

// PATCH /products/:id/variants/:variantId/deactivate
const deactivateVariant = async (req, res, next) => {
  try {
    await productService.deactivateVariant({
      variantId: req.params.variantId,
      productId: req.params.id,
    });
    res.json({ status: 'success', message: 'Variante desactivada' });
  } catch (err) { next(err); }
};

// ── Carga masiva ──────────────────────────────────────────────────────────────

// GET /products/bulk/template
const getBulkTemplate = (req, res) => {
  const csv = productService.getBulkTemplate();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla_productos.csv"');
  res.send('\uFEFF' + csv);
};

// POST /products/bulk
const bulkCreate = async (req, res, next) => {
  try {
    let products;
    const contentType = req.headers['content-type'] ?? '';

    if (contentType.includes('text/csv')) {
      const result = Papa.parse(req.body, {
        header: true, skipEmptyLines: true,
        transformHeader: h => h.trim().toLowerCase(),
      });
      if (result.errors.length > 0) {
        return res.status(400).json({
          status: 'error',
          message: 'El archivo CSV tiene errores de formato',
          errors: result.errors.map(e => e.message),
        });
      }
      products = result.data;
    } else {
      products = req.body.products;
    }

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ status: 'error', message: 'No se encontraron productos en el archivo' });
    }

    const result = await productService.bulkCreateProducts({
      products,
      userId: req.user.user_id,
    });

    const statusCode = result.failed === 0 ? 201 : 207;
    res.status(statusCode).json({ status: 'success', data: result });
  } catch (err) { next(err); }
};

module.exports = {
  getAll, getById, create, update, toggleStatus,
  getVariants, deactivateVariant,
  getBulkTemplate, bulkCreate,
};