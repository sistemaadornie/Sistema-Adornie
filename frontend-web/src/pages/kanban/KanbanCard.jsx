import { useState } from 'react';

const PRIORIDADE_CONFIG = {
  urgente: { cor: '#C0614A', label: 'Urgente', emoji: '🔴' },
  alta:    { cor: '#D4A843', label: 'Alta',    emoji: '🟠' },
  normal:  { cor: '#C9A96E', label: 'Normal',  emoji: '🟡' },
  baixa:   { cor: '#7FB069', label: 'Baixa',   emoji: '🟢' },
};

function calcularDiasRestantes(prazoStr) {
  if (!prazoStr) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const prazo = new Date(prazoStr);
  prazo.setHours(0, 0, 0, 0);
  return Math.ceil((prazo - hoje) / (1000 * 60 * 60 * 24));
}

function formatarPrazo(prazoStr) {
  if (!prazoStr) return '';
  const d = new Date(prazoStr);
  const dia   = String(d.getUTCDate()).padStart(2, '0');
  const mes   = String(d.getUTCMonth() + 1).padStart(2, '0');
  const ano   = d.getUTCFullYear();
  return `${dia}/${mes}/${ano}`;
}

function prazoInfo(dias) {
  if (dias === null) return null;
  if (dias < 0)  return { cor: '#C0614A', sufixo: '— Atrasado' };
  if (dias <= 1) return { cor: '#D4A843', sufixo: '— Vence em breve' };
  if (dias <= 7) return { cor: '#C9A96E', sufixo: '' };
  return { cor: '#9A9080', sufixo: '' };
}

