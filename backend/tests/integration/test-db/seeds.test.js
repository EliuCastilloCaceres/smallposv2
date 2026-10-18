// tests/integration/test-db/seeds.test.js
const db = require('../../../src/config/db');
const { toServerDayStart, toServerDayEnd } = require('../../../src/utils/timezone');

describe('test database', () => {
  it('is the database the backend pool connects to', async () => {
    const [[row]] = await db.query('SELECT DATABASE() AS name');
    expect(row.name).toBe('smallposv2_test');
  });

  it('has the superadmin user from the seeds', async () => {
    const [rows] = await db.query(
      `SELECT u.username, r.name AS role_name
         FROM users u JOIN roles r ON r.role_id = u.role_id
        WHERE u.username = 'superadmin'`
    );
    expect(rows).toEqual([{ username: 'superadmin', role_name: 'superadmin' }]);
  });

  it('runs at UTC-4, like the production server', async () => {
    const [[row]] = await db.query(
      'SELECT TIMESTAMPDIFF(SECOND, NOW(), UTC_TIMESTAMP()) AS diff_seconds'
    );
    expect(row.diff_seconds).toBe(4 * 3600);
  });

  it('maps a Mexico day to server time boundaries', async () => {
    // 00:00 en México (UTC-6) = 06:00 UTC = 02:00 en el servidor (UTC-4).
    expect(await toServerDayStart('2026-01-15')).toBe('2026-01-15 02:00:00');
    expect(await toServerDayEnd('2026-01-15')).toBe('2026-01-16 01:59:59');
  });
});
