const { photon, nominatim } = require("../utils/geocoding");

describe("exports públicos", () => {
  test("nominatim é exportado como função", () => {
    expect(typeof nominatim).toBe("function");
  });
  test("photon é exportado como função", () => {
    expect(typeof photon).toBe("function");
  });
});