export default function KanbanCard({ projeto, onClick, onDragStart, onDragEnd, isDragging }) {
  const [hovered, setHovered] = useState(false);

  const prioridade = PRIORIDADE_CONFIG[projeto.prioridade] ?? PRIORIDADE_CONFIG.normal;
  const totalItens  = projeto.total_itens  ?? 0;
  const itensProntos = projeto.itens_prontos ?? 0;
  const progresso   = totalItens > 0 ? itensProntos / totalItens : 0;

  const diasRestantes = calcularDiasRestantes(projeto.prazo_entrega);
  const pInfo         = prazoInfo(diasRestantes);

  const valorFormatado = projeto.valor_estimado != null
    ? projeto.valor_estimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : null;

  // ── Estilos ─────────────────────────────────────────────────────────────

  const cardStyle = {
    background:     '#161512',
    border:         hovered
      ? '1px solid rgba(201, 169, 110, 0.45)'
      : '1px solid #2C2A25',
    borderRadius:   '10px',
    padding:        '12px 14px',
    cursor:         'pointer',
    opacity:        isDragging ? 0.5 : 1,
    transition:     'border-color 0.13s ease, box-shadow 0.13s ease, opacity 0.13s ease',
    boxShadow:      hovered
      ? '0 6px 24px rgba(0,0,0,0.55), 0 0 0 1px rgba(201,169,110,0.12)'
      : '0 4px 20px rgba(0,0,0,0.45)',
    userSelect:     'none',
    display:        'flex',
    flexDirection:  'column',
    gap:            '6px',
  };

  const headerStyle = {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            '8px',
  };

  const numeroStyle = {
    fontFamily:  '"Jost", system-ui, sans-serif',
    fontSize:    '11px',
    fontWeight:  '600',
    color:       '#5A544A',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    flexShrink:  0,
  };

  const badgeStyle = {
    display:        'inline-flex',
    alignItems:     'center',
    gap:            '4px',
    fontSize:       '11px',
    fontWeight:     '600',
    color:          prioridade.cor,
    background:     `${prioridade.cor}18`,
    border:         `1px solid ${prioridade.cor}40`,
    borderRadius:   '5px',
    padding:        '1px 7px',
    whiteSpace:     'nowrap',
    flexShrink:     0,
  };

  const tituloStyle = {
    fontFamily:   '"Cormorant Garamond", Georgia, serif',
    fontSize:     '15px',
    fontWeight:   '600',
    color:        '#F2EDE4',
    lineHeight:   '1.3',
    margin:       0,
    overflow:     'hidden',
    display:      '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  };

  const clienteStyle = {
    fontFamily: '"Jost", system-ui, sans-serif',
    fontSize:   '12px',
    color:      '#9A9080',
    margin:     0,
    overflow:   'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  const dividerStyle = {
    borderTop:  '1px solid #2C2A25',
    margin:     '4px 0',
  };

  const progressRowStyle = {
    display:      'flex',
    alignItems:   'center',
    gap:          '8px',
  };

  const progressTrackStyle = {
    flex:           1,
    height:         '5px',
    background:     '#2C2A25',
    borderRadius:   '3px',
    overflow:       'hidden',
  };

  const progressFillStyle = {
    height:         '100%',
    width:          `${Math.round(progresso * 100)}%`,
    background:     progresso >= 1
      ? '#7FB069'
      : 'linear-gradient(90deg, #C9A96E 0%, #D4B87A 100%)',
    borderRadius:   '3px',
    transition:     'width 0.3s ease',
  };

  const progressLabelStyle = {
    fontFamily: '"Jost", system-ui, sans-serif',
    fontSize:   '11px',
    color:      '#9A9080',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  };

  const tagsRowStyle = {
    display:    'flex',
    alignItems: 'center',
    gap:        '6px',
    flexWrap:   'wrap',
  };

  const tagBaseStyle = {
    display:      'inline-flex',
    alignItems:   'center',
    gap:          '3px',
    fontSize:     '11px',
    borderRadius: '5px',
    padding:      '2px 7px',
    whiteSpace:   'nowrap',
    fontFamily:   '"Jost", system-ui, sans-serif',
    fontWeight:   '500',
  };

  const confeccaoTagStyle = {
    ...tagBaseStyle,
    color:      '#6B9AB8',
    background: 'rgba(107,154,184,0.12)',
    border:     '1px solid rgba(107,154,184,0.25)',
  };

  const valorTagStyle = {
    ...tagBaseStyle,
    color:      '#C9A96E',
    background: 'rgba(201,169,110,0.10)',
    border:     '1px solid rgba(201,169,110,0.22)',
  };

  const prazoRowStyle = {
    display:    'flex',
    alignItems: 'center',
    gap:        '4px',
    fontFamily: '"Jost", system-ui, sans-serif',
    fontSize:   '11px',
    color:      pInfo?.cor ?? '#9A9080',
    flexWrap:   'wrap',
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      style={cardStyle}
      draggable="true"
      onClick={onClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Header: número + badge prioridade */}
      <div style={headerStyle}>
        <span style={numeroStyle}>{projeto.numero}</span>
        <span style={badgeStyle}>
          {prioridade.emoji} {prioridade.label}
        </span>
      </div>

      {/* Título */}
      <p style={tituloStyle}>{projeto.titulo}</p>

      {/* Cliente */}
      {projeto.nome_cliente && (
        <p style={clienteStyle}>
          {projeto.nome_cliente}
        </p>
      )}

      <div style={dividerStyle} />

      {/* Barra de progresso */}
      {totalItens > 0 && (
        <div style={progressRowStyle}>
          <div style={progressTrackStyle}>
            <div style={progressFillStyle} />
          </div>
          <span style={progressLabelStyle}>
            {itensProntos}/{totalItens} {totalItens === 1 ? 'item' : 'itens'}
          </span>
        </div>
      )}

      {/* Tags: confecção + valor */}
      {(projeto.requer_confeccao || valorFormatado) && (
        <div style={tagsRowStyle}>
          {projeto.requer_confeccao && (
            <span style={confeccaoTagStyle}>⚙ Confecção</span>
          )}
          {valorFormatado && (
            <span style={valorTagStyle}>📦 {valorFormatado}</span>
          )}
        </div>
      )}

      {/* Prazo */}
      {pInfo && projeto.prazo_entrega && (
        <div style={prazoRowStyle}>
          <span>📅</span>
          <span>Prazo: {formatarPrazo(projeto.prazo_entrega)}</span>
          {pInfo.sufixo && (
            <span style={{ fontWeight: 600 }}>{pInfo.sufixo}</span>
          )}
        </div>
      )}

      {/* Vendedora */}
      {projeto.vendedora_nome && (
        <div style={{ ...clienteStyle, color: '#7FB069', marginTop: 2 }}>
          ● {projeto.vendedora_nome}
        </div>
      )}
    </div>
  );
}
