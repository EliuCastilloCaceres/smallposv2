// tests/helpers/expenses.js
// Datos para los tests del módulo de gastos (spec 12): categorías por nombre,
// gastos guardados directo en la BD y archivos de comprobante de prueba.
const db = require('../../src/config/db');

// Encabezados reales de un PNG y de un PDF: bastan para que file-type
// reconozca el contenido
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('0000000d49484452000000010000000108060000001f15c489', 'hex'),
]);
const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');

// expense_category_id de una categoría de gasto por su nombre
const expenseCategoryId = async (name) => {
  const [[row]] = await db.query('SELECT expense_category_id FROM expense_categories WHERE name = ?', [name]);
  if (!row) throw new Error(`expenseCategoryId: no existe la categoría de gasto "${name}"`);
  return row.expense_category_id;
};

// Guarda un gasto directo en la BD (sin pasar por la API), para preparar
// listas y filtros. Devuelve su expense_id.
const insertExpense = async ({
  branchId = 1, expenseDate, categoryId, amount, description = 'Gasto de prueba',
  paymentMethodId, providerId = null, folio = null, status = 'active', userId,
}) => {
  const [result] = await db.query(
    `INSERT INTO expenses
       (branch_id, expense_date, expense_category_id, amount, description, payment_method_id,
        provider_id, folio, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [branchId, expenseDate, categoryId, amount, description, paymentMethodId, providerId, folio, status, userId]
  );
  return result.insertId;
};

module.exports = {
  PNG_BYTES,
  PDF_BYTES,
  expenseCategoryId,
  insertExpense,
};
