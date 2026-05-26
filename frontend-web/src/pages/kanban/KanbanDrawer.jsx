import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

// ── Constantes ────────────────────────────────────────────────────────────────

const ETAPA_LABELS = {
  orcamento:              'Orçamento',
  venda:                  'Venda',
  conferencia_consultora: 'Conf. Consultora',
  conferencia_tecnica:    'Conf. Técnica',
  verificacao_admin:      'Verificação Admin',
  compras:                'Compras',
  confeccao:              'Confecção',
  pre_agendado:           'Pré-agendado',
  agendado:               'Agendado',
};

const ETAPAS_ORDEM = [
  'orcamento',
  'venda',
  'conferencia_consultora',
  'conferencia_tecnica',
  'verificacao_admin',
  'compras',
  'confeccao',
  'pre_agendado',
  'agendado',
];

const STATUS_ITEM_CONFIG = {
  pendente:      { cor: '#9A9080', label: 'Pendente' },
  pedido:        { cor: '#6B9AB8', label: 'Pedido' },
  chegou_loja:   { cor: '#7FB069', label: 'Em Loja' },
  em_confeccao:  { cor: '#D4A843', label: 'Em Confecção' },
  confeccionado: { cor: '#C9A96E', label: 'Confeccionado' },
  pronto:        { cor: '#7FB069', label: 'Pronto' },
};

const PRIORIDADE_CONFIG = {
  urgente: { cor: '#C0614A', label: 'Urgente', emoji: '🔴' },
  alta:    { cor: '#D4A843', label: 'Alta',    emoji: '🟠' },
  normal:  { cor: '#C9A96E', label: 'Normal',  emoji: '🟡' },
  baixa:   { cor: '#7FB069', label: 'Baixa',   emoji: '🟢' },
};

const TIPOS_SOB_DEMANDA = ['sob_demanda_fornecedor', 'sob_demanda_material'];

// ── Utilidades ────────────────────────────────────────────────────────────────

function formatarData(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const dia = String(d.getUTCDate()).padStart(2, '0');
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  const ano = d.getUTCFullYear();
  return `${dia}/${mes}/${ano}`;
}

function formatarDataHora(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const hoje = new Date();
  const isHoje =
    d.getFullYear() === hoje.getFullYear() &&
    d.getMonth() === hoje.getMonth() &&
    d.getDate() === hoje.getDate();
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return isHoje ? `Hoje ${hora}` : `${formatarData(isoStr)} ${hora}`;
}

