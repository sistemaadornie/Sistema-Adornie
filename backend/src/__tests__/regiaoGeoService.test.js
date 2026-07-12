jest.mock("../database/db", () => ({ query: jest.fn() }));
jest.mock("../utils/geocoding", () => ({ photon: jest.fn(), nominatim: jest.fn() }));

const db = require("../database/db");
const { photon, nominatim } = require("../utils/geocoding");
const { registrarRegiaoSeNecessaria, buscarCoordenadasCache } = require("../services/regiaoGeoService");

afterEach(() => jest.clearAllMocks());

describe("registrarRegiaoSeNecessaria", () => {
  test("sem cidade, nao faz nada", async () => {
    await registrarRegiaoSeNecessaria({ empresaId: 7, bairro: "Batel", cidade: null, estado: null });
    expect(db.query).not.toHaveBeenCalled();
    expect(photon).not.toHaveBeenCalled();
  });

  test("cidade e bairro ja conhecidos na lista fixa: nao consulta nada", async () => {
    await registrarRegiaoSeNecessaria({ empresaId: 7, bairro: "Batel", cidade: "Curitiba", estado: "PR" });
    expect(db.query).not.toHaveBeenCalled();
    expect(photon).not.toHaveBeenCalled();
  });

  test("cidade nova: geocodifica com photon e grava no cache", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // jaConhecida cidade
      .mockResolvedValueOnce({ rows: [] }); // INSERT
    photon.mockResolvedValueOnce({ lat: -10.5, lng: -20.5 });

    await registrarRegiaoSeNecessaria({ empresaId: 7, bairro: null, cidade: "Cidade Nova", estado: "XX" });

    expect(photon).toHaveBeenCalledWith("Cidade Nova XX");
    const insertCall = db.query.mock.calls[1];
    expect(insertCall[0]).toMatch(/INSERT INTO regioes_geo/);
    expect(insertCall[1]).toEqual([7, "cidade", "cidade nova", "Cidade Nova", null, "XX", -10.5, -20.5, false]);
  });

  test("cidade nova ja em cache: nao geocodifica de novo", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // jaConhecida cidade -> ja existe

    await registrarRegiaoSeNecessaria({ empresaId: 7, bairro: null, cidade: "Cidade Nova", estado: "XX" });

    expect(photon).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test("bairro novo em Curitiba (cidade ja conhecida): geocodifica so o bairro", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // jaConhecida bairro
      .mockResolvedValueOnce({ rows: [] }); // INSERT
    photon.mockResolvedValueOnce({ lat: -25.1, lng: -49.1 });

    await registrarRegiaoSeNecessaria({ empresaId: 7, bairro: "Bairro Novo XYZ", cidade: "Curitiba", estado: "PR" });

    expect(photon).toHaveBeenCalledTimes(1);
    expect(photon).toHaveBeenCalledWith("Bairro Novo XYZ Curitiba PR");
    const insertCall = db.query.mock.calls[1];
    expect(insertCall[1]).toEqual([7, "bairro", "bairro novo xyz", "Bairro Novo XYZ", "Curitiba", "PR", -25.1, -49.1, false]);
  });

  test("cidade fora de Curitiba: bairro nunca e registrado, mesmo se novo", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // jaConhecida cidade
      .mockResolvedValueOnce({ rows: [] }); // INSERT cidade
    photon.mockResolvedValueOnce({ lat: -1, lng: -2 });

    await registrarRegiaoSeNecessaria({ empresaId: 7, bairro: "Bairro Qualquer", cidade: "Cidade Fake", estado: "XX" });

    expect(db.query).toHaveBeenCalledTimes(2); // so cidade: jaConhecida + insert
    expect(photon).toHaveBeenCalledTimes(1);
  });

  test("photon e nominatim falham: grava geocod_falhou=true", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // jaConhecida cidade
      .mockResolvedValueOnce({ rows: [] }); // INSERT
    photon.mockResolvedValueOnce(null);
    nominatim.mockResolvedValueOnce(null);

    await registrarRegiaoSeNecessaria({ empresaId: 7, bairro: null, cidade: "Cidade Perdida", estado: "XX" });

    const insertCall = db.query.mock.calls[1];
    expect(insertCall[1]).toEqual([7, "cidade", "cidade perdida", "Cidade Perdida", null, "XX", null, null, true]);
  });
});

describe("buscarCoordenadasCache", () => {
  test("lista de chaves vazia nao consulta o banco", async () => {
    const r = await buscarCoordenadasCache(7, "bairro", []);
    expect(r.size).toBe(0);
    expect(db.query).not.toHaveBeenCalled();
  });

  test("retorna um Map indexado por chave", async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: "bairro cache", nome: "Bairro Cache", lat: -25.1, lng: -49.1 }],
    });

    const r = await buscarCoordenadasCache(7, "bairro", ["bairro cache"]);

    expect(r.get("bairro cache")).toEqual({ id: "bairro cache", nome: "Bairro Cache", lat: -25.1, lng: -49.1 });
    expect(db.query.mock.calls[0][1]).toEqual([7, "bairro", ["bairro cache"]]);
  });
});
