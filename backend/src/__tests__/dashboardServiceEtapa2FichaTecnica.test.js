jest.mock('../database/db', () => ({ query: jest.fn(), connect: jest.fn() }));
const db = require('../database/db');
const { buscarFluxoPedido } = require('../services/dashboardService');

afterEach(() => jest.clearAllMocks());

describe('buscarFluxoPedido — etapa 2 usa a Ficha de Conferência Técnica (ordem_servico.dados_tecnicos), não a tabela conferencia_itens (órfã, nunca usada em produção)', () => {
  test('conferidos da etapa 2 reflete itens com dados_tecnicos preenchido', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{
        id: 1, numero_sequencial: 1, numero_origem: null, status: 'pendente',
        verificacao_ok: false, categorizacao_ok: false, total: '0',
        criado_em: '2026-01-01T00:00:00.000Z',
        cliente_id: null, cep: null, rua: null, numero_rua: null, complemento: null,
        bairro: null, cidade: null, estado: null,
        cliente_nome: null, consultor_nome: 'Consultora', consultor_id: 99,
      }] }) // pedido
      .mockResolvedValueOnce({ rows: [] }) // anexos
      .mockResolvedValueOnce({ rows: [] }) // vinculos
      .mockResolvedValueOnce({ rows: [] }) // allItems
      .mockResolvedValueOnce({ rows: [] }) // itensRows
      .mockResolvedValueOnce({ rows: [] }) // genitoresRaw (vazio -> branch sem genitores)
      .mockResolvedValueOnce({ rows: [{ total: 6 }] })                 // totalItensRows
      .mockResolvedValueOnce({ rows: [{ cobertos: 0 }] })              // itensCobertosRows (instalação)
      .mockResolvedValueOnce({ rows: [] })                             // totalConferenciaRows
      .mockResolvedValueOnce({ rows: [] })                             // itensCobertosConferenciaRows
      .mockResolvedValueOnce({ rows: [{ sem_cat: 0 }] })               // itensSemCatRows
      .mockResolvedValueOnce({ rows: [{ sem_vinc: 0 }] })              // itensSemVinculoRows
      .mockResolvedValueOnce({ rows: [{ total: 6, conferidos: 6 }] })  // confRows — todos os 6 itens já têm Ficha de Conferência Técnica preenchida
      .mockResolvedValueOnce({ rows: [{ em_confeccao: 0, confeccao_ok: 0 }] }) // prodRows
      .mockResolvedValueOnce({ rows: [{ agendados: 0 }] })             // agendadoRows
      .mockResolvedValueOnce({ rows: [{ produto_ok: 0 }] })            // produtoOkRows
      .mockResolvedValueOnce({ rows: [{ pendentes: 0 }] })             // itensPersianaPendentesRows
      .mockResolvedValueOnce({ rows: [] })                             // itensControleRows
      .mockResolvedValueOnce({ rows: [] });                            // itensComConferenciaConsultorasRows

    const resultado = await buscarFluxoPedido(1, 10, 99, ['DASHBOARD_PEDIDOS_GERAL']);

    const queryConf = db.query.mock.calls[12][0];
    expect(queryConf).not.toContain('conferencia_itens');
    expect(queryConf).toContain('dados_tecnicos');
    expect(queryConf).toContain('ordem_servico');

    const etapa2 = resultado.etapas.find((e) => e.numero === 2);
    expect(etapa2.progresso.total).toBe(6);
    expect(etapa2.progresso.conferidos).toBe(6);
    expect(etapa2.concluida).toBe(true);
  });
});
