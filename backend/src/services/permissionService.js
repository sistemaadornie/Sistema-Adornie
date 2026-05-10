function isInstaladorPuro(permissoes) {
  const altas = ["VENDEDOR","OPERADOR_AGENDA","ADMIN_MASTER","USUARIO_APROVAR","USUARIO_ATRIBUIR_PERMISSOES"];
  return (permissoes || []).includes("AGENDAMENTO_INSTALADOR") &&
    !altas.some((p) => (permissoes || []).includes(p));
}

function isVendedorPuro(permissoes) {
  const altas = ["OPERADOR_AGENDA","ADMIN_MASTER","USUARIO_APROVAR","USUARIO_ATRIBUIR_PERMISSOES"];
  return (permissoes || []).includes("VENDEDOR") &&
    !altas.some((p) => (permissoes || []).includes(p));
}

function podeGerenciarAgendamentos(permissoes) {
  return (permissoes || []).some((p) => ["OPERADOR_AGENDA","ADMIN_MASTER"].includes(p));
}

module.exports = { isInstaladorPuro, isVendedorPuro, podeGerenciarAgendamentos };
