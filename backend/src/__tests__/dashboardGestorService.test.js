jest.mock("../database/db", () => ({ query: jest.fn() }));
jest.mock("../services/dashboardService", () => ({
  listarPedidosDashboard: jest.fn(),
}));
const db = require("../database/db");
const dashboardService = require("../services/dashboardService");
const svc = require("../services/dashboardGestorService");

afterEach(() => jest.clearAllMocks());

describe("buscarFiltros", () => {
  test("retorna consultoras (permissão COMERCIAL) e cidades distintas de pedidos", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1, nome: "Marina Alencar" }, { id: 2, nome: "Letícia Prado" }] })
      .mockResolvedValueOnce({ rows: [{ cidade: "Curitiba" }, { cidade: "Joinville" }] });

    const r = await svc.buscarFiltros(7);

    expect(r).toEqual({
      consultoras: [{ id: 1, nome: "Marina Alencar" }, { id: 2, nome: "Letícia Prado" }],
      cidades: ["Curitiba", "Joinville"],
    });
    expect(db.query.mock.calls[0][1]).toEqual([7]);
    expect(db.query.mock.calls[1][1]).toEqual([7]);
  });
});

describe("buscarPedidosEnriquecidos", () => {
  test("chama listarPedidosDashboard com userId null e a permissão DASHBOARD_PEDIDOS_GERAL forçada", async () => {
    dashboardService.listarPedidosDashboard.mockResolvedValue([{ id: 1 }]);

    const r = await svc.buscarPedidosEnriquecidos(7, { consultoraId: 12 });

    expect(dashboardService.listarPedidosDashboard).toHaveBeenCalledWith(
      7, null, ["DASHBOARD_PEDIDOS_GERAL"], { consultora_id: 12, status: null, alerta: null }
    );
    expect(r).toEqual([{ id: 1 }]);
  });

  test("consultoraId ausente vira null no filtro", async () => {
    dashboardService.listarPedidosDashboard.mockResolvedValue([]);

    await svc.buscarPedidosEnriquecidos(7, {});

    expect(dashboardService.listarPedidosDashboard).toHaveBeenCalledWith(
      7, null, ["DASHBOARD_PEDIDOS_GERAL"], { consultora_id: null, status: null, alerta: null }
    );
  });
});

describe("buscarKpis", () => {
  const pedidosMock = [
    { id: 1, status: "em_andamento", total: "1000.00", data_pedido: "2026-07-05", cidade: "Curitiba", estagio: { nivel_alerta: "urgente" } },
    { id: 2, status: "concluido",    total: "2000.00", data_pedido: "2026-07-02", cidade: "Curitiba", estagio: { nivel_alerta: null } },
    { id: 3, status: "cancelado",    total: "9999.00", data_pedido: "2026-07-01", cidade: "Curitiba", estagio: { nivel_alerta: null } },
    { id: 4, status: "pendente",     total: "500.00",  data_pedido: "2026-06-15", cidade: "Curitiba", estagio: { nivel_alerta: null } },
  ];

  beforeEach(() => {
    dashboardService.listarPedidosDashboard.mockResolvedValue(pedidosMock);
    db.query.mockResolvedValue({ rows: [{ valor: 0 }] });
  });

  test("faturamento soma pedidos não cancelados dentro do período (mes = 2026-07-01..hoje)", async () => {
    const hoje = new Date(2026, 6, 11);
    const r = await svc.buscarKpis(7, { periodo: "mes", consultoraId: null, cidade: null }, hoje);
    // pedidos 1 (1000) e 2 (2000) estão em julho; pedido 3 é cancelado (excluído); pedido 4 é de junho.
    expect(r.faturamento.valor).toBe(3000);
  });

  test("pedidosAtivos conta status não concluído/cancelado, sem filtro de período", async () => {
    const r = await svc.buscarKpis(7, { periodo: "mes", consultoraId: null, cidade: null }, new Date(2026, 6, 11));
    // ativos: pedido 1 (em_andamento) e pedido 4 (pendente) = 2. pedido 2 concluido e 3 cancelado ficam de fora.
    expect(r.pedidosAtivos.valor).toBe(2);
  });

  test("prazosEmRisco conta ativos com nivel_alerta setado", async () => {
    const r = await svc.buscarKpis(7, { periodo: "mes", consultoraId: null, cidade: null }, new Date(2026, 6, 11));
    expect(r.prazosEmRisco.valor).toBe(1); // só o pedido 1
  });

  test("deltaPct é 0 quando não há faturamento em nenhum dos dois períodos", async () => {
    dashboardService.listarPedidosDashboard.mockResolvedValue([]);
    const r = await svc.buscarKpis(7, { periodo: "mes" }, new Date(2026, 6, 11));
    expect(r.faturamento).toEqual({ valor: 0, deltaPct: 0 });
  });

  test("deltaPct é 100 quando período anterior é zero mas o atual tem faturamento", async () => {
    dashboardService.listarPedidosDashboard.mockResolvedValue([
      { id: 1, status: "pendente", total: "500", data_pedido: "2026-07-05", cidade: "Curitiba", estagio: {} },
    ]);
    const r = await svc.buscarKpis(7, { periodo: "mes" }, new Date(2026, 6, 11));
    expect(r.faturamento).toEqual({ valor: 500, deltaPct: 100 });
  });
});

