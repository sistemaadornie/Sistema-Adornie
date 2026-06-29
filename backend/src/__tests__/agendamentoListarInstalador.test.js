jest.mock('../database/db', () => ({ query: jest.fn() }));
const db  = require('../database/db');
const svc = require('../services/agendamentoService');

afterEach(() => jest.clearAllMocks());

describe('listar — instalador puro não vê agendamentos pré-agendados', () => {
  test('instalador puro: query exclui status pre_agendado', async () => {
    db.query.mockResolvedValueOnce({ rows: [] }); // query principal (sem itens, não dispara as próximas)

    await svc.listar(1, 10, ['INSTALADOR'], {});

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("a.status != 'pre_agendado'");
  });

  test('comercial/operador/admin: query não exclui pre_agendado', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    await svc.listar(1, 10, ['OPERADOR_AGENDA'], {});

    const [sql] = db.query.mock.calls[0];
    expect(sql).not.toContain("a.status != 'pre_agendado'");
  });

  test('instalador com permissão extra (não é "puro") continua vendo pre_agendado', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    await svc.listar(1, 10, ['INSTALADOR', 'OPERADOR_AGENDA'], {});

    const [sql] = db.query.mock.calls[0];
    expect(sql).not.toContain("a.status != 'pre_agendado'");
  });
});
