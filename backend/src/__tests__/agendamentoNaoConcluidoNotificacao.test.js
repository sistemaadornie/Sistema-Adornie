jest.mock('../database/db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../services/pushService', () => ({ enviarPush: jest.fn().mockResolvedValue(undefined) }));
const db  = require('../database/db');
const svc = require('../services/agendamentoService');

afterEach(() => jest.clearAllMocks());

const AG_CONFERENCIA = {
  id: 5, titulo: 'Conferência X', cliente: 'Cliente Y', tipo: 'Conferência',
  criado_por: 7, status_anterior: 'andamento',
  pedido_id: 42, pedido_consultor_id: 88,
};

function mockClient() {
  return { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
}

function mockMontarAgendamento() {
  // 5 queries em paralelo dentro de montarAgendamento (ag, equipe, itens, itemFotos, anexos)
  db.query
    .mockResolvedValueOnce({ rows: [{ id: 5, titulo: 'Conferência X', cliente: 'Cliente Y', pedido_id: 42 }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] });
}

describe('alterarStatus — nao_concluido notifica pedido e consultor', () => {
  test('grava notificação com link /pedidos/{id}/fluxo, notifica consultor e grava auditoria', async () => {
    db.query.mockResolvedValueOnce({ rows: [AG_CONFERENCIA] }); // existe
    const client = mockClient();
    db.connect.mockResolvedValueOnce(client); // transação (UPDATE agendamentos)
    db.query.mockResolvedValueOnce({ rows: [] }); // gravarLog (status_alterado), fora da transação
    mockMontarAgendamento();
    // notificarEquipe: equipe vazia, criado_por sem time, idsAdmins vazio
    db.query
      .mockResolvedValueOnce({ rows: [] }) // agendamento_equipe (notificarEquipe)
      .mockResolvedValueOnce({ rows: [{ criado_por: 7 }] }) // criado_por (notificarEquipe)
      .mockResolvedValueOnce({ rows: [] }) // idsAdmins
      .mockResolvedValueOnce({ rows: [] }) // INSERT notificacoes global
      .mockResolvedValueOnce({ rows: [] }) // INSERT notificacoes consultor
      .mockResolvedValueOnce({ rows: [] }); // INSERT pedido_auditoria

    await svc.alterarStatus(5, 1, 99, 'Admin', [], 'nao_concluido', 'Cliente não estava em casa', [], []);

    const todasQueries = db.query.mock.calls.map((c) => c[0]);
    // criarNotificacao() sempre parametriza usuario_id (8 posições fixas):
    // [empresaId, usuarioId, tipo, titulo, mensagem, link, icone, agendamentoId].
    const insertGlobal = db.query.mock.calls.find(
      (c) => c[0].includes('INSERT INTO notificacoes') && c[1][1] === null
    );
    expect(insertGlobal[1][5]).toBe('/pedidos/42/fluxo'); // link

    const insertConsultor = db.query.mock.calls.find(
      (c) => c[0].includes('INSERT INTO notificacoes') && c[1][1] === 88
    );
    expect(insertConsultor).toBeTruthy();
    expect(insertConsultor[1][5]).toBe('/pedidos/42/fluxo');

    const insertAuditoria = db.query.mock.calls.find((c) => c[0].includes('INSERT INTO pedido_auditoria'));
    expect(insertAuditoria).toBeTruthy();
    expect(insertAuditoria[1]).toEqual([42, 1, 99, 'conferencia', 'Agendamento #5 (Conferência) marcado como não concluído. Motivo: Cliente não estava em casa']);
    expect(todasQueries.some((q) => q.includes("acao", ))).toBe(true);
  });
});
