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
