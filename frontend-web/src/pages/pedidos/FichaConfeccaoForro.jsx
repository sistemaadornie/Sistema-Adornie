import { useMemo, useState } from "react";
import { api } from "../../services/api";
import { calcularQuantForro } from "../../utils/calculoCortina";
import "./OrdemServicoModal.css";

const VAZIO = {
  tecidoForro: "", tecidoTipo: "", franzimento: "", forroCosturado: "",
  larguraForro: "", alturaBarraForro: "",
  espacador: "", larguraTrilho: "", tipoWave: "", abertura: "", alturaCortina: "",
};

function paraNumero(valor) {
  const n = parseFloat(String(valor ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export default function FichaConfeccaoForro({ osData, onSalvar, onVoltar }) {
  const [dados, setDados] = useState({ ...VAZIO, ...(osData.dados_confeccao || {}) });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  function setCampo(chave, valor) {
    setDados((prev) => ({ ...prev, [chave]: valor }));
  }

  const quantForro = useMemo(() => {
    return calcularQuantForro({
      abertura: dados.abertura,
      espacador: dados.espacador,
      larguraTrilho: paraNumero(dados.larguraTrilho),
      tipoWave: dados.tipoWave,
      tecidoForro: dados.tecidoForro,
      larguraForro: paraNumero(dados.larguraForro),
      alturaCortina: paraNumero(dados.alturaCortina),
      alturaBarraForro: paraNumero(dados.alturaBarraForro),
      forroCosturado: dados.forroCosturado,
      franzimento: paraNumero(dados.franzimento),
    });
  }, [dados]);

  async function salvar() {
    setErro("");
    setSucesso("");

    if (!dados.tecidoForro?.trim()) return setErro("Tecido do forro é obrigatório.");
    if (!dados.larguraForro || paraNumero(dados.larguraForro) <= 0) {
      return setErro("Largura do forro é obrigatória e deve ser maior que zero.");
    }
    if (!dados.forroCosturado) return setErro('Campo "Forro costurado" é obrigatório.');

    setSalvando(true);
    try {
      await api.put(`/os/${osData.id}/confeccao`, dados);
      setSucesso("Ficha de Confecção salva com sucesso!");
      setTimeout(onSalvar, 1200);
    } catch (err) {
      setErro(err.message || "Erro ao salvar ficha de confecção.");
    } finally {
      setSalvando(false);
    }
  }

  const pedidoNumero = osData.pedido_numero || osData.pedido_id;

  return (
    <div className="ek-page os-page">
      <div className="os-page-header">
        <div className="os-page-header-left">
          <button className="os-back-btn" onClick={onVoltar}>← Voltar</button>
          <div>
            <h1 className="os-page-title">Ficha de Confecção — Forro</h1>
            <p className="os-page-subtitle">
              {osData.cliente_nome && <span>{osData.cliente_nome}</span>}
              {pedidoNumero && <span className="os-v-value tag-pedido" style={{ marginLeft: 8 }}>{pedidoNumero}</span>}
              {osData.item_ambiente && <span style={{ marginLeft: 8, color: "var(--color-text-muted)" }}>· {osData.item_ambiente}</span>}
            </p>
          </div>
        </div>
        <div className="os-page-header-right">
          <button className="os-btn os-btn-secondary" onClick={onVoltar} disabled={salvando}>Cancelar</button>
          <button className="os-btn os-btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : "✓ Salvar Ficha de Confecção"}
          </button>
        </div>
      </div>

      {erro && <div className="os-alert os-alert-danger" style={{ margin: "0 0 16px" }}>{erro}</div>}
      {sucesso && <div className="os-alert os-alert-success" style={{ margin: "0 0 16px" }}>{sucesso}</div>}

      <div className="os-page-body">
        <div className="os-layout-cols">
          <div className="os-col-left">
            <div className="os-section-title">Dados do Pedido</div>
            <div className="os-card-visual">
              <div className="os-visual-field"><span className="os-v-label">Cliente</span><span className="os-v-value">{osData.cliente_nome || "—"}</span></div>
              <div className="os-visual-field"><span className="os-v-label">Pedido</span><span className="os-v-value tag-pedido">{pedidoNumero}</span></div>
              <div className="os-visual-field"><span className="os-v-label">Ambiente</span><span className="os-v-value highlight-text">{osData.item_ambiente || "—"}</span></div>
              <div className="os-visual-field"><span className="os-v-label">Item</span><span className="os-v-value">{osData.item_descricao || "—"}</span></div>
            </div>

            <div className="os-form-section">
              <div className="os-section-title">Cálculo (atualiza ao digitar)</div>
              <div className="os-field"><label>Quant. forro</label><div className="os-v-value spec-box">{quantForro || "—"}</div></div>
            </div>
          </div>

          <div className="os-col-right-form">
            <div className="os-form-section">
              <div className="os-section-title mandatory-title">Especificação do Forro (Obrigatório)</div>
              <div className="os-grid-2">
                <div className="os-field">
                  <label>Tecido do forro</label>
                  <input type="text" placeholder="Nome/código do tecido" value={dados.tecidoForro} onChange={(e) => setCampo("tecidoForro", e.target.value)} className="input-highlight" />
                </div>
                <div className="os-field">
                  <label>Tipo de tecido</label>
                  <select value={dados.tecidoTipo} onChange={(e) => setCampo("tecidoTipo", e.target.value)}>
                    <option value="">— Selecione —</option>
                    <option value="Microfibra">Microfibra</option>
                    <option value="Blackout">Blackout</option>
                  </select>
                </div>
              </div>

              <div className="os-grid-2">
                <div className="os-field">
                  <label>Forro costurado</label>
                  <select value={dados.forroCosturado} onChange={(e) => setCampo("forroCosturado", e.target.value)} className="input-highlight">
                    <option value="">— Selecione —</option>
                    <option value="JUNTO">Junto</option>
                    <option value="SEPARADO">Separado</option>
                  </select>
                </div>
                <div className="os-field">
                  <label>Franzimento</label>
                  <input type="text" placeholder="Só se SEPARADO" value={dados.franzimento} onChange={(e) => setCampo("franzimento", e.target.value)} disabled={dados.forroCosturado !== "SEPARADO"} />
                </div>
              </div>

              <div className="os-grid-2">
                <div className="os-field">
                  <label>Largura do forro (m)</label>
                  <input type="text" placeholder="Ex: 3,00" value={dados.larguraForro} onChange={(e) => setCampo("larguraForro", e.target.value)} className="input-highlight" />
                </div>
                <div className="os-field">
                  <label>Altura barra do forro (m)</label>
                  <input type="text" placeholder="0" value={dados.alturaBarraForro} onChange={(e) => setCampo("alturaBarraForro", e.target.value)} />
                </div>
              </div>
            </div>

            <div className="os-form-section">
              <div className="os-section-title">Referência da Cortina (para o cálculo)</div>
              <div className="os-grid-3">
                <div className="os-field">
                  <label>Espaçador</label>
                  <select value={dados.espacador} onChange={(e) => setCampo("espacador", e.target.value)}>
                    <option value="">— Selecione —</option>
                    <option value="3,6">3,6</option>
                    <option value="5,00">5,00</option>
                    <option value="7,00">7,00</option>
                  </select>
                </div>
                <div className="os-field">
                  <label>Tipo wave</label>
                  <select value={dados.tipoWave} onChange={(e) => setCampo("tipoWave", e.target.value)}>
                    <option value="">— Selecione —</option>
                    <option value="P">P</option>
                    <option value="M">M</option>
                    <option value="G">G</option>
                  </select>
                </div>
                <div className="os-field">
                  <label>Abertura</label>
                  <select value={dados.abertura} onChange={(e) => setCampo("abertura", e.target.value)}>
                    <option value="">— Selecione —</option>
                    <option value="COM ABERTURA">Com abertura</option>
                    <option value="SEM ABERTURA">Sem abertura</option>
                  </select>
                </div>
              </div>
              <div className="os-grid-2">
                <div className="os-field">
                  <label>Largura do trilho (m)</label>
                  <input type="text" placeholder="Ex: 4,92" value={dados.larguraTrilho} onChange={(e) => setCampo("larguraTrilho", e.target.value)} />
                </div>
                <div className="os-field">
                  <label>Altura da cortina (m)</label>
                  <input type="text" placeholder="Ex: 2,84" value={dados.alturaCortina} onChange={(e) => setCampo("alturaCortina", e.target.value)} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
