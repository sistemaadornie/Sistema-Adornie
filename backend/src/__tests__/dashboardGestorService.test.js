jest.mock("../database/db", () => ({ query: jest.fn() }));
jest.mock("../services/dashboardService", () => ({
  listarPedidosDashboard: jest.fn(),
}));
const db = require("../database/db");
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
