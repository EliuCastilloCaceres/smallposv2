// tests/integration/app.test.js
const request = require('supertest');
const app     = require('../../app');

describe('app', () => {
  it('responds 200 with status ok on GET /', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('responds 404 with "Ruta no encontrada" on an unknown route', async () => {
    const res = await request(app).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      status:  'error',
      message: 'Ruta no encontrada: GET /api/does-not-exist',
    });
  });
});
