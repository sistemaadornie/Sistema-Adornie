// frontend-web/src/pages/pedidos/importKeywordConfig.js

export const KEYWORD_MODELS = [
  {
    keywords: ["cortina"],
    tipo: "cortina",
    modelos: [
      "Cortina Wave",
      "Cortina Prega Macho",
      "Cortina Prega Americana",
      "Cortina Franzida",
    ],
  },
  {
    keywords: ["forro"],
    tipo: "forro",
    modelos: ["Forro Microfibra", "Forro Blackout"],
  },
  {
    keywords: ["persiana"],
    tipo: "persiana",
    modelos: [
      {
        nome: "Meliade",
        tubos: ["30mm", "38mm", "45mm", "53mm"],
        bandos: ["Bandô 32mm", "Bandô 38mm", "Bandô 53mm"],
      },
      {
        nome: "Illumine",
        tubos: ["30mm", "38mm", "45mm", "53mm"],
        bandos: ["Bandô 32mm", "Bandô 38mm", "Bandô 53mm"],
      },
      {
        nome: "Lumiere / Diamond / Silouette",
        tubos: ["30mm", "38mm", "45mm", "53mm"],
        bandos: ["Bandô 32mm", "Bandô 38mm", "Bandô 53mm"],
      },
      {
        nome: "Rolo / Rollo",
        tubos: ["30mm", "38mm", "45mm", "53mm", "65mm", "70mm", "88mm", "110mm"],
        caixas: ["Caixa box 90mm", "Caixa box 70mm", "Caixa box grande"],
        bandos: ["Bandô 32mm", "Bandô 38mm", "Bandô 53mm"],
      },
      {
        nome: "Rolo Stilo / Shadow / Twinline / D. Vision",
        tubos: ["30mm", "38mm", "45mm", "53mm"],
        bandos: ["Bandô 32mm", "Bandô 38mm", "Bandô 53mm"],
      },
    ],
  },
  {
    keywords: ["trilho"],
    tipo: "trilho",
    modelos: [], // sem seleção de modelo — só ativa vinculação
  },
];

export function detectarTipo(descricao = "") {
  const lower = descricao.toLowerCase();
  let bestMatch = null;
  let bestPos = Infinity;

  for (const cfg of KEYWORD_MODELS) {
    for (const k of cfg.keywords) {
      const pos = lower.indexOf(k);
      if (pos !== -1 && pos < bestPos) {
        bestPos = pos;
        bestMatch = cfg;
      }
    }
  }
  return bestMatch;
}