function formatarValor(valor) {
  if (valor == null) return null;
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function calcularProximaEtapa(etapaAtual, requerConfeccao) {
  let ordem = [...ETAPAS_ORDEM];
  if (!requerConfeccao) {
    ordem = ordem.filter((e) => e !== 'confeccao');
  }
  const idx = ordem.indexOf(etapaAtual);
  if (idx === -1 || idx === ordem.length - 1) return null;
  return ordem[idx + 1];
}

function calcularEtapasAnteriores(etapaAtual, requerConfeccao) {
  let ordem = [...ETAPAS_ORDEM];
  if (!requerConfeccao) {
    ordem = ordem.filter((e) => e !== 'confeccao');
  }
  const idx = ordem.indexOf(etapaAtual);
  if (idx <= 0) return [];
  return ordem.slice(0, idx);
}

// ── Estilos base ──────────────────────────────────────────────────────────────

const C = {
  bg:            '#0E0D0B',
  surface:       '#161512',
  surfaceStrong: '#1F1D19',
  card:          '#161512',
  primary:       '#C9A96E',
  primarySoft:   'rgba(201, 169, 110, 0.10)',
  text:          '#F2EDE4',
  textSec:       '#9A9080',
  textMuted:     '#5A544A',
  border:        '#2C2A25',
  success:       '#7FB069',
  warning:       '#D4A843',
  danger:        '#C0614A',
  info:          '#6B9AB8',
};

// ── Componente auxiliar: Badge de status de item ───────────────────────────────

function StatusItemBadge({ status }) {
  const cfg = STATUS_ITEM_CONFIG[status] ?? { cor: C.textMuted, label: status };
  return (
    <span
      style={{
        display:      'inline-flex',
        alignItems:   'center',
        fontSize:     '10px',
        fontWeight:   '600',
        fontFamily:   '"Jost", system-ui, sans-serif',
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
        color:        cfg.cor,
        background:   `${cfg.cor}18`,
        border:       `1px solid ${cfg.cor}40`,
        borderRadius: '4px',
        padding:      '1px 6px',
        whiteSpace:   'nowrap',
        flexShrink:   0,
      }}
    >
      {cfg.label}
    </span>
  );
}

// ── Componente auxiliar: Linha do histórico ────────────────────────────────────

function HistoricoItem({ entry }) {
  const iniciais = (entry.usuario_nome || 'S')
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  return (
    <div
      style={{
        display:   'flex',
        gap:       '10px',
        alignItems: 'flex-start',
        padding:   '10px 0',
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width:         '32px',
          height:        '32px',
          borderRadius:  '50%',
          background:    C.surfaceStrong,
          border:        `1px solid ${C.border}`,
          display:       'flex',
          alignItems:    'center',
          justifyContent:'center',
          fontSize:      '11px',
          fontWeight:    '700',
          color:         C.primary,
          fontFamily:    '"Jost", system-ui, sans-serif',
          flexShrink:    0,
        }}
      >
        {iniciais}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Autor + data */}
        <div
          style={{
            display:    'flex',
            alignItems: 'center',
            gap:        '6px',
            marginBottom: '3px',
          }}
        >
          <span
            style={{
              fontFamily: '"Jost", system-ui, sans-serif',
              fontSize:   '12px',
              fontWeight: '600',
              color:      C.text,
            }}
          >
            {entry.usuario_nome || 'Sistema'}
          </span>
          <span
            style={{
              fontFamily: '"Jost", system-ui, sans-serif',
              fontSize:   '11px',
              color:      C.textMuted,
            }}
          >
            · {formatarDataHora(entry.criado_em)}
          </span>
        </div>

        {/* Descrição */}
        <p
          style={{
            margin:     0,
            fontFamily: '"Jost", system-ui, sans-serif',
            fontSize:   '12px',
            color:      C.textSec,
            lineHeight: '1.45',
          }}
        >
          {entry.etapa_anterior && entry.etapa_nova && (
            <span>
              <span style={{ color: C.textMuted }}>
                "{ETAPA_LABELS[entry.etapa_anterior] ?? entry.etapa_anterior}"
              </span>
              {' → '}
              <span style={{ color: C.primary }}>
                "{ETAPA_LABELS[entry.etapa_nova] ?? entry.etapa_nova}"
              </span>
            </span>
          )}
          {entry.observacao && (
            <span style={{ color: C.textMuted }}>{entry.etapa_anterior ? ' — ' : ''}{entry.observacao}</span>
          )}
        </p>
      </div>
    </div>
  );
}

// ── Componente auxiliar: Item do projeto ────────────────────────────────────────

