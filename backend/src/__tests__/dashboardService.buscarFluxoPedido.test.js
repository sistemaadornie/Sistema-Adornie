jest.mock('../database/db', () => ({ query: jest.fn(), connect: jest.fn() }));
const db = require('../database/db');
const { buscarFluxoPedido } = require('../services/dashboardService');

afterEach(() => jest.clearAllMocks());

describe('buscarFluxoPedido — itens_persiana_pendentes', () => {
  test('inclui itens_persiana_pendentes no progresso da etapa 1', async () => {
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
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })                // totalItensRows
      .mockResolvedValueOnce({ rows: [{ cobertos: 0 }] })             // itensCobertosRows (instalação)
      .mockResolvedValueOnce({ rows: [] })                            // totalConferenciaRows
      .mockResolvedValueOnce({ rows: [] })                            // itensCobertosConferenciaRows
      .mockResolvedValueOnce({ rows: [{ sem_cat: 0 }] })              // itensSemCatRows
      .mockResolvedValueOnce({ rows: [{ sem_vinc: 0 }] })             // itensSemVinculoRows
      .mockResolvedValueOnce({ rows: [{ total: 0, conferidos: 0 }] }) // confRows
      .mockResolvedValueOnce({ rows: [{ em_confeccao: 0, confeccao_ok: 0 }] }) // prodRows
      .mockResolvedValueOnce({ rows: [{ agendados: 0 }] })            // agendadoRows
      .mockResolvedValueOnce({ rows: [{ produto_ok: 0 }] })           // produtoOkRows
      .mockResolvedValueOnce({ rows: [{ pendentes: 2 }] })            // itensPersianaPendentesRows
      .mockResolvedValueOnce({ rows: [] });                           // itensControleRows

    const resultado = await buscarFluxoPedido(1, 10, 99, ['DASHBOARD_PEDIDOS_GERAL']);

    const etapa1 = resultado.etapas.find(e => e.numero === 1);
    expect(etapa1.progresso.itens_persiana_pendentes).toBe(2);

    const ultimaQuery = db.query.mock.calls[16][0];
    expect(ultimaQuery).toContain('Persianas');
    expect(ultimaQuery).toContain('modelo IS NULL');
  });
});

describe('buscarFluxoPedido — itens_cobertos filtra por tipo Instalação e pre_agendamentos expõe tipo', () => {
  test('query de itens_cobertos filtra a.tipo = Instalação e pre_agendamentos inclui tipo do genitor', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{
        id: 1, numero_sequencial: 1, numero_origem: null, status: 'em_andamento',
        verificacao_ok: true, categorizacao_ok: true, total: '0',
        criado_em: '2026-01-01T00:00:00.000Z',
        cliente_id: null, cep: null, rua: null, numero_rua: null, complemento: null,
        bairro: null, cidade: null, estado: null,
        cliente_nome: null, consultor_nome: 'Consultora', consultor_id: 99,
      }] }) // pedido
      .mockResolvedValueOnce({ rows: [] }) // anexos
      .mockResolvedValueOnce({ rows: [] }) // vinculos
      .mockResolvedValueOnce({ rows: [] }) // allItems
      .mockResolvedValueOnce({ rows: [] }) // itensRows
      .mockResolvedValueOnce({ rows: [{ id: 10, status: 'agendado', tipo: 'Conferência', data_inicio: '2026-06-20' }] }) // genitoresRaw
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })                // totalItensRows
      .mockResolvedValueOnce({ rows: [{ cobertos: 0 }] })             // itensCobertosRows (instalação)
      .mockResolvedValueOnce({ rows: [] })                            // totalConferenciaRows
      .mockResolvedValueOnce({ rows: [] })                            // itensCobertosConferenciaRows
      .mockResolvedValueOnce({ rows: [{ sem_cat: 0 }] })              // itensSemCatRows
      .mockResolvedValueOnce({ rows: [{ sem_vinc: 0 }] })             // itensSemVinculoRows
      .mockResolvedValueOnce({ rows: [{ total: 1, conferidos: 0 }] }) // confRows
      .mockResolvedValueOnce({ rows: [{ em_confeccao: 0, confeccao_ok: 0 }] }) // prodRows
      .mockResolvedValueOnce({ rows: [{ agendados: 0 }] })            // agendadoRows
      .mockResolvedValueOnce({ rows: [{ produto_ok: 0 }] })           // produtoOkRows
      .mockResolvedValueOnce({ rows: [{ pendentes: 0 }] })            // itensPersianaPendentesRows
      .mockResolvedValueOnce({ rows: [] })                            // itensControleRows
      .mockResolvedValueOnce({ rows: [] }) // itensPorGenitor
      .mockResolvedValueOnce({ rows: [] }) // herdeirosRaw
      .mockResolvedValueOnce({ rows: [] }); // separacaoRows

    const resultado = await buscarFluxoPedido(1, 10, 99, ['DASHBOARD_PEDIDOS_GERAL']);

    const queryItensCobertos = db.query.mock.calls[7][0];
    expect(queryItensCobertos).toContain("a.tipo = 'Instalação'");

    expect(resultado.pre_agendamentos[0].tipo).toBe('Conferência');
  });
});

