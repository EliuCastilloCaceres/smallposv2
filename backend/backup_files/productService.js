// src/services/productService.js
// Catálogo de productos GLOBAL — sin branch_id.
// El inventario (stock) sigue siendo por sucursal en inventory_stock.

const db = require('../config/db');
const { NotFoundError, ConflictError, ValidationError } = require('../errors/AppError');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRODUCT_COLUMNS = `
  p.product_id, p.provider_id, p.category_id,
  (p.is_variable = 1) AS is_variable,
  p.sku, p.name, p.description, p.color,
  p.purchase_price, p.sale_price, p.uom, p.image,
  p.is_active, p.created_at, p.updated_at,
  pr.name  AS provider_name,
  c.name   AS category_name,
  c.color  AS category_color
`;

const BASE_JOINS = `
  LEFT JOIN providers pr ON p.provider_id = pr.provider_id
  LEFT JOIN categories c ON p.category_id = c.category_id
`;

const validate = {
  name: (v) => {
    if (!v || typeof v !== 'string' || !v.trim())
      throw new ValidationError('El nombre del producto es requerido');
    if (v.trim().length > 100)
      throw new ValidationError('El nombre no puede superar los 100 caracteres');
  },
  price: (v, field) => {
    if (v === undefined || v === null || isNaN(Number(v)) || Number(v) < 0)
      throw new ValidationError(`${field} debe ser un número mayor o igual a 0`);
  },
  sku: (v) => {
    if (v && v.length > 255)
      throw new ValidationError('El SKU no puede superar los 255 caracteres');
  },
};

const UOM_OPTIONS = ['pza', 'kg', 'g', 'lt', 'ml', 'mt', 'cm', 'par', 'cja', 'paq'];

// ─── getAllProducts ────────────────────────────────────────────────────────────

