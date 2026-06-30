// frontend-web/src/pages/pedidos/FichaConferenciaConsultorasPersiana.jsx
import { useState } from "react";
import { FaUser, FaTag, FaUserTie, FaHome, FaGift } from "react-icons/fa";
import { api } from "../../services/api";
import { KEYWORD_MODELS } from "./importKeywordConfig";
import "./OrdemServicoModal.css";

const PERSIANA_CONFIG = KEYWORD_MODELS.find((k) => k.tipo === "persiana");

const ACESSORIOS_OPCOES = [
  "Transpasse",
  "Lado a Lado",
  "Suporte Inter.",
  "Trilho Heike",
  "Bando Box",
  "Guias Laterais",
];

const VAZIO = {
  modelo: "", tubo: "", bando: "",
  tecido: "", largMax: "",
  modeloControle: "", modeloMotor: "",
  acessorios: [],
  acionamento: "",
  qtdMotor: "", ordem: "",
};

export default function FichaConferenciaConsultorasPersiana({ osData, onSalvar, onVoltar }) {
  const [dados, setDados] = useState(() => ({
    ...VAZIO,
    ...(osData.dados_conferencia_consultoras || {}),
  }));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const modeloCfg = PERSIANA_CONFIG?.modelos.find((m) => m.nome === dados.modelo);
  const opcoesBandoCaixa = modeloCfg
    ? [...(modeloCfg.caixas || []), ...(modeloCfg.bandos || [])]
    : [];

  function setCampo(chave, valor) {
    setDados((prev) => ({ ...prev, [chave]: valor }));
  }

  function setModelo(novoModelo) {
    setDados((prev) => ({ ...prev, modelo: novoModelo, tubo: "", bando: "" }));
  }

  function toggleAcessorio(nome) {
    setDados((prev) => {
      const atual = prev.acessorios || [];
      return {
        ...prev,
        acessorios: atual.includes(nome)
          ? atual.filter((a) => a !== nome)
          : [...atual, nome],
      };
    });
  }

  const podeSalvar =
    !!dados.modelo &&
    !!dados.tubo &&
    !!dados.acionamento &&
    (dados.acionamento !== "motorizado" || !!dados.qtdMotor);

  async function salvar() {
    setErro("");
    setSucesso("");
    if (!dados.modelo || !dados.tubo) return setErro("Modelo e tubo da persiana são obrigatórios.");
    if (!dados.acionamento) return setErro("Acionamento (manual/motorizado) é obrigatório.");
    if (dados.acionamento === "motorizado" && !dados.qtdMotor)
      return setErro("Quantidade de motor é obrigatória para persiana motorizada.");

    setSalvando(true);
    try {
      await api.put(`/os/${osData.id}/conferencia-consultoras`, dados);
      setSucesso("Ficha de Conferência Consultoras salva com sucesso!");
      setTimeout(onSalvar, 1200);
    } catch (err) {
      setErro(err.message || "Erro ao salvar ficha.");
    } finally {
      setSalvando(false);
    }
  }

  const pedidoNumero = osData.pedido_numero || osData.pedido_id;

  const selectStyle = {
    padding: "6px 10px",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md, 6px)",
    background: "var(--color-surface)",
    color: "var(--color-text)",
    fontSize: 13,
    width: "100%",
  };

  return (
    <div className="ek-page os-page">
      <div className="os-page-header os-page-header-flat">
        <div className="os-page-header-left">
          <button className="os-back-btn" onClick={onVoltar}>← Voltar</button>
          <h1 className="os-page-title">Ficha de Conferência Consultoras — Persiana</h1>
        </div>
        <div className="os-page-header-right">
          <button className="os-btn os-btn-secondary" onClick={onVoltar} disabled={salvando}>
            Cancelar
          </button>
          <button
            className="os-btn os-btn-primary"
            onClick={salvar}
            disabled={salvando || !podeSalvar}
          >
            {salvando ? "Salvando..." : "✓ Salvar Ficha de Conferência Consultoras"}
          </button>
        </div>
      </div>

      {erro && (
        <div className="os-alert os-alert-danger" style={{ margin: "0 0 16px" }}>{erro}</div>
      )}
      {sucesso && (
        <div className="os-alert os-alert-success" style={{ margin: "0 0 16px" }}>{sucesso}</div>
      )}

      <div className="os-page-body">
        <div className="os-info-bar">
          <div className="os-info-row">
            <div className="os-info-item os-info-item-grow">
              <span className="os-info-label"><FaUser /> Cliente</span>
              <span className="os-info-value">{osData.cliente_nome || "—"}</span>
            </div>
            <div className="os-info-item">
              <span className="os-info-label"><FaTag /> Pedido</span>
              <span className="os-info-value tag-pedido">{pedidoNumero}</span>
            </div>
            <div className="os-info-item">
              <span className="os-info-label"><FaUserTie /> Vendedor</span>
              <span className="os-info-value">{osData.consultor_nome || "—"}</span>
            </div>
          </div>
          <div className="os-info-row">
            <div className="os-info-item">
              <span className="os-info-label"><FaHome /> Ambiente</span>
              <span className="os-info-value highlight-text">{osData.item_ambiente || "—"}</span>
            </div>
            <div className="os-info-item os-info-item-grow">
              <span className="os-info-label"><FaGift /> Produto</span>
              <span className="os-info-value">{osData.item_descricao || "—"}</span>
            </div>
          </div>
        </div>

        <div className="os-form-section">
          <div className="os-section-title mandatory-title">Modelo / Tubo / Bandô (Obrigatório)</div>
          <div className="os-grid-3">
            <div className="os-field">
              <label>Modelo</label>
              <select
                value={dados.modelo}
                onChange={(e) => setModelo(e.target.value)}
                style={selectStyle}
                className="input-highlight"
              >
                <option value="">— selecionar —</option>
                {PERSIANA_CONFIG?.modelos.map((m) => (
                  <option key={m.nome} value={m.nome}>{m.nome}</option>
                ))}
              </select>
            </div>

            <div className="os-field">
              <label>Tubo</label>
              <select
                value={dados.tubo}
                onChange={(e) => setCampo("tubo", e.target.value)}
                disabled={!modeloCfg}
                style={{ ...selectStyle, opacity: modeloCfg ? 1 : 0.5 }}
                className="input-highlight"
              >
                <option value="">— selecionar —</option>
                {(modeloCfg?.tubos || []).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="os-field">
              <label>
                Bandô / Caixa{" "}
                <span style={{ fontWeight: 400 }}>(opcional)</span>
              </label>
              <select
                value={dados.bando}
                onChange={(e) => setCampo("bando", e.target.value)}
                disabled={!modeloCfg}
                style={{ ...selectStyle, opacity: modeloCfg ? 1 : 0.5 }}
              >
                <option value="">— Nenhum —</option>
                {opcoesBandoCaixa.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="os-form-section">
          <div className="os-section-title">Tecido e Controle</div>
          <div className="os-grid-2">
            <div className="os-field">
              <label>Tecido</label>
              <input
                type="text"
                value={dados.tecido}
                onChange={(e) => setCampo("tecido", e.target.value)}
                className="os-input"
                placeholder="Ex: Drumis White"
              />
            </div>
            <div className="os-field">
              <label>Larg Max</label>
              <input
                type="text"
                value={dados.largMax}
                onChange={(e) => setCampo("largMax", e.target.value)}
                className="os-input"
                placeholder="Ex: 2,50m"
              />
            </div>
          </div>
          <div className="os-grid-2">
            <div className="os-field">
              <label>Modelo Controle</label>
              <input
                type="text"
                value={dados.modeloControle}
                onChange={(e) => setCampo("modeloControle", e.target.value)}
                className="os-input"
              />
            </div>
            <div className="os-field">
              <label>Modelo Motor</label>
              <input
                type="text"
                value={dados.modeloMotor}
                onChange={(e) => setCampo("modeloMotor", e.target.value)}
                className="os-input"
              />
            </div>
          </div>
        </div>

        <div className="os-form-section">
          <div className="os-section-title">Acessórios</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {ACESSORIOS_OPCOES.map((nome) => (
              <label
                key={nome}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={(dados.acessorios || []).includes(nome)}
                  onChange={() => toggleAcessorio(nome)}
                />
                {nome}
              </label>
            ))}
          </div>
        </div>

        <div className="os-form-section">
          <div className="os-section-title mandatory-title">Acionamento (Obrigatório)</div>
          <div style={{ display: "flex", gap: 24, marginBottom: 12 }}>
            {["manual", "motorizado"].map((op) => (
              <label
                key={op}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}
              >
                <input
                  type="radio"
                  name="acionamento"
                  value={op}
                  checked={dados.acionamento === op}
                  onChange={() => setCampo("acionamento", op)}
                  className="input-highlight"
                />
                {op.charAt(0).toUpperCase() + op.slice(1)}
              </label>
            ))}
          </div>

          {dados.acionamento === "motorizado" && (
            <div className="os-grid-2">
              <div className="os-field">
                <label>
                  Qtd Motor{" "}
                  <span style={{ color: "var(--color-danger, red)" }}>*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  value={dados.qtdMotor}
                  onChange={(e) => setCampo("qtdMotor", e.target.value)}
                  className="os-input input-highlight"
                  placeholder="Ex: 1"
                />
              </div>
              <div className="os-field">
                <label>Ordem</label>
                <input
                  type="text"
                  value={dados.ordem}
                  onChange={(e) => setCampo("ordem", e.target.value)}
                  className="os-input"
                  placeholder="Ex: 173309"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
