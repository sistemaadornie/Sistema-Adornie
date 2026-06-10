// Número "curto" do pedido (sem prefixo), priorizando o número de origem (importado)
// sobre o número sequencial interno do sistema.
export function numeroPedidoCurto(pedido) {
  if (!pedido) return "";
  const origem = pedido.numero_origem;
  if (origem) {
    const n = parseInt(String(origem).replace(/^#+/, ""), 10);
    if (!Number.isNaN(n)) return String(n);
    return String(origem).replace(/^#+/, "");
  }
  return String(pedido.numero_sequencial ?? pedido.id ?? "");
}

// Número completo do pedido (com prefixo), priorizando o número de origem (importado)
// sobre o número sequencial interno do sistema.
export function numeroPedidoCompleto(pedido) {
  if (!pedido) return "";
  const origem = pedido.numero_origem;
  if (origem) {
    const n = parseInt(String(origem).replace(/^#+/, ""), 10);
    return Number.isNaN(n) ? String(origem) : `#${n}`;
  }
  return `SIS-${String(pedido.numero_sequencial ?? pedido.id ?? "").padStart(8, "0")}`;
}
