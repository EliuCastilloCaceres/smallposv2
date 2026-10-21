// tests/integration/reports/cash-sessions-scope.test.js
// Alcance por sucursal de Sesiones de caja (spec 04, T3): igual que el
// Dashboard, un usuario con sucursal ve solo la suya y el admin central ve
// todas o filtra por una.
const request = require('supertest');
const app     = require('../../../app');
const db      = require('../../../src/config/db');
const { loginAs }          = require('../../helpers/auth');
const { createTestUser }   = require('../../helpers/users');
const { openTestRegister } = require('../../helpers/sales');

let branch2;
let cashierToken;
let adminToken;
let session1;
let session2;

const listSessions = (token, query = {}) =>
  request(app)
    .get('/api/reports/cash-sessions')
    .query(query)
    .set('Authorization', `Bearer ${token}`);

const sessionDetail = (token, sessionId) =>
  request(app)
    .get(`/api/reports/cash-sessions/${sessionId}`)
    .set('Authorization', `Bearer ${token}`);

const branchesOf = (res) => [...new Set(res.body.data.map(s => s.branchId))].sort();

beforeAll(async () => {
  const [branch] = await db.query("INSERT INTO branches (name, is_active) VALUES ('Sucursal Norte', 1)");
  branch2 = branch.insertId;
  const [register] = await db.query(
    "INSERT INTO cash_registers (branch_id, name, is_active) VALUES (?, 'Caja Norte', 1)", [branch2]
  );

  const cashier1 = await createTestUser({ role: 'cajero', branchId: 1 });
  const cashier2 = await createTestUser({ role: 'cajero', branchId: branch2 });
  const admin    = await createTestUser({ role: 'admin', branchId: null });

  ({ sessionId: session1 } = await openTestRegister({ userId: cashier1.userId }));
  ({ sessionId: session2 } = await openTestRegister({ userId: cashier2.userId, cashRegisterId: register.insertId }));

  [cashierToken, adminToken] = await Promise.all([loginAs(cashier1), loginAs(admin)]);
});

describe('cash sessions branch scope', () => {
  it('shows a branch user only the sessions of their branch', async () => {
    const res = await listSessions(cashierToken);

    expect(res.status).toBe(200);
    expect(res.body.data.map(s => s.sessionId)).toEqual([session1]);
    expect(res.body.summary.sessionCount).toBe(1);
  });

  it('ignores the branch_id of another branch sent by a branch user', async () => {
    const res = await listSessions(cashierToken, { branch_id: branch2 });

    expect(branchesOf(res)).toEqual([1]);
  });

  it('answers the detail of a session of another branch like one that does not exist', async () => {
    const otherBranch = await sessionDetail(cashierToken, session2);
    const missing     = await sessionDetail(cashierToken, 999999);
    const own         = await sessionDetail(cashierToken, session1);

    expect(otherBranch.status).toBe(404);
    expect(otherBranch.body).toEqual(missing.body);
    expect(own.status).toBe(200);
  });

  it('shows the central admin every branch and lets them filter by one', async () => {
    const all      = await listSessions(adminToken);
    const filtered = await listSessions(adminToken, { branch_id: branch2 });
    const detail   = await sessionDetail(adminToken, session2);

    expect(branchesOf(all)).toEqual([1, branch2]);
    expect(filtered.body.data.map(s => s.sessionId)).toEqual([session2]);
    expect(detail.status).toBe(200);
  });
});
