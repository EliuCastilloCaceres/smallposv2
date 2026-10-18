// tests/integration/test-infra/auth-helpers.test.js
const request = require('supertest');
const app     = require('../../../app');
const { loginAs }        = require('../../helpers/auth');
const { createTestUser } = require('../../helpers/users');

describe('loginAs', () => {
  it('returns an access token for the seeded superadmin', async () => {
    const token = await loginAs();

    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('fails with a clear error on wrong credentials', async () => {
    await expect(loginAs({ username: 'superadmin', password: 'wrong' }))
      .rejects.toThrow(/loginAs: el login de "superadmin" respondió 401/);
  });
});

describe('protected routes', () => {
  it('respond 401 without a token', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
  });

  it('respond 200 with a valid token', async () => {
    const token = await loginAs();
    const res   = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe('superadmin');
  });
});

describe('createTestUser', () => {
  it('creates a user that can log in with the given role and branch', async () => {
    const cajero = await createTestUser({ role: 'cajero', branchId: 1 });
    const token  = await loginAs(cajero);
    const res    = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ username: cajero.username, branch_id: 1 });
  });

  it('gets 403 on a route whose permission the role lacks', async () => {
    const cajero = await createTestUser({ role: 'cajero' });
    const token  = await loginAs(cajero);
    const res    = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Sin permiso para users.read');
  });

  it('fails with a clear error for an unknown role', async () => {
    await expect(createTestUser({ role: 'nope' })).rejects.toThrow('no existe el rol "nope"');
  });
});
