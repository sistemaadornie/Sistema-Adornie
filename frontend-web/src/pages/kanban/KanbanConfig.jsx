import { useState, useEffect } from 'react';
import { pipelineService } from '../../services/pipelineService';
import { useNavigate } from 'react-router-dom';
import './KanbanConfig.css';

export default function KanbanConfig() {
  const navigate = useNavigate();
  const [config, setConfig] = useState({
    prazo_agendamento_dias: 7,
    prazo_confeccao_dias: 14,
    prazo_sob_demanda_dias: 21,
    alertar_dias_antes: 2,
  });
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    pipelineService
      .obterConfig()
      .then((data) => setConfig(data.config || data))
      .catch(() => {
        // Usa valores padrão se houver erro
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSalvar(e) {
    e.preventDefault();
    try {
      setSalvando(true);
      setErro(null);
      await pipelineService.salvarConfig(config);
      setSucesso(true);
      setTimeout(() => setSucesso(false), 3000);
    } catch (err) {
      setErro(err.message || 'Erro ao salvar configurações');
    } finally {
      setSalvando(false);
    }
  }

  function handleChange(campo, valor) {
    const num = parseInt(valor, 10);
    if (!isNaN(num) && num > 0) {
      setConfig((c) => ({ ...c, [campo]: num }));
    }
  }

  function handleVoltar() {
    navigate(-1);
  }

  if (loading) {
    return (
      <div className="kanban-config-page">
        <div className="kanban-config-loading">
          <div className="kanban-config-spinner"></div>
          <p>Carregando configurações...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="kanban-config-page">
      {/* Header com botão voltar */}
      <div className="kanban-config-header">
        <button
          onClick={handleVoltar}
          className="kanban-config-btn-voltar"
          title="Voltar ao Kanban"
        >
          ← Voltar ao Kanban
        </button>
      </div>

      {/* Título */}
      <div className="kanban-config-top">
        <h1 className="kanban-config-title">
          <span className="kanban-config-icon">⚙</span> Configurações de Prazos — Kanban
        </h1>
        <p className="kanban-config-subtitle">
          Defina os prazos padrão usados no fluxo de vendas
        </p>
      </div>

      {/* Mensagens de feedback */}
      {erro && <div className="kanban-config-erro">{erro}</div>}
      {sucesso && (
        <div className="kanban-config-success">✓ Configurações salvas com sucesso!</div>
      )}

      {/* Formulário */}
      <form className="kanban-config-form" onSubmit={handleSalvar}>
        <div className="kanban-config-card">
          {/* Campo 1: Prazo de agendamento */}
          <div className="kanban-config-field">
            <label className="kanban-config-label">Prazo para agendamento (dias)</label>
            <p className="kanban-config-desc">
              Após entrar em Pré-agendado
            </p>
            <input
              type="number"
              min="1"
              max="365"
              value={config.prazo_agendamento_dias}
              onChange={(e) => handleChange('prazo_agendamento_dias', e.target.value)}
              className="kanban-config-input"
            />
          </div>

          {/* Campo 2: Prazo de confecção */}
          <div className="kanban-config-field">
            <label className="kanban-config-label">Prazo de confecção (dias)</label>
            <p className="kanban-config-desc">
              Estimativa padrão quando não informado pelo fornecedor
            </p>
            <input
              type="number"
              min="1"
              max="365"
              value={config.prazo_confeccao_dias}
              onChange={(e) => handleChange('prazo_confeccao_dias', e.target.value)}
              className="kanban-config-input"
            />
          </div>

          {/* Campo 3: Prazo sob demanda */}
          <div className="kanban-config-field">
            <label className="kanban-config-label">Prazo para itens sob demanda (dias)</label>
            <p className="kanban-config-desc">
              Estimativa padrão para recebimento de fornecedores
            </p>
            <input
              type="number"
              min="1"
              max="365"
              value={config.prazo_sob_demanda_dias}
              onChange={(e) => handleChange('prazo_sob_demanda_dias', e.target.value)}
              className="kanban-config-input"
            />
          </div>

          {/* Campo 4: Alertar dias antes */}
          <div className="kanban-config-field kanban-config-field--last">
            <label className="kanban-config-label">Alertar X dias antes do prazo</label>
            <p className="kanban-config-desc">
              Indicador visual quando prazo está se aproximando
            </p>
            <input
              type="number"
              min="1"
              max="30"
              value={config.alertar_dias_antes}
              onChange={(e) => handleChange('alertar_dias_antes', e.target.value)}
              className="kanban-config-input"
            />
          </div>
        </div>

        {/* Botão salvar */}
        <div className="kanban-config-actions">
          <button
            type="submit"
            disabled={salvando}
            className="kanban-config-btn-salvar"
          >
            {salvando ? 'Salvando...' : 'Salvar Configurações'}
          </button>
        </div>
      </form>
    </div>
  );
}