describe("buscarFunil", () => {
  test("agrupa pedidos ativos por etapa_atual e marca a de maior contagem como gargalo", async () => {
    dashboardService.listarPedidosDashboard.mockResolvedValue([
      { id: 1, status: "pendente", total: "100", data_pedido: "2026-07-05", cidade: "Curitiba", numero_sequencial: 1, estagio: { etapa_atual: 3 } },
      { id: 2, status: "pendente", total: "100", data_pedido: "2026-07-06", cidade: "Curitiba", numero_sequencial: 2, estagio: { etapa_atual: 3 } },
      { id: 3, status: "pendente", total: "100", data_pedido: "2026-07-06", cidade: "Curitiba", numero_sequencial: 3, estagio: { etapa_atual: 1 } },
      { id: 4, status: "concluido", total: "100", data_pedido: "2026-07-06", cidade: "Curitiba", numero_sequencial: 4, estagio: { etapa_atual: 8 } },
    ]);

    const r = await svc.buscarFunil(7, { periodo: "mes" }, new Date(2026, 6, 11));

    expect(r.totalAtivos).toBe(3); // pedido 4 (concluido) não conta como ativo
    const etapa3 = r.etapas.find((e) => e.numero === 3);
    const etapa1 = r.etapas.find((e) => e.numero === 1);
    expect(etapa3).toEqual({ numero: 3, nome: "Confecção", count: 2, gargalo: true });
    expect(etapa1).toEqual({ numero: 1, nome: "Verificação", count: 1, gargalo: false });
    expect(r.etapas).toHaveLength(8);
  });
});

describe("buscarFunilDetalhe", () => {
  test("retorna exemplos e metadados da etapa pedida", async () => {
    dashboardService.listarPedidosDashboard.mockResolvedValue([
      { id: 1, status: "pendente", total: "100", data_pedido: "2026-07-05", cidade: "Curitiba", numero_sequencial: 42, cliente_nome: "Regina", estagio: { etapa_atual: 3 } },
    ]);

    const r = await svc.buscarFunilDetalhe(7, 3, { periodo: "mes" }, new Date(2026, 6, 11));

    expect(r).toEqual({
      numero: 3, nome: "Confecção", descricao: expect.any(String), responsavel: "Ateliê / fornecedores",
      count: 1, exemplos: [{ numero: "#42", cliente: "Regina" }],
    });
  });

  test("lança erro 400 para etapa inválida", async () => {
    await expect(svc.buscarFunilDetalhe(7, 99, {})).rejects.toMatchObject({ status: 400 });
  });
});
