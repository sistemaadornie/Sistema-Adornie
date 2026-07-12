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

  test("empate entre duas etapas não-zero: a de menor número vence", async () => {
    dashboardService.listarPedidosDashboard.mockResolvedValue([
      { id: 1, status: "pendente", total: "100", data_pedido: "2026-07-05", cidade: "Curitiba", numero_sequencial: 1, estagio: { etapa_atual: 5 } },
      { id: 2, status: "pendente", total: "100", data_pedido: "2026-07-05", cidade: "Curitiba", numero_sequencial: 2, estagio: { etapa_atual: 2 } },
    ]);

    const r = await svc.buscarFunil(7, { periodo: "mes" }, new Date(2026, 6, 11));

    const gargalos = r.etapas.filter((e) => e.gargalo);
    expect(gargalos).toHaveLength(1);
    expect(gargalos[0].numero).toBe(2); // menor número entre os empatados (2 e 5), ambos com count 1
  });

  test("todas as etapas com count 0: nenhuma é gargalo", async () => {
    dashboardService.listarPedidosDashboard.mockResolvedValue([]);

    const r = await svc.buscarFunil(7, { periodo: "mes" }, new Date(2026, 6, 11));

    expect(r.etapas.every((e) => e.count === 0)).toBe(true);
    expect(r.etapas.some((e) => e.gargalo)).toBe(false);
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

  test("usa o número importado do pedido (numero_origem) em vez do sequencial interno, quando disponível", async () => {
    dashboardService.listarPedidosDashboard.mockResolvedValue([
      { id: 1, status: "pendente", total: "100", data_pedido: "2026-07-05", cidade: "Curitiba", numero_sequencial: 42, numero_origem: "#00002304", cliente_nome: "Regina", estagio: { etapa_atual: 3 } },
    ]);

    const r = await svc.buscarFunilDetalhe(7, 3, { periodo: "mes" }, new Date(2026, 6, 11));

    expect(r.exemplos).toEqual([{ numero: "#2304", cliente: "Regina" }]);
  });

  test("lança erro 400 para etapa inválida", async () => {
    await expect(svc.buscarFunilDetalhe(7, 99, {})).rejects.toMatchObject({ status: 400 });
  });
});

describe("buscarAlertas", () => {
  test("filtra pedidos ativos com nivel_alerta, ordena por dias_para_prazo e ignora período", async () => {
    dashboardService.listarPedidosDashboard.mockResolvedValue([
      { id: 1, status: "pendente", numero_sequencial: 10, cliente_nome: "A", cidade: "Curitiba", consultor_nome: "Marina", estagio: { etapa_atual: 3, nivel_alerta: "urgente", dias_para_prazo: 2 } },
      { id: 2, status: "pendente", numero_sequencial: 11, cliente_nome: "B", cidade: "Curitiba", consultor_nome: "Marina", estagio: { etapa_atual: 6, nivel_alerta: "atrasado", dias_para_prazo: -3 } },
      { id: 3, status: "pendente", numero_sequencial: 12, cliente_nome: "C", cidade: "Curitiba", consultor_nome: "Marina", estagio: { etapa_atual: 1, nivel_alerta: null, dias_para_prazo: null } },
      { id: 4, status: "concluido", numero_sequencial: 13, cliente_nome: "D", cidade: "Curitiba", consultor_nome: "Marina", estagio: { etapa_atual: 8, nivel_alerta: "atrasado", dias_para_prazo: -10 } },
    ]);

    const r = await svc.buscarAlertas(7, { consultoraId: null, cidade: null });

    expect(r.total).toBe(2);
    expect(r.alertas.map((a) => a.numeroPedido)).toEqual(["#11", "#10"]); // atrasado (-3) antes de urgente (2)
    expect(r.alertas[0]).toEqual({
      pedidoId: 2, numeroPedido: "#11", cliente: "B", cidade: "Curitiba", etapa: "Separação",
      consultora: "Marina", diasParaPrazo: -3, nivel: "atrasado",
    });
  });

  test("total reflete a contagem real de pedidos em risco, sem ser truncado pelo limite de 20 da lista", async () => {
    dashboardService.listarPedidosDashboard.mockResolvedValue(
      Array.from({ length: 25 }, (_, i) => ({
        id: i + 1,
        status: "pendente",
        numero_sequencial: 100 + i,
        cliente_nome: `Cliente ${i}`,
        cidade: "Curitiba",
        consultor_nome: "Marina",
        estagio: { etapa_atual: 3, nivel_alerta: "urgente", dias_para_prazo: i },
      }))
    );

    const r = await svc.buscarAlertas(7, { consultoraId: null, cidade: null });

    expect(r.total).toBe(25);
    expect(r.alertas).toHaveLength(20);
  });
});

