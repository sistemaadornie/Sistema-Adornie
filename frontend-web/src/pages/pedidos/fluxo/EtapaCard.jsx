import React from "react";

const ETAPA_CONFIG = {
  1: { icone: "📋", titulo: "Pedidos" },
  2: { icone: "📐", titulo: "Conferência de Medidas" },
  3: { icone: "⚙️", titulo: "Produção/Compras" },
  4: { icone: "🔍", titulo: "Conferência do Produto" },
  5: { icone: "📅", titulo: "Agendamento (Instalação)" },
  6: { icone: "📦", titulo: "Separação" },
  7: { icone: "🚚", titulo: "Entrega" },
  8: { icone: "⭐", titulo: "Pós-venda" },
};

export default function EtapaCard({ etapa, etapaAtual, onClick }) {
  const { numero, concluida, progresso } = etapa;
  const config = ETAPA_CONFIG[numero];
  const ativa = !concluida && numero === etapaAtual;
  const pendente = !concluida && !ativa;

  let cls = "etapa-card";
  if (concluida) cls += " concluida";
  else if (ativa) cls += " ativa";
  else cls += " pendente";

  function buildStatusLabel() {
    if (concluida) return "Concluído";
    if (pendente) return "Aguardando";
    if (numero === 1) {
      const { itens_cobertos = 0, total_itens = 0 } = progresso;
      return `${itens_cobertos} de ${total_itens} itens agendados`;
    }
    if (numero === 2) {
      const { conferidos = 0, total = 0 } = progresso;
      return `${conferidos} de ${total} conferidos`;
    }
    if (numero === 3) {
      const { em_confeccao = 0, confeccao_ok = 0 } = progresso;
      if (em_confeccao === 0) return "Sem itens em confecção";
      return `${confeccao_ok} de ${em_confeccao} concluídos`;
    }
    if (numero === 4) {
      const { itens_produto_ok = 0, total_itens = 0 } = progresso;
      return `${itens_produto_ok} de ${total_itens} conferidos`;
    }
    if (numero === 5) return "Aguardando confirmação";
    if (numero === 6) {
      const { total_itens_instalacao = 0, itens_separados = 0 } = progresso;
      if (total_itens_instalacao === 0) return "Nenhuma instalação agendada";
      return `${itens_separados} de ${total_itens_instalacao} separados`;
    }
    if (numero === 7) {
      const { instalacoes_total = 0, instalacoes_concluidas = 0 } = progresso;
      if (instalacoes_total === 0) return "Nenhuma instalação agendada";
      return `${instalacoes_concluidas} de ${instalacoes_total} concluídas`;
    }
    if (numero === 8) return "Aguardando encerramento";
    return "Em andamento";
  }

  function buildProgressPct() {
    if (concluida) return 100;
    if (numero === 1) {
      const { itens_cobertos = 0, total_itens = 1 } = progresso;
      return Math.round((itens_cobertos / total_itens) * 100);
    }
    if (numero === 2) {
      const { conferidos = 0, total = 1 } = progresso;
      return Math.round((conferidos / total) * 100);
    }
    if (numero === 3) {
      const { em_confeccao = 0, confeccao_ok = 0 } = progresso;
      if (em_confeccao === 0) return 100;
      return Math.round((confeccao_ok / em_confeccao) * 100);
    }
    if (numero === 4) {
      const { itens_produto_ok = 0, total_itens = 0 } = progresso;
      if (total_itens === 0) return 0;
      return Math.round((itens_produto_ok / total_itens) * 100);
    }
    if (numero === 6) {
      const { total_itens_instalacao = 0, itens_separados = 0 } = progresso;
      if (total_itens_instalacao === 0) return 0;
      return Math.round((itens_separados / total_itens_instalacao) * 100);
    }
    if (numero === 7) {
      const { instalacoes_total = 0, instalacoes_concluidas = 0 } = progresso;
      if (instalacoes_total === 0) return 0;
      return Math.round((instalacoes_concluidas / instalacoes_total) * 100);
    }
    return 0;
  }

  const pct = buildProgressPct();

  return (
    <div
      className={cls}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      style={{ width: 200, flexShrink: 0, cursor: "pointer" }}
    >
      <div className="card-header">
        <div className="card-num">{concluida ? "✓" : numero}</div>
        <div className="card-titulo">{config.titulo}</div>
      </div>
      <div style={{ textAlign: "center", padding: "14px 0 8px", fontSize: 28, lineHeight: 1 }}>
        {config.icone}
      </div>
      <div className="card-status" style={{ textAlign: "center", padding: "0 16px 6px", fontSize: 11, fontWeight: 600 }}>
        {buildStatusLabel()}
      </div>
      {ativa && (
        <div style={{ padding: "0 16px 12px" }}>
          <div className="pf-progresso-bar">
            <div className="pf-progresso-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
