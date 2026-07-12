jest.mock('../database/db', () => ({ query: jest.fn() }));
jest.mock('../services/notificacaoService', () => ({ criarNotificacao: jest.fn().mockResolvedValue() }));

const db  = require('../database/db');
const svc = require('../services/crewService');

beforeEach(() => jest.clearAllMocks());

describe('atualizarCrew — grava diff em crew_logs', () => {
  test('grava campos alterados quando nome e veículo mudam', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ data: '2026-07-20', nome_ant: 'Equipe A', veiculo_ant: 1 }] }) // SELECT existing (data, nome_ant, veiculo_ant)
      .mockResolvedValueOnce({ rows: [] })   // SELECT membrosAntRes (crew_membros)
      .mockResolvedValueOnce({ rows: [] })   // UPDATE crews
      .mockResolvedValueOnce({ rows: [] })   // INSERT crew_logs (gravarLogCrew)
      .mockResolvedValueOnce({ rows: [] });  // listarCrew: SELECT crews (vazio, encerra listarCrew ali)

    await svc.atualizarCrew(7, 10, { nome: 'Equipe B', veiculo_id: 2 }, 3, 'Fulano');

    const insertLogCall = db.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO crew_logs'));
    expect(insertLogCall).toBeDefined();
    expect(insertLogCall[1]).toEqual([7, 10, 3, 'Fulano', 'editado', expect.stringContaining('Equipe B')]);
  });
});

describe('getCrewLogs', () => {
  test('retorna os logs do crew', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, acao: 'editado', detalhes: {}, criado_em: '2026-07-20' }] });
    const logs = await svc.getCrewLogs(7, 10);
    expect(logs).toHaveLength(1);
  });
});