function ItemRow({ item, etapaAtual, projetoId, onItemChegou, onItemConfeccionado }) {
  const [expandido, setExpandido]             = useState(false);
  const [quantidade, setQuantidade]           = useState('');
  const [obs, setObs]                         = useState('');
  const [salvando, setSalvando]               = useState(false);

  const podeMarcaChegou =
    etapaAtual === 'compras' &&
    TIPOS_SOB_DEMANDA.includes(item.tipo_disponibilidade) &&
    (item.status_item === 'pendente' || item.status_item === 'pedido');

  const podeMarcaConfeccionado =
    etapaAtual === 'confeccao' &&
    item.status_item === 'em_confeccao';

  async function handleChegou() {
    if (!quantidade) return;
    setSalvando(true);
    try {
      await onItemChegou(projetoId, item.id, Number(quantidade), obs);
      setExpandido(false);
      setQuantidade('');
      setObs('');
    } finally {
      setSalvando(false);
    }
  }

  async function handleConfeccionado() {
    setSalvando(true);
    try {
      await onItemConfeccionado(projetoId, item.id);
    } finally {
      setSalvando(false);
    }
  }

  const disponibilidadeLabel =
    item.tipo_disponibilidade === 'sob_demanda_fornecedor' ? 'Sob Demanda (Fornecedor)' :
    item.tipo_disponibilidade === 'sob_demanda_material'   ? 'Sob Demanda (Material)' :
    item.tipo_disponibilidade === 'pronta_entrega'         ? 'Pronta Entrega' :
    item.tipo_disponibilidade ?? '';

  return (
    <div
      style={{
        background:   C.surfaceStrong,
        border:       `1px solid ${C.border}`,
        borderRadius: '8px',
        padding:      '10px 12px',
        display:      'flex',
        flexDirection:'column',
        gap:          '6px',
      }}
    >
      {/* Linha principal */}
      <div
        style={{
          display:    'flex',
          alignItems: 'flex-start',
          gap:        '8px',
        }}
      >
        {/* Indicador de status colorido */}
        <div
          style={{
            width:       '8px',
            height:      '8px',
            borderRadius:'50%',
            background:  STATUS_ITEM_CONFIG[item.status_item]?.cor ?? C.textMuted,
            marginTop:   '4px',
            flexShrink:  0,
          }}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display:    'flex',
              alignItems: 'center',
              gap:        '8px',
              flexWrap:   'wrap',
            }}
          >
            <span
              style={{
                fontFamily: '"Jost", system-ui, sans-serif',
                fontSize:   '13px',
                fontWeight: '500',
                color:      C.text,
                lineHeight: '1.3',
              }}
            >
              {item.descricao || item.produto_nome || `Item #${item.id}`}
              {item.dimensoes && (
                <span style={{ color: C.textSec }}> {item.dimensoes}</span>
              )}
            </span>
            <StatusItemBadge status={item.status_item} />
          </div>

          {/* Subtítulo: ambiente + tipo disponibilidade */}
          {(item.ambiente || disponibilidadeLabel) && (
            <p
              style={{
                margin:     '3px 0 0',
                fontFamily: '"Jost", system-ui, sans-serif',
                fontSize:   '11px',
                color:      C.textMuted,
              }}
            >
              {[item.ambiente, disponibilidadeLabel].filter(Boolean).join(' · ')}
            </p>
          )}

          {/* Prazo do item */}
          {item.prazo_item && (
            <p
              style={{
                margin:     '2px 0 0',
                fontFamily: '"Jost", system-ui, sans-serif',
                fontSize:   '11px',
                color:      C.textMuted,
              }}
            >
              Prazo: {formatarData(item.prazo_item)}
            </p>
          )}
        </div>
      </div>

      {/* Ações inline — Marcar Chegou */}
      {podeMarcaChegou && !expandido && (
        <button
          onClick={() => setExpandido(true)}
          style={{
            alignSelf:    'flex-start',
            marginTop:    '2px',
            padding:      '4px 10px',
            fontSize:     '11px',
            fontWeight:   '600',
            fontFamily:   '"Jost", system-ui, sans-serif',
            color:        C.success,
            background:   `${C.success}14`,
            border:       `1px solid ${C.success}40`,
            borderRadius: '5px',
            cursor:       'pointer',
          }}
        >
          ✓ Marcar Chegou
        </button>
      )}

      {podeMarcaChegou && expandido && (
        <div
          style={{
            background:   C.bg,
            border:       `1px solid ${C.border}`,
            borderRadius: '6px',
            padding:      '10px',
            display:      'flex',
            flexDirection:'column',
            gap:          '8px',
          }}
        >
          <label
            style={{
              fontFamily: '"Jost", system-ui, sans-serif',
              fontSize:   '11px',
              color:      C.textSec,
              fontWeight: '600',
            }}
          >
            Quantidade recebida
          </label>
          <input
            type="number"
            min="1"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            placeholder="Ex: 2"
            style={{
              background:   C.surfaceStrong,
              border:       `1px solid ${C.border}`,
              borderRadius: '6px',
              padding:      '6px 10px',
              color:        C.text,
              fontFamily:   '"Jost", system-ui, sans-serif',
              fontSize:     '13px',
              outline:      'none',
            }}
          />
          <textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Observação (opcional)"
            rows={2}
            style={{
              background:   C.surfaceStrong,
              border:       `1px solid ${C.border}`,
              borderRadius: '6px',
              padding:      '6px 10px',
              color:        C.text,
              fontFamily:   '"Jost", system-ui, sans-serif',
              fontSize:     '12px',
              resize:       'vertical',
              outline:      'none',
            }}
          />
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={handleChegou}
              disabled={!quantidade || salvando}
              style={{
                flex:         1,
                padding:      '6px 10px',
                fontSize:     '12px',
                fontWeight:   '600',
                fontFamily:   '"Jost", system-ui, sans-serif',
                color:        C.success,
                background:   `${C.success}18`,
                border:       `1px solid ${C.success}50`,
                borderRadius: '5px',
                cursor:       !quantidade || salvando ? 'not-allowed' : 'pointer',
                opacity:      !quantidade || salvando ? 0.6 : 1,
              }}
            >
              {salvando ? 'Salvando…' : 'Confirmar'}
            </button>
            <button
              onClick={() => { setExpandido(false); setQuantidade(''); setObs(''); }}
              style={{
                padding:      '6px 10px',
                fontSize:     '12px',
                fontFamily:   '"Jost", system-ui, sans-serif',
                color:        C.textMuted,
                background:   'transparent',
                border:       `1px solid ${C.border}`,
                borderRadius: '5px',
                cursor:       'pointer',
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Ação — Marcar Confeccionado */}
      {podeMarcaConfeccionado && (
        <button
          onClick={handleConfeccionado}
          disabled={salvando}
          style={{
            alignSelf:    'flex-start',
            marginTop:    '2px',
            padding:      '4px 10px',
            fontSize:     '11px',
            fontWeight:   '600',
            fontFamily:   '"Jost", system-ui, sans-serif',
            color:        C.primary,
            background:   C.primarySoft,
            border:       `1px solid rgba(201,169,110,0.35)`,
            borderRadius: '5px',
            cursor:       salvando ? 'not-allowed' : 'pointer',
            opacity:      salvando ? 0.6 : 1,
          }}
        >
          {salvando ? 'Salvando…' : '⚙ Marcar Confeccionado'}
        </button>
      )}
    </div>
  );
}

// ── Componente principal: KanbanDrawer ────────────────────────────────────────

export default function KanbanDrawer({
  projeto,
  etapaAtual,
  user,
  onClose,
  onAvancar,
  onReencaminhar,
  onItemChegou,
  onItemConfeccionado,
  onConfirmarAgendamento,
}) {
  // ── Estado ────────────────────────────────────────────────────────────────
  const [reencAberto,    setReencAberto]    = useState(false);
  const [reencEtapa,     setReencEtapa]     = useState('');
  const [reencMotivo,    setReencMotivo]    = useState('');
  const [salvandoAvanc,  setSalvandoAvanc]  = useState(false);
  const [salvandoReenc,  setSalvandoReenc]  = useState(false);
  const [salvandoAgend,  setSalvandoAgend]  = useState(false);

  // ── Fechar com Escape ─────────────────────────────────────────────────────
  const handleKey = useCallback(
    (e) => { if (e.key === 'Escape') onClose(); },
    [onClose],
  );
  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  // ── Guard ─────────────────────────────────────────────────────────────────
  if (!projeto) return null;

  // ── Cálculos ──────────────────────────────────────────────────────────────
  const proximaEtapa      = calcularProximaEtapa(etapaAtual, projeto.requer_confeccao);
  const etapasAnteriores  = calcularEtapasAnteriores(etapaAtual, projeto.requer_confeccao);
  const podeAvancar       = etapaAtual !== 'agendado' && proximaEtapa !== null;
  const podeReencaminhar  =
    user?.permissoes?.includes('KANBAN_ADMIN') && etapaAtual !== 'orcamento';
  const podeConfirmarAgend = etapaAtual === 'pre_agendado';

  const itens     = projeto.itens     ?? [];
  const historico = projeto.historico ?? [];

  const prioridade = PRIORIDADE_CONFIG[projeto.prioridade] ?? PRIORIDADE_CONFIG.normal;
  const valorFmt   = formatarValor(projeto.valor_estimado);

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleAvancar() {
    if (!proximaEtapa) return;
    setSalvandoAvanc(true);
    try {
      await onAvancar(projeto.id, proximaEtapa);
      onClose();
    } finally {
      setSalvandoAvanc(false);
    }
  }

  async function handleReencaminhar() {
    if (!reencEtapa || !reencMotivo.trim()) return;
    setSalvandoReenc(true);
    try {
      await onReencaminhar(projeto.id, reencEtapa, reencMotivo.trim());
      onClose();
    } finally {
      setSalvandoReenc(false);
    }
  }

  async function handleConfirmarAgendamento() {
    setSalvandoAgend(true);
    try {
      await onConfirmarAgendamento(projeto.id);
      onClose();
    } finally {
      setSalvandoAgend(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const conteudo = (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position:   'fixed',
          inset:      0,
          background: 'rgba(0, 0, 0, 0.62)',
          zIndex:     1200,
        }}
      />

      {/* Painel */}
      <div
        style={{
          position:    'fixed',
          top:         0,
          right:       0,
          height:      '100vh',
          width:       '480px',
          maxWidth:    '100vw',
          background:  C.surface,
          borderLeft:  `1px solid ${C.border}`,
          zIndex:      1201,
          display:     'flex',
          flexDirection:'column',
          transform:   'translateX(0)',
          transition:  'transform 0.3s ease',
          boxShadow:   '-8px 0 40px rgba(0,0,0,0.5)',
        }}
      >

        {/* ── HEADER ── */}
        <div
          style={{
            padding:        '16px 20px 14px',
            borderBottom:   `1px solid ${C.border}`,
            flexShrink:     0,
          }}
        >
          {/* Número + botão fechar */}
          <div
            style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              marginBottom:   '6px',
            }}
          >
            <span
              style={{
                fontFamily:    '"Jost", system-ui, sans-serif',
                fontSize:      '11px',
                fontWeight:    '700',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color:         C.textMuted,
              }}
            >
              {projeto.numero ?? `#${projeto.id}`}
            </span>

            <button
              onClick={onClose}
              title="Fechar (Esc)"
              style={{
                width:        '28px',
                height:       '28px',
                display:      'flex',
                alignItems:   'center',
                justifyContent:'center',
                background:   'transparent',
                border:       `1px solid ${C.border}`,
                borderRadius: '6px',
                color:        C.textMuted,
                cursor:       'pointer',
                fontSize:     '14px',
                lineHeight:   1,
                flexShrink:   0,
              }}
            >
              ×
            </button>
          </div>

          {/* Título */}
          <h2
            style={{
              fontFamily: '"Cormorant Garamond", Georgia, serif',
              fontSize:   '20px',
              fontWeight: '600',
              color:      C.text,
              margin:     '0 0 3px',
              lineHeight: '1.25',
            }}
          >
            {projeto.titulo}
          </h2>

          {/* Cliente */}
          {projeto.nome_cliente && (
            <p
              style={{
                margin:     '0 0 12px',
                fontFamily: '"Jost", system-ui, sans-serif',
                fontSize:   '13px',
                color:      C.textSec,
              }}
            >
              {projeto.nome_cliente}
            </p>
          )}

          {/* Info row: valor · prioridade · prazo */}
          <div
            style={{
              display:  'flex',
              gap:      '8px',
              flexWrap: 'wrap',
            }}
          >
            {/* Valor */}
            {valorFmt && (
              <span
                style={{
                  display:      'inline-flex',
                  alignItems:   'center',
                  gap:          '4px',
                  fontFamily:   '"Jost", system-ui, sans-serif',
                  fontSize:     '12px',
                  fontWeight:   '600',
                  color:        C.primary,
                  background:   C.primarySoft,
                  border:       `1px solid rgba(201,169,110,0.25)`,
                  borderRadius: '5px',
                  padding:      '3px 8px',
                }}
              >
                {valorFmt}
              </span>
            )}

            {/* Prioridade */}
            <span
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                gap:          '4px',
                fontFamily:   '"Jost", system-ui, sans-serif',
                fontSize:     '12px',
                fontWeight:   '600',
                color:        prioridade.cor,
                background:   `${prioridade.cor}18`,
                border:       `1px solid ${prioridade.cor}40`,
                borderRadius: '5px',
                padding:      '3px 8px',
              }}
            >
              {prioridade.emoji} {prioridade.label}
            </span>

            {/* Prazo */}
            {projeto.prazo_entrega && (
              <span
                style={{
                  display:      'inline-flex',
                  alignItems:   'center',
                  gap:          '4px',
                  fontFamily:   '"Jost", system-ui, sans-serif',
                  fontSize:     '12px',
                  color:        C.textSec,
                  background:   C.surfaceStrong,
                  border:       `1px solid ${C.border}`,
                  borderRadius: '5px',
                  padding:      '3px 8px',
                }}
              >
                📅 {formatarData(projeto.prazo_entrega)}
              </span>
            )}

            {/* Etapa atual */}
            <span
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                fontFamily:   '"Jost", system-ui, sans-serif',
                fontSize:     '11px',
                fontWeight:   '600',
                letterSpacing:'0.03em',
                textTransform:'uppercase',
                color:        C.info,
                background:   `${C.info}14`,
                border:       `1px solid ${C.info}35`,
                borderRadius: '5px',
                padding:      '3px 8px',
              }}
            >
              {ETAPA_LABELS[etapaAtual] ?? etapaAtual}
            </span>
          </div>

          {/* Arquiteto + Vendedora */}
          {(projeto.arquiteto_nome || projeto.vendedora_nome) && (
            <div
              style={{
                display:    'flex',
                gap:        '16px',
                flexWrap:   'wrap',
                marginTop:  '10px',
                paddingTop: '10px',
                borderTop:  `1px solid ${C.border}`,
                fontFamily: '"Jost", system-ui, sans-serif',
                fontSize:   '12px',
              }}
            >
              {projeto.arquiteto_nome && (
                <span style={{ color: C.textSec }}>
                  <span style={{ color: C.textMuted, marginRight: 4 }}>Arquiteto</span>
                  {projeto.arquiteto_nome}
                </span>
              )}
              {projeto.vendedora_nome && (
                <span style={{ color: '#7FB069' }}>
                  <span style={{ color: C.textMuted, marginRight: 4 }}>Vendedora</span>
                  {projeto.vendedora_nome}
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── CONTEÚDO COM SCROLL ── */}
        <div
          style={{
            flex:       1,
            overflowY:  'auto',
            padding:    '0 0 8px',
          }}
        >

          {/* ─── SEÇÃO: ITENS ─────────────────────────────────────────── */}
          <section style={{ padding: '16px 20px 0' }}>
            <h3
              style={{
                fontFamily:    '"Jost", system-ui, sans-serif',
                fontSize:      '10px',
                fontWeight:    '700',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color:         C.textMuted,
                margin:        '0 0 10px',
              }}
            >
              Itens {itens.length > 0 && `(${itens.length})`}
            </h3>

            {itens.length === 0 ? (
              <p
                style={{
                  fontFamily: '"Jost", system-ui, sans-serif',
                  fontSize:   '12px',
                  color:      C.textMuted,
                  margin:     0,
                  fontStyle:  'italic',
                }}
              >
                Nenhum item cadastrado
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {itens.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    etapaAtual={etapaAtual}
                    projetoId={projeto.id}
                    onItemChegou={onItemChegou}
                    onItemConfeccionado={onItemConfeccionado}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ─── SEÇÃO: HISTÓRICO ─────────────────────────────────────── */}
          <section style={{ padding: '20px 20px 0' }}>
            <h3
              style={{
                fontFamily:    '"Jost", system-ui, sans-serif',
                fontSize:      '10px',
                fontWeight:    '700',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color:         C.textMuted,
                margin:        '0 0 4px',
              }}
            >
              Histórico
            </h3>

            {historico.length === 0 ? (
              <p
                style={{
                  fontFamily: '"Jost", system-ui, sans-serif',
                  fontSize:   '12px',
                  color:      C.textMuted,
                  margin:     0,
                  fontStyle:  'italic',
                  paddingTop: '6px',
                }}
              >
                Sem registros
              </p>
            ) : (
              <div>
                {historico.map((entry, i) => (
                  <HistoricoItem key={entry.id ?? i} entry={entry} />
                ))}
              </div>
            )}
          </section>

        </div>

        {/* ── RODAPÉ DE AÇÕES ── */}
        <div
          style={{
            borderTop:    `1px solid ${C.border}`,
            padding:      '14px 20px',
            flexShrink:   0,
            background:   C.surface,
            display:      'flex',
            flexDirection:'column',
            gap:          '10px',
          }}
        >
          {/* Botões principais */}
          <div style={{ display: 'flex', gap: '8px' }}>

            {/* Avançar Etapa */}
            {podeAvancar && (
              <button
                onClick={handleAvancar}
                disabled={salvandoAvanc}
                style={{
                  flex:         1,
                  padding:      '9px 16px',
                  fontFamily:   '"Jost", system-ui, sans-serif',
                  fontSize:     '13px',
                  fontWeight:   '600',
                  color:        '#0E0D0B',
                  background:   salvandoAvanc
                    ? 'rgba(201,169,110,0.55)'
                    : 'linear-gradient(135deg, #C9A96E 0%, #D4B87A 100%)',
                  border:       'none',
                  borderRadius: '7px',
                  cursor:       salvandoAvanc ? 'not-allowed' : 'pointer',
                  display:      'flex',
                  alignItems:   'center',
                  justifyContent:'center',
                  gap:          '6px',
                  transition:   'opacity 0.15s ease',
                  opacity:      salvandoAvanc ? 0.7 : 1,
                }}
              >
                {salvandoAvanc ? (
                  'Avançando…'
                ) : (
                  <>
                    Avançar para{' '}
                    <span style={{ fontWeight: 700 }}>
                      {ETAPA_LABELS[proximaEtapa]}
                    </span>{' '}
                    ▶
                  </>
                )}
              </button>
            )}

            {/* Confirmar Agendamento */}
            {podeConfirmarAgend && (
              <button
                onClick={handleConfirmarAgendamento}
                disabled={salvandoAgend}
                style={{
                  flex:         1,
                  padding:      '9px 16px',
                  fontFamily:   '"Jost", system-ui, sans-serif',
                  fontSize:     '13px',
                  fontWeight:   '600',
                  color:        '#0E0D0B',
                  background:   salvandoAgend
                    ? `${C.success}88`
                    : `linear-gradient(135deg, ${C.success} 0%, #8FBF78 100%)`,
                  border:       'none',
                  borderRadius: '7px',
                  cursor:       salvandoAgend ? 'not-allowed' : 'pointer',
                  display:      'flex',
                  alignItems:   'center',
                  justifyContent:'center',
                  gap:          '6px',
                  opacity:      salvandoAgend ? 0.7 : 1,
                }}
              >
                {salvandoAgend ? 'Confirmando…' : '📅 Confirmar Agendamento'}
              </button>
            )}

            {/* Reencaminhar */}
            {podeReencaminhar && !reencAberto && (
              <button
                onClick={() => { setReencAberto(true); setReencEtapa(etapasAnteriores[etapasAnteriores.length - 1] ?? ''); }}
                style={{
                  padding:      '9px 14px',
                  fontFamily:   '"Jost", system-ui, sans-serif',
                  fontSize:     '13px',
                  fontWeight:   '600',
                  color:        C.warning,
                  background:   `${C.warning}14`,
                  border:       `1px solid ${C.warning}40`,
                  borderRadius: '7px',
                  cursor:       'pointer',
                  whiteSpace:   'nowrap',
                }}
              >
                Reencaminhar ↩
              </button>
            )}
          </div>

          {/* Painel inline de reencaminhamento */}
          {podeReencaminhar && reencAberto && (
            <div
              style={{
                background:   C.surfaceStrong,
                border:       `1px solid ${C.border}`,
                borderRadius: '8px',
                padding:      '12px',
                display:      'flex',
                flexDirection:'column',
                gap:          '10px',
              }}
            >
              <div
                style={{
                  display:    'flex',
                  alignItems: 'center',
                  justifyContent:'space-between',
                }}
              >
                <span
                  style={{
                    fontFamily:    '"Jost", system-ui, sans-serif',
                    fontSize:      '11px',
                    fontWeight:    '700',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color:         C.warning,
                  }}
                >
                  Reencaminhar para etapa anterior
                </span>
                <button
                  onClick={() => { setReencAberto(false); setReencEtapa(''); setReencMotivo(''); }}
                  style={{
                    background:   'transparent',
                    border:       'none',
                    color:        C.textMuted,
                    cursor:       'pointer',
                    fontSize:     '14px',
                    lineHeight:   1,
                    padding:      '2px 4px',
                  }}
                >
                  ×
                </button>
              </div>

              {/* Select de etapas anteriores */}
              <select
                value={reencEtapa}
                onChange={(e) => setReencEtapa(e.target.value)}
                style={{
                  background:   C.bg,
                  border:       `1px solid ${C.border}`,
                  borderRadius: '6px',
                  padding:      '7px 10px',
                  color:        reencEtapa ? C.text : C.textMuted,
                  fontFamily:   '"Jost", system-ui, sans-serif',
                  fontSize:     '13px',
                  outline:      'none',
                  cursor:       'pointer',
                }}
              >
                <option value="" disabled>Selecione a etapa…</option>
                {etapasAnteriores.map((e) => (
                  <option key={e} value={e}>
                    {ETAPA_LABELS[e] ?? e}
                  </option>
                ))}
              </select>

              {/* Motivo obrigatório */}
              <textarea
                value={reencMotivo}
                onChange={(e) => setReencMotivo(e.target.value)}
                placeholder="Motivo do reencaminhamento (obrigatório)"
                rows={3}
                style={{
                  background:   C.bg,
                  border:       `1px solid ${reencMotivo.trim() ? C.border : `${C.danger}50`}`,
                  borderRadius: '6px',
                  padding:      '8px 10px',
                  color:        C.text,
                  fontFamily:   '"Jost", system-ui, sans-serif',
                  fontSize:     '12px',
                  resize:       'vertical',
                  outline:      'none',
                }}
              />

              {/* Botões de confirmação */}
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={handleReencaminhar}
                  disabled={!reencEtapa || !reencMotivo.trim() || salvandoReenc}
                  style={{
                    flex:         1,
                    padding:      '8px 12px',
                    fontFamily:   '"Jost", system-ui, sans-serif',
                    fontSize:     '12px',
                    fontWeight:   '700',
                    color:        '#0E0D0B',
                    background:   (!reencEtapa || !reencMotivo.trim() || salvandoReenc)
                      ? `${C.warning}55`
                      : C.warning,
                    border:       'none',
                    borderRadius: '6px',
                    cursor:       (!reencEtapa || !reencMotivo.trim() || salvandoReenc)
                      ? 'not-allowed'
                      : 'pointer',
                    opacity:      (!reencEtapa || !reencMotivo.trim() || salvandoReenc) ? 0.65 : 1,
                  }}
                >
                  {salvandoReenc ? 'Salvando…' : 'Confirmar Reencaminhamento'}
                </button>
                <button
                  onClick={() => { setReencAberto(false); setReencEtapa(''); setReencMotivo(''); }}
                  style={{
                    padding:      '8px 12px',
                    fontFamily:   '"Jost", system-ui, sans-serif',
                    fontSize:     '12px',
                    color:        C.textMuted,
                    background:   'transparent',
                    border:       `1px solid ${C.border}`,
                    borderRadius: '6px',
                    cursor:       'pointer',
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </>
  );

  return createPortal(conteudo, document.body);
}
