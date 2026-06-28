jest.mock('../database/db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../services/pushService', () => ({ enviarPush: jest.fn().mockResolvedValue(undefined) }));
const db  = require('../database/db');
const svc = require('../services/agendamentoService');

afterEach(() => jest.clearAllMocks());

const AG_CONFERENCIA = {
  id: 5, titulo: 'Conferência X', cliente: 'Cliente Y', tipo: 'Conferência',
  criado_por: 7, status_anterior: 'andamento', pedido_id: 42, pedido_consultor_id: null,
};

function mockClient() {
  return { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
}

function mockMontarAgendamento() {
  db.query
    .mockResolvedValueOnce({ rows: [{ id: 5, titulo: 'Conferência X', cliente: 'Cliente Y', pedido_id: 42 }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] });
}

describe('alterarStatus — cancelado limpa itens vinculados', () => {
  test('remove agendamento_itens e conferencia_itens do agendamento cancelado', async () => {
    db.query.mockResolvedValueOnce({ rows: [AG_CONFERENCIA] }); // existe
    const client = mockClient();
    db.connect.mockResolvedValueOnce(client);
    db.query.mockResolvedValueOnce({ rows: [] }); // gravarLog (cancelado), fora da transação
    mockMontarAgendamento();
    // notificarEquipe
    db.query
      .mockResolvedValueOnce({ rows: [] }) // agendamento_equipe
      .mockResolvedValueOnce({ rows: [{ criado_por: 7 }] }) // criado_por
      .mockResolvedValueOnce({ rows: [] }); // idsAdmins

    await svc.alterarStatus(5, 1, 99, 'Admin', [], 'cancelado', 'Cliente desistiu', [], []);

    const queriesTransacao = client.query.mock.calls.map((c) => c[0]);
    expect(queriesTransacao.some((q) => q.includes('UPDATE agendamentos'))).toBe(true);
    expect(queriesTransacao.some((q) => q.includes('DELETE FROM agendamento_itens'))).toBe(true);
    expect(queriesTransacao.some((q) => q.includes('DELETE FROM conferencia_itens'))).toBe(true);

    const deleteItens = client.query.mock.calls.find((c) => c[0].includes('DELETE FROM agendamento_itens'));
    expect(deleteItens[1]).toEqual([5]);
    const deleteConferencia = client.query.mock.calls.find((c) => c[0].includes('DELETE FROM conferencia_itens'));
    expect(deleteConferencia[1]).toEqual([5]);
  });
});
