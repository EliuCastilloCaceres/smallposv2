// src/services/productService.js
// Catálogo de productos GLOBAL — sin branch_id.
// El inventario (stock) sigue siendo por sucursal en inventory_stock.

const db              = require('../config/db');
const inventoryService = require('./inventoryService');
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

const updateProduct = async ({ productId, updates, newImage, variants = [], userId }) => {
  const current = await getProductById(productId);

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

  // ── Detectar conversión simple <-> variable ──
  // current.is_variable ya viene como boolean gracias a `(p.is_variable = 1) AS is_variable`
  const isConvertingToVariable = updates.isVariable === true  && !current.is_variable;
  const isConvertingToSimple   = updates.isVariable === false && current.is_variable;

  if (isConvertingToVariable && variants.length === 0)
    throw new ValidationError('Un producto variable debe tener al menos una variante');

  if ((isConvertingToVariable || isConvertingToSimple) && !userId)
    throw new ValidationError('userId es requerido para migrar el stock en esta conversión');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Releer is_variable con bloqueo, por si hubo un cambio concurrente
    // entre el getProductById de arriba y esta transacción.
    const [[locked]] = await conn.query(
      'SELECT is_variable FROM products WHERE product_id = ? FOR UPDATE',
      [productId]
    );
    if (!locked) throw new NotFoundError('Producto no encontrado');
    const reallyConvertingToVariable = updates.isVariable === true  && !locked.is_variable;
    const reallyConvertingToSimple   = updates.isVariable === false && Boolean(locked.is_variable);

    // 1. Upsert de variantes PRIMERO — así, si estamos convirtiendo a variable,
    //    ya existe el variant_id destino antes de migrar el stock.
    let firstNewVariantId = null;
    for (const v of variants) {
      if (v.variant_id) {
        await conn.query(
          'UPDATE product_variants SET label = ?, sku = ? WHERE variant_id = ? AND product_id = ?',
          [v.label?.trim(), v.sku ?? null, v.variant_id, productId]
        );
      } else {
        if (!v.label?.trim()) throw new ValidationError('Cada variante debe tener una etiqueta');
        const [vResult] = await conn.query(
          'INSERT INTO product_variants (product_id, sku, label) VALUES (?, ?, ?)',
          [productId, v.sku ?? null, v.label.trim()]
        );
        if (firstNewVariantId === null) firstNewVariantId = vResult.insertId;
      }
    }

    // 2. Migrar stock ANTES de tocar is_variable en products.
    if (reallyConvertingToVariable) {
      const targetVariantId = variants[0]?.variant_id ?? firstNewVariantId;
      await inventoryService.migrateStockToVariant(conn, {
        productId, toVariantId: targetVariantId, userId,
      });
    } else if (reallyConvertingToSimple) {
      await inventoryService.migrateStockToSimple(conn, { productId, userId });
      // Las variantes ya no aplican — desactivarlas para que no vuelvan
      // a aparecer si el producto se convierte a variable de nuevo más tarde.
      await conn.query(
        'UPDATE product_variants SET is_active = 0 WHERE product_id = ?',
        [productId]
      );
    }

    // 3. Actualizar el resto de los campos del producto (incluye is_variable)
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

// 'true','1','si','sí','yes' (sin distinguir mayúsculas) -> true
const parseBool = (v) => {
  if (v === undefined || v === null) return false;
  return ['true', '1', 'si', 'sí', 'yes'].includes(String(v).trim().toLowerCase());
};

// Agrupa las filas crudas del CSV en productos + sus variantes, usando el
// patrón de "fila de continuación": una fila con `name` lleno inicia un
// producto nuevo; una fila con `name` vacío pero `variant_label` lleno se
// agrega como variante adicional del producto de la fila anterior. Así el
// usuario no repite toda la info del producto en cada fila de variante.
const groupBulkRows = (products) => {
  const groups = [];

  for (let i = 0; i < products.length; i++) {
    const row = i + 2; // +2: la fila 1 del archivo es el encabezado
    const p   = products[i];
    const hasName        = Boolean(p.name?.trim());
    const hasVariantLabel = Boolean(p.variant_label?.trim());

    if (hasName) {
      const group = { startRow: row, endRow: row, productRow: p, variantRows: [] };
      if (hasVariantLabel) group.variantRows.push({ row, label: p.variant_label, sku: p.variant_sku });
      groups.push(group);
    } else if (hasVariantLabel) {
      const current = groups[groups.length - 1];
      if (!current) {
        // Fila de variante sin ningún producto previo en el archivo
        groups.push({ startRow: row, endRow: row, productRow: null, variantRows: [{ row, label: p.variant_label, sku: p.variant_sku }] });
      } else {
        current.variantRows.push({ row, label: p.variant_label, sku: p.variant_sku });
        current.endRow = row;
      }
    } else {
      // Fila sin name y sin variant_label — no se puede asociar a nada
      groups.push({ startRow: row, endRow: row, productRow: null, variantRows: [], orphan: true });
    }
  }

  return groups;
};

// Detecta SKUs duplicados DENTRO del archivo (antes de tocar la base de
// datos), para poder avisar "duplicado en el archivo, fila X" en vez del
// más confuso "ya existe" cuando el conflicto es entre dos filas del mismo
// batch y no contra un registro previo real.
const findDuplicateSkusInBatch = (groups) => {
  const productSkuRows = new Map(); // sku -> [rows]
  const variantSkuRows = new Map(); // sku -> [rows]

  for (const group of groups) {
    const sku = group.productRow?.sku?.trim();
    if (sku) {
      if (!productSkuRows.has(sku)) productSkuRows.set(sku, []);
      productSkuRows.get(sku).push(group.startRow);
    }
    for (const v of group.variantRows) {
      const vsku = v.sku?.trim();
      if (vsku) {
        if (!variantSkuRows.has(vsku)) variantSkuRows.set(vsku, []);
        variantSkuRows.get(vsku).push(v.row);
      }
    }
  }

  return {
    productSkuRows: new Map([...productSkuRows].filter(([, rows]) => rows.length > 1)),
    variantSkuRows: new Map([...variantSkuRows].filter(([, rows]) => rows.length > 1)),
  };
};

const bulkCreateProducts = async ({ products, userId }) => {
  if (!Array.isArray(products) || products.length === 0)
    throw new ValidationError('El archivo no contiene productos válidos');
  if (products.length > BULK_LIMIT)
    throw new ValidationError(`El lote no puede superar ${BULK_LIMIT} filas`);

  const groups = groupBulkRows(products);
  const { productSkuRows: dupProductSkus, variantSkuRows: dupVariantSkus } = findDuplicateSkusInBatch(groups);
  const created = [];
  const failed  = [];

  for (const group of groups) {
    const rowLabel = group.startRow === group.endRow
      ? `fila ${group.startRow}`
      : `filas ${group.startRow}-${group.endRow}`;

    // Fila(s) que no se pudieron asociar a ningún producto
    if (group.orphan || !group.productRow) {
      failed.push({
        row:    group.startRow,
        sku:    null,
        name:   `(${rowLabel})`,
        reason: group.variantRows.length > 0
          ? 'Fila de variante sin producto previo — revisa que la fila del producto tenga "name" lleno'
          : 'Fila vacía o inválida (sin name ni variant_label)',
      });
      continue;
    }

    const p = group.productRow;
    const isVariable = parseBool(p.is_variable);
    const productSku = p.sku?.trim();

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      if (!p.name?.trim())
        throw new ValidationError('El nombre es requerido');
      if (isNaN(Number(p.sale_price)) || Number(p.sale_price) < 0)
        throw new ValidationError('El precio de venta no es válido');
      if (isNaN(Number(p.purchase_price)) || Number(p.purchase_price) < 0)
        throw new ValidationError('El precio de compra no es válido');
      if (!p.provider_id)
        throw new ValidationError('El provider_id es requerido');

      if (productSku) {
        // Primero: ¿está duplicado dentro del MISMO archivo?
        const otherRows = (dupProductSkus.get(productSku) ?? []).filter(r => r !== group.startRow);
        if (otherRows.length > 0) {
          throw new ConflictError(
            `SKU "${productSku}" está duplicado en el archivo (también aparece en fila${otherRows.length > 1 ? 's' : ''} ${otherRows.join(', ')})`
          );
        }
        // Si no, ¿ya existe de antes en la base de datos?
        const [[existing]] = await conn.query(
          'SELECT product_id FROM products WHERE sku = ?',
          [productSku]
        );
        if (existing) throw new ConflictError(`SKU "${productSku}" ya existe en el catálogo`);
      }

      const [[provider]] = await conn.query(
        'SELECT provider_id FROM providers WHERE provider_id = ? AND is_active = 1',
        [p.provider_id]
      );
      if (!provider) throw new ValidationError(`Proveedor ID ${p.provider_id} no encontrado`);

      if (p.category_id) {
        const [[category]] = await conn.query(
          'SELECT category_id FROM categories WHERE category_id = ? AND is_active = 1',
          [p.category_id]
        );
        if (!category) throw new ValidationError(`Categoría ID ${p.category_id} no encontrada`);
      }

      if (isVariable && group.variantRows.length === 0)
        throw new ValidationError('Un producto variable debe tener al menos una variante (columna variant_label)');

      const [result] = await conn.query(
        `INSERT INTO products
           (provider_id, category_id, is_variable, sku, name, description,
            color, purchase_price, sale_price, uom, image)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.provider_id,
          p.category_id ?? null,
          isVariable ? 1 : 0,
          productSku ?? null,
          p.name.trim(),
          p.description?.trim() ?? null,
          p.color?.trim()       ?? null,
          Number(p.purchase_price),
          Number(p.sale_price),
          UOM_OPTIONS.includes(p.uom) ? p.uom : 'pza',
          p.image?.trim() ?? null,
        ]
      );
      const productId = result.insertId;

      if (isVariable) {
        for (const v of group.variantRows) {
          if (!v.label?.trim())
            throw new ValidationError(`Fila ${v.row}: cada variante debe tener variant_label`);

          const variantSku = v.sku?.trim();
          if (variantSku) {
            const otherVRows = (dupVariantSkus.get(variantSku) ?? []).filter(r => r !== v.row);
            if (otherVRows.length > 0) {
              throw new ConflictError(
                `SKU de variante "${variantSku}" (fila ${v.row}) está duplicado en el archivo (también aparece en fila${otherVRows.length > 1 ? 's' : ''} ${otherVRows.join(', ')})`
              );
            }
            const [[vExisting]] = await conn.query(
              'SELECT variant_id FROM product_variants WHERE sku = ?',
              [variantSku]
            );
            if (vExisting) throw new ConflictError(`SKU de variante "${variantSku}" ya existe en el catálogo`);
          }

          await conn.query(
            'INSERT INTO product_variants (product_id, sku, label) VALUES (?, ?, ?)',
            [productId, variantSku ?? null, v.label.trim()]
          );
        }
      }

      await conn.commit();
      created.push({ row: group.startRow, product_id: productId, name: p.name.trim() });
    } catch (err) {
      await conn.rollback();
      failed.push({
        row:    group.startRow,
        sku:    productSku ?? null,
        name:   p.name?.trim() ?? `(${rowLabel})`,
        reason: err.message,
      });
    } finally {
      conn.release();
    }
  }

  return {
    created: created.length,
    failed:  failed.length,
    failed_detail: failed,
    total: groups.length, // productos detectados, no filas crudas del CSV
  };
};

// ─── getBulkTemplate ──────────────────────────────────────────────────────────

const getBulkTemplate = () => {
  const headers = [
    'name','sku','description','purchase_price','sale_price','uom','color',
    'provider_id','category_id','image','is_variable','variant_label','variant_sku',
  ];

  const notes = [
    '# Instrucciones:',
    '# - Un producto simple: llena todas las columnas, deja is_variable en 0 o vacío.',
    '# - Un producto variable: pon is_variable en 1, llena variant_label/variant_sku',
    '#   de la primera variante en la MISMA fila del producto.',
    '# - Para variantes adicionales del mismo producto: agrega una fila nueva',
    '#   dejando "name" VACÍO, y llena solo variant_label (y variant_sku si aplica).',
    '#   Esa fila se asocia automáticamente al producto de la fila de arriba.',
  ].join('\n');

  const exampleSimple      = ['Playera básica','PLY-001','Playera de algodón 100%','80','150','pza','Blanco','1','1','','0','',''];
  const exampleVariable    = ['Playera deportiva','','Playera dry-fit','95','180','pza','','1','1','','1','Chica','PLY-002-CH'];
  const exampleVariantCont = ['','','','','','','','','','','','Mediana','PLY-002-M'];

  return [
    notes,
    headers.join(','),
    exampleSimple.join(','),
    exampleVariable.join(','),
    exampleVariantCont.join(','),
  ].join('\n');
};

module.exports = {
  getAllProducts, getProductById,
  createProduct, updateProduct, toggleStatus,
  getVariantsByProduct, deactivateVariant,
  bulkCreateProducts, getBulkTemplate,
  UOM_OPTIONS,
};