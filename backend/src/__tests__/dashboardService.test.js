jest.mock("../database/db", () => ({ query: jest.fn() }));
const db = require("../database/db");
const { calcularEtapaAtual, listarPedidosDashboard } = require("../services/dashboardService");

afterEach(() => jest.clearAllMocks());

describe("calcularEtapaAtual", () => {
  const base = {
    verificacaoOk: false,
    itensSemCategoria: 0,
    itensSemVinculo: 0,
    totalItens: 2,
    itensCobertos: 0,
    totalItensConf: 0,
    itensConferidos: 0,
    totalEmConf: 0,
    totalConfOk: 0,
    genitoresAgendados: 0,
    status: "pendente",
  };

  test("etapa 1 incompleta (verificacao pendente) -> etapa_atual 1", () => {
    const r = calcularEtapaAtual({ ...base, verificacaoOk: false });
    expect(r.etapa_atual).toBe(1);
    expect(r.etapa1_ok).toBe(false);
  });

  test("etapa 1 completa, conferencia pendente -> etapa_atual 2", () => {
    const r = calcularEtapaAtual({
      ...base,
      verificacaoOk: true,
      itensCobertos: 2,
    });
    expect(r.etapa1_ok).toBe(true);
    expect(r.etapa_atual).toBe(2);
  });

  test("etapas 1-2 completas, producao pendente -> etapa_atual 3", () => {
    const r = calcularEtapaAtual({
      ...base,
      verificacaoOk: true,
      itensCobertos: 2,
      totalItensConf: 2,
      itensConferidos: 2,
      totalEmConf: 2,
      totalConfOk: 1,
    });
    expect(r.etapa2_ok).toBe(true);
    expect(r.etapa3_ok).toBe(false);
    expect(r.etapa_atual).toBe(3);
  });

  test("etapas 1-3 completas, sem genitor agendado -> etapa_atual 4", () => {
    const r = calcularEtapaAtual({
      ...base,
      verificacaoOk: true,
      itensCobertos: 2,
      totalItensConf: 2,
      itensConferidos: 2,
      totalEmConf: 0,
      totalConfOk: 0,
      genitoresAgendados: 0,
    });
    expect(r.etapa3_ok).toBe(true);
    expect(r.etapa4_ok).toBe(false);
    expect(r.etapa_atual).toBe(4);
  });

  test("etapas 1-4 completas -> etapa_atual 5", () => {
    const r = calcularEtapaAtual({
      ...base,
      verificacaoOk: true,
      itensCobertos: 2,
      totalItensConf: 2,
      itensConferidos: 2,
      totalEmConf: 0,
      totalConfOk: 0,
      genitoresAgendados: 1,
    });
    expect(r.etapa4_ok).toBe(true);
    expect(r.etapa_atual).toBe(5);
  });

  test("status concluido forca etapa_atual 5 mesmo com etapa 1 incompleta", () => {
    const r = calcularEtapaAtual({ ...base, verificacaoOk: false, status: "concluido" });
    expect(r.etapa5_ok).toBe(true);
    expect(r.etapa_atual).toBe(5);
  });
});

describe("listarPedidosDashboard", () => {
  test("calcula estagio.etapa_atual em lote a partir das queries agregadas", async () => {
    db.query
      // 1) query principal de pedidos
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            numero_sequencial: 10,
            numero_origem: null,
            status: "em_andamento",
            verificacao_ok: true,
            categorizacao_ok: true,
            total: "100.00",
            criado_em: "2026-01-01T00:00:00.000Z",
            cliente_nome: "Cliente A",
            consultor_nome: "Consultora X",
            consultor_id: 5,
            itens_count: "2",
            pdf_ok: true,
            vinculos_ok: true,
          },
        ],
      })
      // 2) preAgs
      .mockResolvedValueOnce({ rows: [] })
      // 3) total de itens por pedido
      .mockResolvedValueOnce({ rows: [{ pedido_id: 1, total: 2 }] })
      // 4) itens cobertos por pedido
      .mockResolvedValueOnce({ rows: [{ pedido_id: 1, cobertos: 2 }] })
      // 5) itens sem categoria por pedido
      .mockResolvedValueOnce({ rows: [] })
      // 6) itens sem vinculo por pedido
      .mockResolvedValueOnce({ rows: [] })
      // 7) conferencia por pedido
      .mockResolvedValueOnce({ rows: [{ pedido_id: 1, total: 2, conferidos: 2 }] })
      // 8) confeccao por pedido
      .mockResolvedValueOnce({ rows: [{ pedido_id: 1, em_confeccao: 2, confeccao_ok: 1 }] })
      // 9) genitores agendados por pedido
      .mockResolvedValueOnce({ rows: [] });

    const resultado = await listarPedidosDashboard(1, 99, ["DASHBOARD_PEDIDOS_GERAL"], {});

    expect(resultado).toHaveLength(1);
    // etapa1_ok true (verificacao_ok + 2/2 cobertos), etapa2_ok true (2/2 conferidos),
    // etapa3_ok false (1/2 confeccao_ok) -> etapa_atual = 3
    expect(resultado[0].estagio.etapa_atual).toBe(3);
  });

  test("pedido sem itens e sem agendamentos fica na etapa 1", async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 2,
            numero_sequencial: 11,
            numero_origem: null,
            status: "pendente",
            verificacao_ok: false,
            categorizacao_ok: false,
            total: "0.00",
            criado_em: "2026-01-02T00:00:00.000Z",
            cliente_nome: "Cliente B",
            consultor_nome: "Consultora Y",
            consultor_id: 6,
            itens_count: "0",
            pdf_ok: false,
            vinculos_ok: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // preAgs
      .mockResolvedValueOnce({ rows: [] }) // total itens
      .mockResolvedValueOnce({ rows: [] }) // itens cobertos
      .mockResolvedValueOnce({ rows: [] }) // sem categoria
      .mockResolvedValueOnce({ rows: [] }) // sem vinculo
      .mockResolvedValueOnce({ rows: [] }) // conferencia
      .mockResolvedValueOnce({ rows: [] }) // confeccao
      .mockResolvedValueOnce({ rows: [] }); // genitores agendados

    const resultado = await listarPedidosDashboard(1, 99, ["DASHBOARD_PEDIDOS_GERAL"], {});

    expect(resultado[0].estagio.etapa_atual).toBe(1);
  });
});
