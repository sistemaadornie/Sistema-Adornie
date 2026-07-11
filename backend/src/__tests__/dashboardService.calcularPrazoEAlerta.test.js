const { calcularPrazoEAlerta } = require("../services/dashboardService");

describe("calcularPrazoEAlerta", () => {
  const hoje = new Date("2026-07-11T12:00:00Z");

  test("sem pré-agendamentos futuros -> tudo null", () => {
    const r = calcularPrazoEAlerta([], hoje);
    expect(r).toEqual({ proximoPrazo: null, diasParaPrazo: null, nivelAlerta: null });
  });

  test("ignora pré-agendamentos com status diferente de pre_agendado/agendado", () => {
    const r = calcularPrazoEAlerta(
      [{ status: "concluido", data_inicio: "2026-07-12" }],
      hoje
    );
    expect(r.proximoPrazo).toBeNull();
  });

  test("pega o pré-agendamento futuro mais próximo e calcula dias/nível", () => {
    const r = calcularPrazoEAlerta(
      [
        { status: "agendado", data_inicio: "2026-07-20" },
        { status: "pre_agendado", data_inicio: "2026-07-13" },
      ],
      hoje
    );
    expect(r.proximoPrazo).toBe("2026-07-13");
    expect(r.diasParaPrazo).toBe(1);
    expect(r.nivelAlerta).toBe("urgente");
  });

  test("prazo já passado -> nivelAlerta atrasado", () => {
    const r = calcularPrazoEAlerta(
      [{ status: "agendado", data_inicio: "2026-07-05" }],
      hoje
    );
    expect(r.diasParaPrazo).toBeLessThanOrEqual(0);
    expect(r.nivelAlerta).toBe("atrasado");
  });
});
