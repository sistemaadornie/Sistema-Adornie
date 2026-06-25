import { useState } from "react";
import { api } from "../../services/api";
import "./OrdemServicoModal.css";

const VAZIO = {
  feitaPor: "", espacador: "", tipoWave: "", abertura: "", componente: "",
  larguraTrilho: "", larguraTecido: "", nomeTecido: "", vendeuBarraAplicada: "",
  alturaCortina: "", alturaBarra: "", quantTomas: "", tamanhoTomas: "",
  cortinaLadoALado: "", detalheBarra: "",
};

function formatNumeroBR(valor) {
  if (valor === null || valor === undefined || valor === "") return "";
  const n = typeof valor === "number" ? valor : parseFloat(String(valor).replace(",", "."));
  return Number.isFinite(n) ? n.toFixed(2).replace(".", ",") : "";
}

function partesMedidas(itemMedidas) {
  return String(itemMedidas || "").split(/[x×]/i).map((p) => p.trim()).filter(Boolean);
}

function formatMedidasVenda(itemMedidas) {
  if (!itemMedidas) return null;
  const partes = partesMedidas(itemMedidas);
  return partes.length === 2 ? `${partes[0]} larg x ${partes[1]} alt` : itemMedidas;
}

function paraNumero(valor) {
  const n = parseFloat(String(valor ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export default function FichaConfeccaoCortina({ osData, modo = "confeccao", onSalvar, onVoltar }) {
  const campoDados = modo === "conferencia_consultoras" ? "dados_conferencia_consultoras" : "dados_confeccao";
  const endpointSalvar = modo === "conferencia_consultoras" ? "conferencia-consultoras" : "confeccao";
  const tituloPagina = modo === "conferencia_consultoras" ? "Ficha de Conferência Consultoras — Cortina" : "Ficha de Confecção — Cortina";
  const labelSalvar = modo === "conferencia_consultoras" ? "Salvar Ficha de Conferência Consultoras" : "Salvar Ficha de Confecção";

  const [dados, setDados] = useState(() => {
    const salvos = osData[campoDados] || {};
    const alturaPadrao = osData.item_altura != null && osData.item_altura !== ""
      ? formatNumeroBR(osData.item_altura)
      : (partesMedidas(osData.item_medidas)[1] || "");
    const nomeTecidoPadrao = `${osData.item_referencia || ""}${osData.item_cor ? ` (${osData.item_cor})` : ""}`.trim();
    return { ...VAZIO, alturaCortina: alturaPadrao, nomeTecido: nomeTecidoPadrao, ...salvos };
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  function setCampo(chave, valor) {
    setDados((prev) => ({ ...prev, [chave]: valor }));
  }

  async function salvar() {
    setErro("");
    setSucesso("");

    if (!dados.feitaPor) return setErro('Campo "Cortina feita por" é obrigatório.');
    if (!dados.espacador) return setErro("Espaçador é obrigatório.");
    if (!dados.tipoWave) return setErro("Tipo wave é obrigatório.");
    if (!dados.abertura) return setErro("Abertura é obrigatória.");
    if (!dados.larguraTrilho || paraNumero(dados.larguraTrilho) <= 0) {
      return setErro("Largura do trilho é obrigatória e deve ser maior que zero.");
    }

    setSalvando(true);
    try {
      await api.put(`/os/${osData.id}/${endpointSalvar}`, dados);
      setSucesso(`${modo === "conferencia_consultoras" ? "Ficha de Conferência Consultoras" : "Ficha de Confecção"} salva com sucesso!`);
      setTimeout(onSalvar, 1200);
    } catch (err) {
      setErro(err.message || "Erro ao salvar ficha.");
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
            <h1 className="os-page-title">{tituloPagina}</h1>
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
            {salvando ? "Salvando..." : `✓ ${labelSalvar}`}
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
              <div className="os-visual-field"><span className="os-v-label">Vendedor</span><span className="os-v-value">{osData.consultor_nome || "—"}</span></div>
              <hr className="os-divider" />
              <div className="os-visual-field"><span className="os-v-label">Ambiente</span><span className="os-v-value highlight-text">{osData.item_ambiente || "—"}</span></div>
              <div className="os-visual-field stacked"><span className="os-v-label">Item</span><span className="os-v-value">{osData.item_descricao || "—"}</span></div>
              <div className="os-visual-field"><span className="os-v-label">Medidas venda</span><span className="os-v-value spec-box">{formatMedidasVenda(osData.item_medidas) || "—"}</span></div>
            </div>
          </div>

          <div className="os-col-right-form">
            <div className="os-form-section">
              <div className="os-section-title mandatory-title">Especificação da Cortina (Obrigatório)</div>
              <div className="os-grid-3">
                <div className="os-field">
                  <label>Cortina feita por</label>
                  <select value={dados.feitaPor} onChange={(e) => setCampo("feitaPor", e.target.value)} className="input-highlight">
                    <option value="">— Selecione —</option>
                    <option value="POR ALTURA">Por altura</option>
                    <option value="POR LARGURA">Por largura</option>
                  </select>
                </div>
                <div className="os-field">
                  <label>Espaçador</label>
                  <select value={dados.espacador} onChange={(e) => setCampo("espacador", e.target.value)} className="input-highlight">
                    <option value="">— Selecione —</option>
                    <option value="3,6">3,6</option>
                    <option value="5,00">5,00</option>
                    <option value="7,00">7,00</option>
                  </select>
                </div>
                <div className="os-field">
                  <label>Tipo wave</label>
                  <select value={dados.tipoWave} onChange={(e) => setCampo("tipoWave", e.target.value)} className="input-highlight">
                    <option value="">— Selecione —</option>
                    <option value="P">P</option>
                    <option value="M">M</option>
                    <option value="G">G</option>
                  </select>
                </div>
              </div>

              <div className="os-grid-2">
                <div className="os-field">
                  <label>Abertura</label>
                  <select value={dados.abertura} onChange={(e) => setCampo("abertura", e.target.value)} className="input-highlight">
                    <option value="">— Selecione —</option>
                    <option value="COM ABERTURA">Com abertura</option>
                    <option value="SEM ABERTURA">Sem abertura</option>
                  </select>
                </div>
                <div className="os-field">
                  <label>Componente (trilho)</label>
                  <select value={dados.componente} onChange={(e) => setCampo("componente", e.target.value)}>
                    <option value="">— Selecione —</option>
                    <option value="Trilho Simples branco">Trilho Simples branco</option>
                    <option value="Trilho Simples Preto">Trilho Simples Preto</option>
                    <option value="Trilho SLIM branco">Trilho SLIM branco</option>
                    <option value="Trilho SLIM cromado">Trilho SLIM cromado</option>
                    <option value="Trilho Motorizado SOMFY">Trilho Motorizado SOMFY</option>
                    <option value="Trilho Motorizado ADORNIE">Trilho Motorizado ADORNIE</option>
                  </select>
                </div>
              </div>

              <div className="os-grid-2">
                <div className="os-field">
                  <label>Largura do trilho (m)</label>
                  <input type="text" placeholder="Ex: 4,92" value={dados.larguraTrilho} onChange={(e) => setCampo("larguraTrilho", e.target.value)} className="input-highlight" />
                </div>
                <div className="os-field">
                  <label>Largura do tecido (m)</label>
                  <input type="text" placeholder="Ex: 3,30" value={dados.larguraTecido} onChange={(e) => setCampo("larguraTecido", e.target.value)} className="input-highlight" />
                </div>
              </div>

              <div className="os-field">
                <label>Nome do tecido</label>
                <input type="text" placeholder="Nome/código do tecido" value={dados.nomeTecido} onChange={(e) => setCampo("nomeTecido", e.target.value)} />
              </div>

              <div className="os-field">
                <label>Vendeu barra aplicada?</label>
                <select value={dados.vendeuBarraAplicada} onChange={(e) => setCampo("vendeuBarraAplicada", e.target.value)}>
                  <option value="">— Selecione —</option>
                  <option value="SIM">Sim</option>
                  <option value="NÃO">Não</option>
                </select>
              </div>

              <div className="os-grid-3">
                <div className="os-field">
                  <label>Altura da barra (m)</label>
                  <input type="text" placeholder="Ex: 0,50" value={dados.alturaBarra} onChange={(e) => setCampo("alturaBarra", e.target.value)} disabled={dados.vendeuBarraAplicada === "SIM"} />
                </div>
                <div className="os-field">
                  <label>Quant. tômas</label>
                  <input type="text" placeholder="0" value={dados.quantTomas} onChange={(e) => setCampo("quantTomas", e.target.value)} />
                </div>
                <div className="os-field">
                  <label>Tamanho da tôma (m)</label>
                  <input type="text" placeholder="0" value={dados.tamanhoTomas} onChange={(e) => setCampo("tamanhoTomas", e.target.value)} />
                </div>
              </div>

              <div className="os-grid-2">
                <div className="os-field">
                  <label>Cortina lado a lado</label>
                  <select value={dados.cortinaLadoALado} onChange={(e) => setCampo("cortinaLadoALado", e.target.value)}>
                    <option value="">— Selecione —</option>
                    <option value="SIM">Sim</option>
                    <option value="NÃO">Não</option>
                  </select>
                </div>
                <div className="os-field">
                  <label>Detalhe da barra</label>
                  <input type="text" placeholder="Anotações sobre a barra" value={dados.detalheBarra} onChange={(e) => setCampo("detalheBarra", e.target.value)} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
