jest.mock('../database/db', () => ({ query: jest.fn(), connect: jest.fn() }));
const db = require('../database/db');
const svc = require('../services/agendamentoService');

afterEach(() => jest.clearAllMocks());

const adminUser = { id: 99, nome_completo: 'Admin' };

describe('decidirAprovacao', () => {
  test('404 quando não há agendamento pendente', async () => {
    db.query.mockResolvedValueOnce({ rows: [] }); // busca inicial
    await expect(
      svc.decidirAprovacao(1, 1, adminUser, { aprovado: true })
    ).rejects.toMatchObject({ status: 404 });
  });

  test('rejeição sem motivo lança 400', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, titulo: 'T', cliente: 'C', criado_por: 7, status_pretendido: 'agendado' }] });
    await expect(
      svc.decidirAprovacao(1, 1, adminUser, { aprovado: false, motivo: '   ' })
    ).rejects.toMatchObject({ status: 400 });
  });

  test('aprovação aplica o status_pretendido', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 1, status: 'agendado' }] }); // fallback p/ todas as queries
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, titulo: 'T', cliente: 'C', criado_por: 7, status_pretendido: 'pre_agendado' }] }); // busca inicial
    await svc.decidirAprovacao(1, 1, adminUser, { aprovado: true });
    const updateCall = db.query.mock.calls.find(([sql]) =>
      /UPDATE agendamentos[\s\S]*status=\$1/.test(sql)
    );
    expect(updateCall).toBeDefined();
    expect(updateCall[1][0]).toBe('pre_agendado'); // status final
    expect(updateCall[1][1]).toBe(99);             // aprovado_por
  });
});

describe('listarPendentesAprovacao', () => {
  test('consulta status pendente_aprovacao da empresa', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, titulo: 'T' }] });
    const rows = await svc.listarPendentesAprovacao(5);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("status = 'pendente_aprovacao'");
    expect(params).toEqual([5]);
    expect(rows).toHaveLength(1);
  });
});
