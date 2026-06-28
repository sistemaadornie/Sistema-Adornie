jest.mock("web-push", () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));
jest.mock("../database/db", () => ({ query: jest.fn() }));

const webpush = require("web-push");
const db = require("../database/db");
const { enviarPush } = require("../services/pushService");

beforeEach(() => {
  process.env.VAPID_PUBLIC_KEY = "chave-publica-teste";
  process.env.VAPID_PRIVATE_KEY = "chave-privada-teste";
  process.env.VAPID_SUBJECT = "mailto:teste@adornie.com";
});

afterEach(() => jest.clearAllMocks());

describe("enviarPush", () => {
  test("envia para todas as subscriptions do usuário", async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        { id: 1, endpoint: "https://push.example/a", p256dh: "key-a", auth: "auth-a" },
        { id: 2, endpoint: "https://push.example/b", p256dh: "key-b", auth: "auth-b" },
      ],
    });
    webpush.sendNotification.mockResolvedValue({});

    await enviarPush(7, { titulo: "Novo agendamento", mensagem: "Você tem uma nova instalação." });

    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
    expect(webpush.sendNotification.mock.calls[0][0]).toEqual({
      endpoint: "https://push.example/a",
      keys: { p256dh: "key-a", auth: "auth-a" },
    });
  });

  test("remove subscription expirada (410) sem lançar erro", async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{ id: 1, endpoint: "https://push.example/a", p256dh: "key-a", auth: "auth-a" }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const err = Object.assign(new Error("Gone"), { statusCode: 410 });
    webpush.sendNotification.mockRejectedValueOnce(err);

    await expect(enviarPush(7, { titulo: "X" })).resolves.toBeUndefined();

    expect(db.query).toHaveBeenCalledWith(
      "DELETE FROM push_subscriptions WHERE id = $1",
      [1]
    );
  });

  test("não consulta nem envia nada se VAPID não está configurado", async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    await enviarPush(7, { titulo: "X" });
    expect(db.query).not.toHaveBeenCalled();
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  test("não faz nada se o usuário não tem subscriptions", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await enviarPush(7, { titulo: "X" });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
});
