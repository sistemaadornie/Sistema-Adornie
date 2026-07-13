jest.mock('../database/db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../services/pushService', () => ({ enviarPush: jest.fn().mockResolvedValue(undefined) }));
const db = require('../database/db');
const svc = require('../services/agendamentoService');

afterEach(() => jest.clearAllMocks());

function mockClient() {
  const client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
  db.connect.mockResolvedValueOnce(client);
  return client;
}

function updateuPedidoConcluidoFoiChamado() {
  return db.query.mock.calls.some(
    ([sql]) => sql.includes('UPDATE pedidos') && sql.includes("status = 'concluido'")
  );
}

describe('alterarStatus — auto-conclusão do pedido só deve considerar a Instalação (etapa final), não a Conferência', () => {
  test('concluir o agendamento de Conferência (etapa 2) NÃO deve marcar o pedido inteiro como concluído', async () => {
    const AG_CONFERENCIA = {
      id: 1, titulo: 'Conferência X', cliente: 'Cliente Y', tipo: 'Conferência',
      criado_por: 7, status_anterior: 'andamento', pedido_id: 500, pedido_consultor_id: 42,
    };

    db.query.mockResolvedValue({ rows: [] }); // default para chamadas não relevantes ao caso

    db.query
      .mockResolvedValueOnce({ rows: [AG_CONFERENCIA] })                  // existe
      .mockResolvedValueOnce({ rows: [{ pendentes: '0', total: '0' }] })  // pendentesCheck (Conferência)
      .mockResolvedValueOnce({ rows: [] })                                // gravarLog (status_alterado)
      .mockResolvedValueOnce({ rows: [{ pedido_id: 500 }] })              // agInfo (pós-transação)
      .mockResolvedValueOnce({ rows: [{}] })                              // isGenitor: true
      .mockResolvedValueOnce({ rows: [] });                               // pendentes: nenhum outro genitor pendente

    mockClient();

    await svc.alterarStatus(1, 1, 99, 'Admin', ['COMERCIAL'], 'concluido', null, [], []);

    expect(updateuPedidoConcluidoFoiChamado()).toBe(false);
  });

  test('concluir o agendamento de Instalação (etapa final) SEM outros genitores pendentes ainda marca o pedido como concluído', async () => {
    const AG_INSTALACAO = {
      id: 2, titulo: 'Instalação X', cliente: 'Cliente Y', tipo: 'Instalação',
      criado_por: 7, status_anterior: 'andamento', pedido_id: 500, pedido_consultor_id: 42,
    };

    db.query.mockResolvedValue({ rows: [] });

    db.query
      .mockResolvedValueOnce({ rows: [AG_INSTALACAO] })       // existe
      .mockResolvedValueOnce({ rows: [] })                    // pendentesFoto (Instalação)
      .mockResolvedValueOnce({ rows: [] })                    // gravarLog (status_alterado)
      .mockResolvedValueOnce({ rows: [{ pedido_id: 500 }] })  // agInfo (pós-transação)
      .mockResolvedValueOnce({ rows: [{}] })                  // isGenitor: true
      .mockResolvedValueOnce({ rows: [] });                   // pendentes: nenhum outro genitor pendente

    mockClient();

    await svc.alterarStatus(2, 1, 99, 'Admin', ['COMERCIAL'], 'concluido', null, [], []);

    expect(updateuPedidoConcluidoFoiChamado()).toBe(true);
  });
});
