// src/services/expenseCategoryService.js
// Categorías de gasto (specs/12-modulo-de-gastos.md, requisito 3). Separadas
// de las categorías de productos. Se crean, se editan (nombre y la marca
// "cuenta en la utilidad neta") y se activan o desactivan, pero no se borran:
// los gastos que ya tienen una categoría inactiva la conservan.

const db = require('../config/db');
const { NotFoundError, ValidationError, ConflictError } = require('../errors/AppError');

const NAME_MAX = 100;

// Acepta booleanos, 1/0 y 'true'/'false' (llega así por JSON o formulario)
const toFlag = (value) => value === true || value === 1 || value === '1' || value === 'true';

const validateName = (name) => {
  if (typeof name !== 'string' || !name.trim()) {
    throw new ValidationError('El nombre de la categoría es requerido');
  }
  if (name.trim().length > NAME_MAX) {
    throw new ValidationError(`El nombre no puede superar los ${NAME_MAX} caracteres`);
  }
  return name.trim();
};

// El nombre es único sin importar mayúsculas ni acentos (collation de la tabla)
const assertNameAvailable = async (name, exceptId = null) => {
  const [rows] = await db.query(
    `SELECT expense_category_id FROM expense_categories
      WHERE name = ? AND expense_category_id <> ?`,
    [name, exceptId ?? 0]
  );
  if (rows.length > 0) throw new ConflictError('Ya existe una categoría de gasto con ese nombre');
};

// Todas las categorías, activas primero, con cuántos gastos activos tienen
const getAll = async () => {
  const [rows] = await db.query(
    `SELECT ec.expense_category_id, ec.name, ec.counts_in_net_profit, ec.is_active,
            COUNT(e.expense_id) AS expense_count
       FROM expense_categories ec
       LEFT JOIN expenses e
         ON e.expense_category_id = ec.expense_category_id AND e.status = 'active'
      GROUP BY ec.expense_category_id
      ORDER BY ec.is_active DESC, ec.name ASC`
  );
  return rows;
};

const getById = async (id) => {
  const [rows] = await db.query(
    `SELECT ec.expense_category_id, ec.name, ec.counts_in_net_profit, ec.is_active,
            (SELECT COUNT(*) FROM expenses e
              WHERE e.expense_category_id = ec.expense_category_id AND e.status = 'active') AS expense_count
       FROM expense_categories ec
      WHERE ec.expense_category_id = ?`,
    [id]
  );
  if (rows.length === 0) throw new NotFoundError('Categoría de gasto no encontrada');
  return rows[0];
};

const create = async ({ name, countsInNetProfit }) => {
  const cleanName = validateName(name);
  await assertNameAvailable(cleanName);

  const [result] = await db.query(
    'INSERT INTO expense_categories (name, counts_in_net_profit) VALUES (?, ?)',
    [cleanName, countsInNetProfit === undefined ? 1 : (toFlag(countsInNetProfit) ? 1 : 0)]
  );
  return getById(result.insertId);
};

const update = async (id, { name, countsInNetProfit }) => {
  const current   = await getById(id);
  const cleanName = validateName(name);
  await assertNameAvailable(cleanName, current.expense_category_id);

  const flag = countsInNetProfit === undefined
    ? current.counts_in_net_profit
    : (toFlag(countsInNetProfit) ? 1 : 0);

  await db.query(
    'UPDATE expense_categories SET name = ?, counts_in_net_profit = ? WHERE expense_category_id = ?',
    [cleanName, flag, current.expense_category_id]
  );
  return getById(current.expense_category_id);
};

const setStatus = async (id, isActive) => {
  const current = await getById(id);
  await db.query(
    'UPDATE expense_categories SET is_active = ? WHERE expense_category_id = ?',
    [toFlag(isActive) ? 1 : 0, current.expense_category_id]
  );
  return getById(current.expense_category_id);
};

module.exports = { getAll, getById, create, update, setStatus, toFlag };
