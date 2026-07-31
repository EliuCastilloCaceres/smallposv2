// src/controllers/productController.js
const productService = require('../services/productService');
const Papa           = require('papaparse');

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
const create = async (req, res, next) => {
  try {
    const product = await productService.createProduct({
      userId:        req.user.user_id,
      providerId:    req.body.provider_id,
      categoryId:    req.body.category_id     ?? null,
      isVariable:    Boolean(req.body.is_variable),
      sku:           req.body.sku,
      name:          req.body.name,
      description:   req.body.description,
      color:         req.body.color,
      purchasePrice: req.body.purchase_price,
      salePrice:     req.body.sale_price,
      uom:           req.body.uom,
      image:         req.body.image,
      variants:      req.body.variants        ?? [],
    });
    res.status(201).json({ status: 'success', data: product });
  } catch (err) { next(err); }
};

// PUT /products/:id
const update = async (req, res, next) => {
  try {
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
        isVariable:    req.body.is_variable,
      },
      newImage:  req.body.image,
      variants:  req.body.variants ?? [],
      userId: req.user.user_id,
    });
    res.json({ status: 'success', data: product });
  } catch (err) { next(err); }
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