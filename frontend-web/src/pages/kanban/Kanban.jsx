import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import KanbanCard from './KanbanCard';
import KanbanDrawer from './KanbanDrawer';
import { pipelineService } from '../../services/pipelineService';
import useAuth from '../../hooks/useAuth';
import './Kanban.css';

// ── Etapas ────────────────────────────────────────────────────────────────────

const ETAPAS = [
  { slug: 'orcamento',              label: 'Orçamento',         cor: '#6B9AB8' },
  { slug: 'venda',                  label: 'Venda',              cor: '#C9A96E' },
  { slug: 'conferencia_consultora', label: 'Conf. Consultora',   cor: '#D4A843' },
  { slug: 'conferencia_tecnica',    label: 'Conf. Técnica',      cor: '#D4A843' },
  { slug: 'verificacao_admin',      label: 'Verificação Admin',  cor: '#C0614A' },
  { slug: 'compras',                label: 'Compras',            cor: '#9A9080' },
  { slug: 'confeccao',              label: 'Confecção',          cor: '#C9A96E' },
  { slug: 'pre_agendado',           label: 'Pré-agendado',       cor: '#7FB069' },
  { slug: 'agendado',               label: 'Agendado ✓',         cor: '#7FB069' },
];

// ── FiltrosPanel ──────────────────────────────────────────────────────────────

function FiltrosPanel({ filtros, onChange }) {
  return (
    <div className="kanban-filtros">
      <select
        value={filtros.prioridade ?? ''}
        onChange={e => onChange(f => ({ ...f, prioridade: e.target.value || undefined }))}
      >
        <option value="">Todas as prioridades</option>
        <option value="urgente">🔴 Urgente</option>
        <option value="alta">🟠 Alta</option>
        <option value="normal">🟡 Normal</option>
        <option value="baixa">🟢 Baixa</option>
      </select>

      <select
        value={filtros.tipo ?? ''}
        onChange={e => onChange(f => ({ ...f, tipo: e.target.value || undefined }))}
      >
        <option value="">Todos os tipos</option>
        <option value="confeccao">⚙ Com Confecção</option>
        <option value="sob_demanda">📦 Sob Demanda</option>
      </select>

      <select
        value={filtros.prazo ?? ''}
        onChange={e => onChange(f => ({ ...f, prazo: e.target.value || undefined }))}
      >
        <option value="">Todos os prazos</option>
        <option value="atrasado">🔴 Atrasados</option>
        <option value="hoje">📅 Vence hoje</option>
        <option value="semana">📆 Esta semana</option>
      </select>

      <button className="kanban-btn-clear" onClick={() => onChange({})}>
        ✕ Limpar
      </button>
    </div>
  );
}

// ── Kanban (componente principal) ─────────────────────────────────────────────

