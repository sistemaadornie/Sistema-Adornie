// Rótulo curto de produto para telas de conferência (ex: "Cortina Wave Motorizada",
// "Persiana Manual"), reaproveitando a categorização/modelo já detectados na importação
// em vez de exibir a descrição completa do item.
function labelProdutoConferencia(tipoConfeccao, modelo, acionamento) {
  let base;
  if (tipoConfeccao === "persiana") base = "Persiana";
  else if (modelo) base = modelo;
  else if (tipoConfeccao === "cortina") base = "Cortina";
  else if (tipoConfeccao === "forro") base = "Forro";
  else return null;

  if (acionamento === "motorizado") return `${base} Motorizada`;
  if (acionamento === "manual") return `${base} Manual`;
  return base;
}

module.exports = { labelProdutoConferencia };
