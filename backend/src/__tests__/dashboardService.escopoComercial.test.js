jest.mock('../database/db', () => ({ query: jest.fn() }));

const db  = require('../database/db');
const svc = require('../services/dashboardService');

beforeEach(() => jest.clearAllMocks());

describe('listarPedidosDashboard — escopo de consultora (regressão)', () => {
  test('COMERCIAL sem DASHBOARD_PEDIDOS_GERAL: força consultor_id = userId', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await svc.listarPedidosDashboard(10, 5, ['COMERCIAL'], {});
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('p.consultor_id');
    expect(params).toContain(5);
  });

  test('COMERCIAL sem DASHBOARD_PEDIDOS_GERAL: ignora consultora_id vindo da query', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await svc.listarPedidosDashboard(10, 5, ['COMERCIAL'], { consultora_id: 999 });
    const [, params] = db.query.mock.calls[0];
    expect(params).not.toContain(999);
    expect(params).toContain(5);
  });

  test('ADMIN_MASTER com DASHBOARD_PEDIDOS_GERAL: consultora_id da query é respeitado', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await svc.listarPedidosDashboard(10, 1, ['ADMIN_MASTER', 'DASHBOARD_PEDIDOS_GERAL'], { consultora_id: 999 });
    const [, params] = db.query.mock.calls[0];
    expect(params).toContain(999);
  });
});
