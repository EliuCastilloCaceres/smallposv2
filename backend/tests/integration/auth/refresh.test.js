// tests/integration/auth/refresh.test.js
// Rotación del refresh token y detección de reutilización (spec 02, T4).
// Reenviar un refresh token que ya se rotó se trata como un token robado:
// se revocan todas las sesiones del usuario.
const request = require('supertest');
const app     = require('../../../app');
const db      = require('../../../src/config/db');
const { createTestUser } = require('../../helpers/users');

// Fecha fija para distinguir una revocación vieja de una hecha con NOW().
const OLD_REVOKED_AT = '2026-01-01 08:00:00';

// Valor de la cookie refreshToken que manda el servidor.
const refreshCookie = (res) => {
  const cookie = (res.headers['set-cookie'] ?? []).find((c) => c.startsWith('refreshToken='));
  return cookie?.split(';')[0].slice('refreshToken='.length);
};

// Inicia sesión como un dispositivo nuevo.
const login = async ({ username, password }) => {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  return { accessToken: res.body.accessToken, refreshToken: refreshCookie(res) };
};

const refreshWith = (refreshToken) =>
  request(app).post('/api/auth/refresh').set('Cookie', `refreshToken=${refreshToken}`);

// Sesiones del usuario en orden de creación. revoked_at se lee como texto
// para compararlo sin conversiones de zona horaria.
const sessionsOf = async (userId) => {
  const [rows] = await db.query(
    `SELECT revoked, CAST(revoked_at AS CHAR) AS revoked_at
     FROM refresh_tokens WHERE user_id = ? ORDER BY token_id`,
    [userId]
  );
  return rows;
};

describe('POST /api/auth/refresh', () => {
  it('responds 200 and rotates the token when it is valid', async () => {
    const user  = await createTestUser();
    const first = await login(user);

    const res = await refreshWith(first.refreshToken);

    expect(res.status).toBe(200);
    const rotated = refreshCookie(res);
    expect(rotated).toBeDefined();
    expect(rotated).not.toBe(first.refreshToken);

    // El token anterior queda revocado y el nuevo, activo
    const [oldSession, newSession] = await sessionsOf(user.userId);
    expect(oldSession).toMatchObject({ revoked: 1, revoked_at: expect.any(String) });
    expect(newSession).toEqual({ revoked: 0, revoked_at: null });

    // El access token nuevo sirve, y el refresh token nuevo se puede rotar otra vez
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.username).toBe(user.username);
    expect((await refreshWith(rotated)).status).toBe(200);
  });

  it('responds 401 and revokes every session of the user when a rotated token is reused', async () => {
    const user        = await createTestUser();
    const device      = await login(user);
    const otherDevice = await login(user);
    const rotated     = refreshCookie(await refreshWith(device.refreshToken));

    const res = await refreshWith(device.refreshToken);

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/reutilización de token/);

    // Ninguna sesión sobrevive: ni la del token nuevo ni la del otro dispositivo
    const sessions = await sessionsOf(user.userId);
    expect(sessions).toHaveLength(3);
    expect(sessions.every((s) => s.revoked === 1 && s.revoked_at !== null)).toBe(true);
    expect((await refreshWith(rotated)).status).toBe(401);
    expect((await refreshWith(otherDevice.refreshToken)).status).toBe(401);
  });

  it("does not touch other users' sessions when a token is reused", async () => {
    const user      = await createTestUser();
    const otherUser = await login(await createTestUser());
    const session   = await login(user);
    await refreshWith(session.refreshToken);

    await refreshWith(session.refreshToken);

    expect((await refreshWith(otherUser.refreshToken)).status).toBe(200);
  });

  it('keeps the original revoked_at of tokens that were already revoked', async () => {
    const user      = await createTestUser();
    const device    = await login(user);
    const loggedOut = await login(user);
    const logout = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${loggedOut.accessToken}`)
      .set('Cookie', `refreshToken=${loggedOut.refreshToken}`);
    expect(logout.status).toBe(200);
    await refreshWith(device.refreshToken);
    // Sesiones: [device (rotada), loggedOut (cerrada), token nuevo de device]
    // Las dos revocadas se llevan a una fecha vieja para notar si se sobrescriben.
    await db.query(
      `UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked = 1`,
      [OLD_REVOKED_AT, user.userId]
    );

    const res = await refreshWith(device.refreshToken);

    expect(res.status).toBe(401);
    const [rotatedSession, loggedOutSession, activeSession] = await sessionsOf(user.userId);
    expect(rotatedSession).toEqual({ revoked: 1, revoked_at: OLD_REVOKED_AT });
    expect(loggedOutSession).toEqual({ revoked: 1, revoked_at: OLD_REVOKED_AT });
    // La que seguía activa sí se revoca ahora
    expect(activeSession.revoked).toBe(1);
    expect(activeSession.revoked_at).not.toBe(OLD_REVOKED_AT);
  });
});