const getAllProducts = async ({ filters = {} } = {}) => {
  const {
    search, category_id, provider_id, is_active,
    page = 1, limit = 20,
  } = filters;

  const safeLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
  const safePage  = Math.max(parseInt(page) || 1, 1);
  const offset    = (safePage - 1) * safeLimit;

  const conditions = [];
  const params     = [];

  if (is_active !== undefined && is_active !== '') {
    conditions.push('p.is_active = ?');
    params.push(is_active === 'true' || is_active === '1' ? 1 : 0);
  } else {
    conditions.push('p.is_active = 1');
  }

  if (category_id) { conditions.push('p.category_id = ?'); params.push(category_id); }
  if (provider_id) { conditions.push('p.provider_id = ?'); params.push(provider_id); }

  if (search) {
    conditions.push('(p.name LIKE ? OR p.sku LIKE ? OR p.description LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [[{ total }]] = await db.query(
    `SELECT COUNT(DISTINCT p.product_id) AS total FROM products p ${where}`,
    params
  );

  const [rows] = await db.query(
    `SELECT ${PRODUCT_COLUMNS}
     FROM products p ${BASE_JOINS}
     ${where}
     ORDER BY p.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset]
  );

  return {
    data: rows,
    pagination: { total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) },
  };
};

// ─── getProductById ───────────────────────────────────────────────────────────

const getProductById = async (productId) => {
  const [rows] = await db.query(
    `SELECT ${PRODUCT_COLUMNS}
     FROM products p ${BASE_JOINS}
     WHERE p.product_id = ?`,
    [productId]
  );
  if (rows.length === 0) throw new NotFoundError('Producto no encontrado');
  return rows[0];
};

// ─── createProduct ────────────────────────────────────────────────────────────

const createProduct = async ({
  providerId, categoryId, isVariable,
  sku, name, description, color,
  purchasePrice, salePrice, uom,
  image, variants = [], userId,
}) => {
  validate.name(name);
  validate.price(purchasePrice, 'El precio de compra');
  validate.price(salePrice, 'El precio de venta');
  validate.sku(sku);

  if (uom && !UOM_OPTIONS.includes(uom))
    throw new ValidationError(`Unidad de medida inválida. Opciones: ${UOM_OPTIONS.join(', ')}`);

  if (sku) {
    const [[existing]] = await db.query(
      'SELECT product_id FROM products WHERE sku = ?',
      [sku]
    );
    if (existing) throw new ConflictError(`El SKU "${sku}" ya existe`);
  }

  if (isVariable && variants.length === 0)
    throw new ValidationError('Un producto variable debe tener al menos una variante');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO products
         (provider_id, category_id, is_variable, sku, name, description,
          color, purchase_price, sale_price, uom, image)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        providerId, categoryId ?? null, isVariable ? 1 : 0,
        sku ?? null, name.trim(), description ?? null,
        color ?? null, purchasePrice, salePrice,
        uom ?? 'pza', image ?? null,
      ]
    );
    const productId = result.insertId;

    if (isVariable && variants.length > 0) {
      for (const v of variants) {
        if (!v.label?.trim()) throw new ValidationError('Cada variante debe tener una etiqueta');

        if (v.sku) {
          const [[vExisting]] = await conn.query(
            'SELECT variant_id FROM product_variants WHERE sku = ?',
            [v.sku]
          );
          if (vExisting) throw new ConflictError(`El SKU de variante "${v.sku}" ya existe`);
        }

        await conn.query(
          'INSERT INTO product_variants (product_id, sku, label) VALUES (?, ?, ?)',
          [productId, v.sku ?? null, v.label.trim()]
        );
      }
    }

    await conn.commit();
    return getProductById(productId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ─── updateProduct ────────────────────────────────────────────────────────────

const updateProduct = async ({ productId, updates, newImage, variants = [] }) => {
  await getProductById(productId);

  if (updates.name          !== undefined) validate.name(updates.name);
  if (updates.salePrice     !== undefined) validate.price(updates.salePrice, 'El precio de venta');
  if (updates.purchasePrice !== undefined) validate.price(updates.purchasePrice, 'El precio de compra');
  if (updates.sku           !== undefined) validate.sku(updates.sku);

  if (updates.uom && !UOM_OPTIONS.includes(updates.uom))
    throw new ValidationError(`Unidad de medida inválida. Opciones: ${UOM_OPTIONS.join(', ')}`);

  if (updates.sku) {
    const [[existing]] = await db.query(
      'SELECT product_id FROM products WHERE sku = ? AND product_id != ?',
      [updates.sku, productId]
    );
    if (existing) throw new ConflictError(`El SKU "${updates.sku}" ya existe`);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const allowedFields = {
      sku:            updates.sku,
      name:           updates.name?.trim(),
      description:    updates.description,
      color:          updates.color,
      purchase_price: updates.purchasePrice,
      sale_price:     updates.salePrice,
      uom:            updates.uom,
      provider_id:    updates.providerId,
      category_id:    updates.categoryId,
      is_variable:    updates.isVariable !== undefined
                        ? (updates.isVariable ? 1 : 0) : undefined,
    };
    if (newImage !== undefined) allowedFields.image = newImage;

    const setClauses = [];
    const values     = [];
    for (const [col, val] of Object.entries(allowedFields)) {
      if (val !== undefined) { setClauses.push(`${col} = ?`); values.push(val); }
    }
    if (setClauses.length > 0) {
      values.push(productId);
      await conn.query(
        `UPDATE products SET ${setClauses.join(', ')} WHERE product_id = ?`,
        values
      );
    }

    for (const v of variants) {
      if (v.variant_id) {
        await conn.query(
          'UPDATE product_variants SET label = ?, sku = ? WHERE variant_id = ? AND product_id = ?',
          [v.label?.trim(), v.sku ?? null, v.variant_id, productId]
        );
      } else {
        if (!v.label?.trim()) throw new ValidationError('Cada variante debe tener una etiqueta');
        await conn.query(
          'INSERT INTO product_variants (product_id, sku, label) VALUES (?, ?, ?)',
          [productId, v.sku ?? null, v.label.trim()]
        );
      }
    }

    await conn.commit();
    return getProductById(productId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ─── toggleStatus ─────────────────────────────────────────────────────────────

const toggleStatus = async ({ productId, is_active }) => {
  await getProductById(productId);
  await db.query(
    'UPDATE products SET is_active = ? WHERE product_id = ?',
    [is_active ? 1 : 0, productId]
  );
  return getProductById(productId);
};

// ─── Variantes ────────────────────────────────────────────────────────────────

const getVariantsByProduct = async (productId) => {
  await getProductById(productId);
  const [rows] = await db.query(
    `SELECT variant_id, product_id, sku, label, is_active
     FROM product_variants
     WHERE product_id = ? AND is_active = 1`,
    [productId]
  );
  return rows;
};

const deactivateVariant = async ({ variantId, productId }) => {
  await getProductById(productId);
  const [[variant]] = await db.query(
    'SELECT variant_id FROM product_variants WHERE variant_id = ? AND product_id = ?',
    [variantId, productId]
  );
  if (!variant) throw new NotFoundError('Variante no encontrada');
  await db.query('UPDATE product_variants SET is_active = 0 WHERE variant_id = ?', [variantId]);
};

// ─── bulkCreateProducts ───────────────────────────────────────────────────────

const BULK_LIMIT = 500;

const bulkCreateProducts = async ({ products, userId }) => {
  if (!Array.isArray(products) || products.length === 0)
    throw new ValidationError('El archivo no contiene productos válidos');
  if (products.length > BULK_LIMIT)
    throw new ValidationError(`El lote no puede superar ${BULK_LIMIT} productos`);

  const created = [];
  const failed  = [];

  for (let i = 0; i < products.length; i++) {
    const row = i + 2;
    const p   = products[i];

    try {
      if (!p.name?.trim())
        throw new ValidationError('El nombre es requerido');
      if (isNaN(Number(p.sale_price)) || Number(p.sale_price) < 0)
        throw new ValidationError('El precio de venta no es válido');
      if (isNaN(Number(p.purchase_price)) || Number(p.purchase_price) < 0)
        throw new ValidationError('El precio de compra no es válido');
      if (!p.provider_id)
        throw new ValidationError('El provider_id es requerido');

      if (p.sku?.trim()) {
        const [[existing]] = await db.query(
          'SELECT product_id FROM products WHERE sku = ?',
          [p.sku.trim()]
        );
        if (existing) throw new ConflictError(`SKU "${p.sku.trim()}" ya existe`);
      }

      const [[provider]] = await db.query(
        'SELECT provider_id FROM providers WHERE provider_id = ? AND is_active = 1',
        [p.provider_id]
      );
      if (!provider) throw new ValidationError(`Proveedor ID ${p.provider_id} no encontrado`);

      if (p.category_id) {
        const [[category]] = await db.query(
          'SELECT category_id FROM categories WHERE category_id = ? AND is_active = 1',
          [p.category_id]
        );
        if (!category) throw new ValidationError(`Categoría ID ${p.category_id} no encontrada`);
      }

      const [result] = await db.query(
        `INSERT INTO products
           (provider_id, category_id, is_variable, sku, name, description,
            color, purchase_price, sale_price, uom, image)
         VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.provider_id,
          p.category_id    ?? null,
          p.sku?.trim()    ?? null,
          p.name.trim(),
          p.description?.trim() ?? null,
          p.color?.trim()       ?? null,
          Number(p.purchase_price),
          Number(p.sale_price),
          UOM_OPTIONS.includes(p.uom) ? p.uom : 'pza',
          p.image?.trim()       ?? null,
        ]
      );

      created.push({ row, product_id: result.insertId, name: p.name.trim() });
    } catch (err) {
      failed.push({
        row,
        sku:    p.sku?.trim()  ?? null,
        name:   p.name?.trim() ?? `(fila ${row})`,
        reason: err.message,
      });
    }
  }

  return { created: created.length, failed: failed.length, failed_detail: failed, total: products.length };
};

// ─── getBulkTemplate ──────────────────────────────────────────────────────────

const getBulkTemplate = () => {
  const headers = ['name','sku','description','purchase_price','sale_price','uom','color','provider_id','category_id','image'];
  const example = ['Playera básica','PLY-001','Playera de algodón 100%','80','150','pza','Blanco','1','1',''];
  return `${headers.join(',')}\n${example.join(',')}`;
};

module.exports = {
  getAllProducts, getProductById,
  createProduct, updateProduct, toggleStatus,
  getVariantsByProduct, deactivateVariant,
  bulkCreateProducts, getBulkTemplate,
  UOM_OPTIONS,
};