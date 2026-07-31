const { ValidationError } = require('../errors/AppError');

const resolveBranchId = (req) => {
  if (req.user.branch_id !== null) return req.user.branch_id;
  const id = req.body?.branch_id ?? req.query?.branch_id;
  if (!id) throw new ValidationError('branch_id es requerido para el administrador central');
  return parseInt(id);
};

module.exports = { resolveBranchId };