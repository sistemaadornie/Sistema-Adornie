jest.mock("../database/db", () => ({ query: jest.fn() }));
jest.mock("../services/pushService", () => ({
  enviarPush: jest.fn().mockResolvedValue(undefined),
}));

const db = require("../database/db");
const { enviarPush } = require("../services/pushService");
const { criarNotificacao } = require("../services/notificacaoService");

afterEach(() => jest.clearAllMocks());

describe("criarNotificacao", () => {
  test("insere a notificação com os 8 parâmetros e retorna a linha criada", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, titulo: "Oi" }] });

    const result = await criarNotificacao({
      empresaId: 1, usuarioId: 7, tipo: "sistema", titulo: "Oi",
      mensagem: "Mensagem", link: "/agendamentos?id=5", icone: "info", agendamentoId: 5,
    });

    expect(result).toEqual({ id: 1, titulo: "Oi" });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO notificacoes"),
      [1, 7, "sistema", "Oi", "Mensagem", "/agendamentos?id=5", "info", 5]
    );
  });

  test("dispara push com link reescrito para a rota do PWA do instalador", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 2 }] });

    await criarNotificacao({
      empresaId: 1, usuarioId: 7, tipo: "sistema", titulo: "Oi",
      link: "/agendamentos?id=5&detalhe=1", agendamentoId: 5,
    });

    expect(enviarPush).toHaveBeenCalledWith(7, {
      titulo: "Oi", mensagem: null, link: "/agenda/5", icone: "info",
    });
  });

  test("usa link genérico /agenda quando não há agendamento_id", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 6 }] });

    await criarNotificacao({ empresaId: 1, usuarioId: 7, tipo: "sistema", titulo: "Oi" });

    expect(enviarPush).toHaveBeenCalledWith(7, {
      titulo: "Oi", mensagem: null, link: "/agenda", icone: "info",
    });
  });

  test("não dispara push quando usuarioId é nulo (notificação global)", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 3 }] });

    await criarNotificacao({ empresaId: 1, usuarioId: null, tipo: "sistema", titulo: "Oi" });

    expect(enviarPush).not.toHaveBeenCalled();
  });

  test("erro ao enviar push não rejeita a criação da notificação", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 4 }] });
    enviarPush.mockRejectedValueOnce(new Error("falhou"));

    await expect(
      criarNotificacao({ empresaId: 1, usuarioId: 7, tipo: "sistema", titulo: "Oi" })
    ).resolves.toEqual({ id: 4 });
  });
});
