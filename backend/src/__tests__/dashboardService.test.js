const { calcularEtapaAtual } = require("../services/dashboardService");

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
