// src/helpers/permissions.js
//
// Única fuente de la consulta "permisos de un rol, como array 'modulo.accion'".
// Antes estaba duplicada con SQL ligeramente distinto en dos lugares:
//   - middlewares/auth.js  (verifyToken, para poblar req.user.permissions)
//   - services/authService.js (login/getMe, para el payload que ve el frontend)
// Exactamente la dispersión que roleHelpers.js ya advertía evitar para las
// preguntas de jerarquía — aplica igual acá. Cualquiera que necesite esto
// importa de aquí; no reimplementar el JOIN.

const db = require('../config/db');

const getPermissionsForRole = async (roleId) => {
  const [rows] = await db.query(
    `SELECT p.module, p.action
     FROM role_permissions rp
     JOIN permissions p ON rp.permission_id = p.permission_id
     WHERE rp.role_id = ?`,
    [roleId]
  );
  return rows.map((r) => `${r.module}.${r.action}`);
};

module.exports = { getPermissionsForRole };