describe("buscarConsultoras", () => {
  test("soma faturamento por consultor no período, inclui quem não vendeu (valor 0), ordena desc", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1, nome: "Marina Alencar" }, { id: 2, nome: "Letícia Prado" }] }) // buscarFiltros: consultoras
      .mockResolvedValueOnce({ rows: [] }); // buscarFiltros: cidades
    dashboardService.listarPedidosDashboard.mockResolvedValue([
      { id: 1, status: "pendente", total: "1000", data_pedido: "2026-07-05", cidade: "Curitiba", consultor_id: 1 },
      { id: 2, status: "cancelado", total: "9999", data_pedido: "2026-07-05", cidade: "Curitiba", consultor_id: 1 },
      { id: 3, status: "pendente", total: "300", data_pedido: "2026-05-01", cidade: "Curitiba", consultor_id: 1 }, // fora do período (nem atual nem anterior, que é jun/2026 completo)
    ]);

    const r = await svc.buscarConsultoras(7, { periodo: "mes" }, new Date(2026, 6, 11));

    expect(r.consultoras).toEqual([
      { id: 1, nome: "Marina Alencar", valor: 1000, deltaPct: 100 },
      { id: 2, nome: "Letícia Prado", valor: 0, deltaPct: 0 },
    ]);
    expect(r.totalMes).toBe(1000);
  });
});

describe("buscarMapa", () => {
  test("modo bairros: agrupa por bairro (só Curitiba), usa coordenada curada e soma 'Outros'", async () => {
    dashboardService.listarPedidosDashboard.mockResolvedValue([
      { id: 1, status: "pendente", total: "1000", data_pedido: "2026-07-05", cidade: "Curitiba", bairro: "Batel", cliente_id: 1, numero_sequencial: 1, estagio: { etapa_atual: 3 } },
      { id: 2, status: "pendente", total: "500",  data_pedido: "2026-07-05", cidade: "Curitiba", bairro: "Bairro Desconhecido", cliente_id: 2, numero_sequencial: 2, estagio: { etapa_atual: 1 } },
      { id: 3, status: "pendente", total: "700",  data_pedido: "2026-07-05", cidade: "Joinville", bairro: "Centro", cliente_id: 3, numero_sequencial: 3, estagio: { etapa_atual: 1 } }, // fora de Curitiba, ignorado no modo bairros
    ]);
    db.query
      .mockResolvedValueOnce({ rows: [] }) // categorias por pedido
      .mockResolvedValueOnce({ rows: [] }); // atendimentos por pedido

    const r = await svc.buscarMapa(7, { modo: "bairros", periodo: "mes" }, new Date(2026, 6, 11));

    expect(r.regioes).toHaveLength(2);
    const batel = r.regioes.find((x) => x.id === "batel");
    const outros = r.regioes.find((x) => x.id === "outros");
    expect(batel).toMatchObject({ nome: "Batel", lat: -25.4444, lng: -49.2881, clientes: 1, pedidosAtivos: 1, faturamento: 1000 });
    expect(outros).toMatchObject({ nome: "Outros", clientes: 1, pedidosAtivos: 1, faturamento: 500 });
  });

  test("modo bairros: múltiplos bairros nao mapeados se fundem em um único 'Outros'", async () => {
    dashboardService.listarPedidosDashboard.mockResolvedValue([
      { id: 10, status: "pendente", total: "300", data_pedido: "2026-07-05", cidade: "Curitiba", bairro: "Bairro Fantasma", cliente_id: 10, numero_sequencial: 10, estagio: { etapa_atual: 1 } },
      { id: 11, status: "pendente", total: "400", data_pedido: "2026-07-05", cidade: "Curitiba", bairro: "Outro Bairro Inexistente", cliente_id: 11, numero_sequencial: 11, estagio: { etapa_atual: 1 } },
    ]);
    db.query
      .mockResolvedValueOnce({ rows: [] }) // categorias por pedido
      .mockResolvedValueOnce({ rows: [] }); // atendimentos por pedido

    const r = await svc.buscarMapa(7, { modo: "bairros", periodo: "mes" }, new Date(2026, 6, 11));

    const outrosRegioes = r.regioes.filter((x) => x.id === "outros");
    expect(outrosRegioes).toHaveLength(1);
    expect(outrosRegioes[0].clientes).toBe(2);
    expect(outrosRegioes[0].pedidosAtivos).toBe(2);
    expect(outrosRegioes[0].faturamento).toBe(700);
  });
});

describe("buscarAgendaSemana", () => {
  test("monta a query com filtros de consultora/cidade e mapeia o resultado", async () => {
    db.query.mockResolvedValue({
      rows: [{
        id: 1, data: "2026-07-15", hora: "09:00:00", tipo: "Conferência",
        cliente_texto: "Ap. Batel", endereco: "Batel, Curitiba",
        cliente_nome: "Sra. Regina", veiculo_nome: "Fiorino I",
        equipe_nomes: ["Marina Alencar"],
      }],
    });

    const r = await svc.buscarAgendaSemana(7, { consultoraId: 5, cidade: "Curitiba" });

    expect(r.compromissos).toEqual([{
      id: 1, data: "2026-07-15", hora: "09:00:00", tipo: "Conferência",
      cliente: "Sra. Regina", local: "Batel, Curitiba", equipe: "Marina Alencar", veiculo: "Fiorino I",
    }]);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/agendamentos/);
    expect(params).toEqual([7, 5, "Curitiba"]);
  });

  test("usa cliente_texto quando não há pedido/cliente vinculado", async () => {
    db.query.mockResolvedValue({
      rows: [{ id: 2, data: "2026-07-16", hora: "10:00:00", tipo: "Instalação", cliente_texto: "Obra X", endereco: "Rua Y", cliente_nome: null, veiculo_nome: null, equipe_nomes: [] }],
    });
    const r = await svc.buscarAgendaSemana(7, {});
    expect(r.compromissos[0]).toMatchObject({ cliente: "Obra X", equipe: null, veiculo: null });
  });
});
