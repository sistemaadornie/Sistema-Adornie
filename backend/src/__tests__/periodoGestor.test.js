const { getPeriodoAtual, getPeriodoAnterior } = require("../utils/periodoGestor");

const HOJE = new Date(2026, 6, 11); // 11/jul/2026 (mês 6 = julho, 0-indexed)

describe("getPeriodoAtual", () => {
  test("mes -> do dia 1 do mês atual até hoje", () => {
    expect(getPeriodoAtual("mes", HOJE)).toEqual({ inicio: "2026-07-01", fim: "2026-07-11" });
  });

  test("trimestre -> do início do trimestre civil até hoje", () => {
    expect(getPeriodoAtual("trimestre", HOJE)).toEqual({ inicio: "2026-07-01", fim: "2026-07-11" });
  });

  test("ano -> de 1/jan até hoje", () => {
    expect(getPeriodoAtual("ano", HOJE)).toEqual({ inicio: "2026-01-01", fim: "2026-07-11" });
  });

  test("default é mes quando periodo é inválido/ausente", () => {
    expect(getPeriodoAtual(undefined, HOJE)).toEqual({ inicio: "2026-07-01", fim: "2026-07-11" });
  });
});

describe("getPeriodoAnterior", () => {
  test("mes -> mês civil anterior completo", () => {
    expect(getPeriodoAnterior("mes", HOJE)).toEqual({ inicio: "2026-06-01", fim: "2026-06-30" });
  });

  test("mes -> vira o ano corretamente (janeiro -> dezembro do ano anterior)", () => {
    const janeiro = new Date(2026, 0, 15);
    expect(getPeriodoAnterior("mes", janeiro)).toEqual({ inicio: "2025-12-01", fim: "2025-12-31" });
  });

  test("trimestre -> trimestre civil anterior completo (Q3 -> Q2)", () => {
    expect(getPeriodoAnterior("trimestre", HOJE)).toEqual({ inicio: "2026-04-01", fim: "2026-06-30" });
  });

  test("trimestre -> vira o ano (Q1 -> Q4 do ano anterior)", () => {
    const janeiro = new Date(2026, 0, 15);
    expect(getPeriodoAnterior("trimestre", janeiro)).toEqual({ inicio: "2025-10-01", fim: "2025-12-31" });
  });

  test("ano -> ano civil anterior completo", () => {
    expect(getPeriodoAnterior("ano", HOJE)).toEqual({ inicio: "2025-01-01", fim: "2025-12-31" });
  });
});
