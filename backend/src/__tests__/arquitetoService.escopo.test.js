jest.mock('../database/db', () => ({ query: jest.fn() }));

const db  = require('../database/db');
const svc = require('../services/arquitetoService');

beforeEach(() => jest.clearAllMocks());

describe('listar — escopo por consultor', () => {
  test('COMERCIAL puro: filtra por consultor_id', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await svc.listar(10, null, ['COMERCIAL'], 5);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('a.consultor_id');
    expect(params).toContain(5);
  });

  test('ADMIN_MASTER: não filtra', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await svc.listar(10, null, ['ADMIN_MASTER'], 5);
    const [sql] = db.query.mock.calls[0];
    expect(sql).not.toContain('a.consultor_id =');
  });
});

describe('buscar — bloqueia arquiteto de outra consultora', () => {
  test('retorna null quando consultor_id não bate', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, consultor_id: 99 }] });
    const arq = await svc.buscar(1, 10, ['COMERCIAL'], 5);
    expect(arq).toBeNull();
  });

  test('retorna o registro quando consultor_id bate', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, consultor_id: 5 }] });
    const arq = await svc.buscar(1, 10, ['COMERCIAL'], 5);
    expect(arq).not.toBeNull();
  });
});