export default function Kanban() {
  const { user } = useAuth();

  const [projetos, setProjetos]             = useState([]);
  const [loading, setLoading]               = useState(true);
  const [erro, setErro]                     = useState(null);
  const [drawerProjeto, setDrawerProjeto]   = useState(null);
  const [drawerLoading, setDrawerLoading]   = useState(false);
  const [filtros, setFiltros]               = useState({});
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [dragging, setDragging]             = useState(null);
  const [dragOver, setDragOver]             = useState(null);

  // ── Carregar projetos ──────────────────────────────────────────────────────

  const carregarKanban = useCallback(async () => {
    try {
      setLoading(true);
      setErro(null);
      const data = await pipelineService.listar(filtros);
      setProjetos(data.projetos ?? []);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, [filtros]);

  useEffect(() => { carregarKanban(); }, [carregarKanban]);

  // ── Drawer ─────────────────────────────────────────────────────────────────

  async function abrirDrawer(projeto) {
    try {
      setDrawerLoading(true);
      const data = await pipelineService.obter(projeto.id);
      setDrawerProjeto(data.projeto);
    } catch {
      // ignora erros silenciosamente
    } finally {
      setDrawerLoading(false);
    }
  }

  async function handleAvancar(projetoId, novaEtapa) {
    await pipelineService.avancar(projetoId, novaEtapa);
    setDrawerProjeto(null);
    carregarKanban();
  }

  async function handleReencaminhar(projetoId, etapa, motivo) {
    await pipelineService.reencaminhar(projetoId, etapa, motivo);
    setDrawerProjeto(null);
    carregarKanban();
  }

  async function handleItemChegou(projetoId, itemId, quantidade, obs) {
    await pipelineService.itemChegou(projetoId, itemId, quantidade, obs);
    const data = await pipelineService.obter(projetoId);
    setDrawerProjeto(data.projeto);
    carregarKanban();
  }

  async function handleItemConfeccionado(projetoId, itemId) {
    await pipelineService.itemConfeccionado(projetoId, itemId);
    const data = await pipelineService.obter(projetoId);
    setDrawerProjeto(data.projeto);
    carregarKanban();
  }

  async function handleConfirmarAgendamento(projetoId) {
    await pipelineService.confirmarAgendamento(projetoId);
    setDrawerProjeto(null);
    carregarKanban();
  }

  // ── Drag & Drop ────────────────────────────────────────────────────────────

  function handleDragStart(e, projeto) {
    setDragging(projeto.id);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e, etapaSlug) {
    e.preventDefault();
    setDragOver(etapaSlug);
  }

  function handleDrop(e, etapaAlvo) {
    e.preventDefault();
    if (!dragging || dragging === etapaAlvo) return;
    const projeto = projetos.find(p => p.id === dragging);
    if (!projeto || projeto.etapa === etapaAlvo) {
      setDragging(null);
      setDragOver(null);
      return;
    }
    // Atualização otimista
    setProjetos(prev =>
      prev.map(p => p.id === dragging ? { ...p, etapa: etapaAlvo } : p)
    );
    pipelineService.avancar(dragging, etapaAlvo).catch(() => carregarKanban());
    setDragging(null);
    setDragOver(null);
  }

  function handleDragEnd() {
    setDragging(null);
    setDragOver(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="kanban-page">

      {/* Header */}
      <div className="kanban-header">
        <h1 className="kanban-title">Fluxo de Vendas</h1>
        <div className="kanban-header-actions">
          <button
            onClick={() => setFiltrosAbertos(f => !f)}
            className={`kanban-btn-filter${filtrosAbertos ? ' kanban-btn-filter--active' : ''}`}
          >
            Filtros {filtrosAbertos ? '▴' : '▾'}
          </button>
          {user?.permissoes?.includes('KANBAN_CONFIG') && (
            <Link to="/kanban/config" className="kanban-btn-config" title="Configurações do Kanban">
              ⚙
            </Link>
          )}
        </div>
      </div>

      {/* Filtros */}
      {filtrosAbertos && (
        <FiltrosPanel filtros={filtros} onChange={setFiltros} />
      )}

      {/* Board */}
      {loading ? (
        <div className="kanban-loading">
          <span className="kanban-loading-spinner" />
          Carregando projetos…
        </div>
      ) : erro ? (
        <div className="kanban-erro">
          <span className="kanban-erro-icon">⚠</span>
          {erro}
          <button className="kanban-btn-retry" onClick={carregarKanban}>
            Tentar novamente
          </button>
        </div>
      ) : (
        <div className="kanban-board">
          {ETAPAS.map(etapa => {
            const cards = projetos.filter(p => p.etapa === etapa.slug);
            const isDragOver = dragOver === etapa.slug;

            return (
              <div
                key={etapa.slug}
                className={`kanban-col${isDragOver ? ' kanban-col--dragover' : ''}`}
                onDragOver={e => handleDragOver(e, etapa.slug)}
                onDrop={e => handleDrop(e, etapa.slug)}
                onDragLeave={() => setDragOver(null)}
              >
                {/* Cabeçalho da coluna */}
                <div className="kanban-col-header">
                  <span
                    className="kanban-col-dot"
                    style={{ background: etapa.cor }}
                  />
                  <span className="kanban-col-label">{etapa.label}</span>
                  <span className="kanban-col-count">{cards.length}</span>
                </div>

                {/* Cards */}
                <div className="kanban-col-cards">
                  {cards.map(projeto => (
                    <KanbanCard
                      key={projeto.id}
                      projeto={projeto}
                      onClick={() => abrirDrawer(projeto)}
                      onDragStart={e => handleDragStart(e, projeto)}
                      onDragEnd={handleDragEnd}
                      isDragging={dragging === projeto.id}
                    />
                  ))}
                  {cards.length === 0 && (
                    <div className="kanban-col-empty">Nenhum projeto</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Overlay de loading do drawer */}
      {drawerLoading && (
        <div className="kanban-drawer-overlay">
          <span className="kanban-loading-spinner kanban-loading-spinner--lg" />
        </div>
      )}

      {/* Drawer de detalhe */}
      {drawerProjeto && (
        <KanbanDrawer
          projeto={drawerProjeto}
          etapaAtual={drawerProjeto.etapa}
          user={user}
          onClose={() => setDrawerProjeto(null)}
          onAvancar={handleAvancar}
          onReencaminhar={handleReencaminhar}
          onItemChegou={handleItemChegou}
          onItemConfeccionado={handleItemConfeccionado}
          onConfirmarAgendamento={handleConfirmarAgendamento}
        />
      )}
    </div>
  );
}