describe('buscarFluxoPedido — ambientes_canais_insuficientes', () => {
  test('inclui ambientes_canais_insuficientes no progresso da etapa 1', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1, numero_sequencial: 1, numero_origem: null, status: 'pendente', verificacao_ok: false, categorizacao_ok: false, total: '0', criado_em: '2026-01-01T00:00:00.000Z', cliente_id: null, cep: null, rua: null, numero_rua: null, complemento: null, bairro: null, cidade: null, estado: null, cliente_nome: null, consultor_nome: null, consultor_id: 99 }] }) // pedido
      .mockResolvedValueOnce({ rows: [] })  // anexos
      .mockResolvedValueOnce({ rows: [] })  // vinculos
      .mockResolvedValueOnce({ rows: [] })  // allItems
      .mockResolvedValueOnce({ rows: [] })  // itensRows
      .mockResolvedValueOnce({ rows: [] })  // genitoresRaw (vazio -> branch sem genitores)
      .mockResolvedValueOnce({ rows: [{ total: 2 }] })                 // totalItensRows
      .mockResolvedValueOnce({ rows: [{ cobertos: 0 }] })              // itensCobertosRows (instalação)
      .mockResolvedValueOnce({ rows: [] })                             // totalConferenciaRows
      .mockResolvedValueOnce({ rows: [] })                             // itensCobertosConferenciaRows
      .mockResolvedValueOnce({ rows: [{ sem_cat: 0 }] })               // itensSemCatRows
      .mockResolvedValueOnce({ rows: [{ sem_vinc: 0 }] })              // itensSemVinculoRows
      .mockResolvedValueOnce({ rows: [{ total: 0, conferidos: 0 }] })  // confRows
      .mockResolvedValueOnce({ rows: [{ em_confeccao: 0, confeccao_ok: 0 }] }) // prodRows
      .mockResolvedValueOnce({ rows: [{ agendados: 0 }] })             // agendadoRows
      .mockResolvedValueOnce({ rows: [{ produto_ok: 0 }] })            // produtoOkRows
      .mockResolvedValueOnce({ rows: [{ pendentes: 0 }] })             // itensPersianaPendentesRows
      // Nova query: itens para encontrarVinculosControle
      .mockResolvedValueOnce({ rows: [
        { id: 10, ambiente: 'Sala', descricao: 'Controle 1 canal', distribui_canais: true, recebe_vinculo_automatico: false, acionamento: null },
        { id: 1,  ambiente: 'Sala', descricao: 'Cortina Motorizada', distribui_canais: false, recebe_vinculo_automatico: true, acionamento: 'motorizado' },
        { id: 2,  ambiente: 'Sala', descricao: 'Forro Motorizado', distribui_canais: false, recebe_vinculo_automatico: true, acionamento: 'motorizado' },
      ] });                                                             // itensControleRows

    const resultado = await buscarFluxoPedido(1, 10, 99, ['DASHBOARD_PEDIDOS_GERAL']);
    const etapa1 = resultado.etapas.find(e => e.numero === 1);
    expect(etapa1.progresso.ambientes_canais_insuficientes).toEqual([
      { ambiente: 'Sala', motorizados: 2, canais: 1 }
    ]);
  });
});
