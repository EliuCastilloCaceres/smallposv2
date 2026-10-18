// tests/helpers/auth.js
// Inicia sesión contra la API real y devuelve el access token, listo para
// mandarlo como "Authorization: Bearer <token>".
const request = require('supertest');
const app     = require('../../app');

// Credenciales del superadmin de sql-init/02-seeds.sql.
const SUPERADMIN = { username: 'superadmin', password: 'Admin123!' };

const loginAs = async ({ username, password } = SUPERADMIN) => {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  if (res.status !== 200) {
    throw new Error(`loginAs: el login de "${username}" respondió ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return res.body.accessToken;
};

module.exports = {
  SUPERADMIN,
  loginAs,
};
