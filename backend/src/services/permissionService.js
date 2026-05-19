/* Aliases para compatibilidade com tokens emitidos antes da renomeação */
const ALIASES = {
  "AGENDAMENTO_INSTALADOR":      "INSTALADOR",
  "VENDEDOR":                    "COMERCIAL",
  "USUARIO_APROVAR":             "GESTOR_USUARIOS",
  "USUARIO_ATRIBUIR_PERMISSOES": "GESTOR_USUARIOS",
};

function normalizar(permissoes) {
  const set = new Set(permissoes || []);
  for (const [antigo, novo] of Object.entries(ALIASES)) {
    if (set.has(antigo)) set.add(novo);
  }
  return set;
}

function isInstaladorPuro(permissoes) {
  const p = normalizar(permissoes);
  const altas = ["COMERCIAL","OPERADOR_AGENDA","ADMIN_MASTER","GESTOR_USUARIOS"];
  return p.has("INSTALADOR") && !altas.some((a) => p.has(a));
}

function isComercialPuro(permissoes) {
  const p = normalizar(permissoes);
  const altas = ["OPERADOR_AGENDA","ADMIN_MASTER","GESTOR_USUARIOS"];
  return p.has("COMERCIAL") && !altas.some((a) => p.has(a));
}

function podeGerenciarAgendamentos(permissoes) {
  const p = normalizar(permissoes);
  return p.has("OPERADOR_AGENDA") || p.has("ADMIN_MASTER");
}

module.exports = { isInstaladorPuro, isComercialPuro, podeGerenciarAgendamentos };
