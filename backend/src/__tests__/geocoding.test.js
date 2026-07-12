const { photon, nominatim } = require("../utils/geocoding");

describe("exports públicos", () => {
  test("nominatim é exportado como função", () => {
    expect(typeof nominatim).toBe("function");
  });
  test("photon é exportado como função", () => {
    expect(typeof photon).toBe("function");
  });
});

describe("nominatim - construção da query", () => {
  let requestedPaths;

  beforeEach(() => {
    jest.resetModules();
    requestedPaths = [];

    jest.doMock("https", () => ({
      request: jest.fn((options, callback) => {
        requestedPaths.push(options.path);
        const res = {
          statusCode: 200,
          on: (event, handler) => {
            if (event === "data") handler("[]");
            if (event === "end") handler();
          },
        };
        // Simula callback assíncrono como o https real faria
        process.nextTick(() => callback(res));
        return {
          on: jest.fn(),
          setTimeout: jest.fn(),
          end: jest.fn(),
        };
      }),
    }));
  });

  afterEach(() => {
    jest.dontMock("https");
    jest.resetModules();
  });

  test("sem rua: usa bairro tanto na query estruturada quanto na livre (fallback)", async () => {
    const { nominatim: nominatimMocked } = require("../utils/geocoding");

    await nominatimMocked({ bairro: "Bairro Teste", cidade: "Curitiba", estado: "PR" });

    expect(requestedPaths.length).toBe(2);
    const [pathEstruturada, pathLivre] = requestedPaths;

    // Query estruturada: bairro deve ser usado como valor de "street"
    expect(pathEstruturada).toMatch(/street=Bairro(\+|%20)Teste/);

    // Query livre (fallback): bairro deve estar presente no "q"
    expect(pathLivre).toMatch(/Bairro/);
  }, 15000);

  test("com rua: comportamento da query estruturada permanece inalterado (sem bairro)", async () => {
    const { nominatim: nominatimMocked } = require("../utils/geocoding");

    await nominatimMocked({ rua: "Rua Teste", numero: "123", cidade: "Curitiba", estado: "PR" });

    expect(requestedPaths.length).toBe(2);
    const [pathEstruturada, pathLivre] = requestedPaths;

    expect(pathEstruturada).toMatch(/street=123(\+|%20)Rua(\+|%20)Teste/);
    expect(pathLivre).toMatch(/Rua(\+|%20)Teste/);
  }, 15000);
});
