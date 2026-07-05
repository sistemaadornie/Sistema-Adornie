import { useEffect, useState } from "react";
import { FaUser, FaTag, FaUserTie, FaHome, FaGift, FaRulerCombined } from "react-icons/fa";
import { api } from "../../services/api";
import "./OrdemServicoModal.css";

const VAZIO = {
  feitaPor: "", espacador: "", tipoWave: "", abertura: "", componente: "",
  larguraTrilho: "", larguraTecido: "", nomeTecido: "", vendeuBarraAplicada: "",
  alturaCortina: "", alturaBarra: "", quantTomas: "", tamanhoTomas: "",
  cortinaLadoALado: "", detalheBarra: "", observacoes: "",
};

function formatNumeroBR(valor) {
  if (valor === null || valor === undefined || valor === "") return "";
  const n = typeof valor === "number" ? valor : parseFloat(String(valor).replace(",", "."));
  return Number.isFinite(n) ? n.toFixed(2).replace(".", ",") : "";
}

function partesMedidas(itemMedidas) {
  return String(itemMedidas || "").split(/[x×]/i).map((p) => p.trim()).filter(Boolean);
}

function paraNumero(valor) {
  const n = parseFloat(String(valor ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export default function FichaConfeccaoCortina({ osData, modo = "confeccao", onSalvar, onVoltar, readOnly = false }) {
  const campoDados = modo === "conferencia_consultoras" ? "dados_conferencia_consultoras" : "dados_confeccao";
  const endpointSalvar = modo === "conferencia_consultoras" ? "conferencia-consultoras" : "confeccao";
  const tituloPagina = modo === "conferencia_consultoras" ? "Ficha de Conferência Consultoras — Cortina" : "Ficha de Confecção — Cortina";
  const labelSalvar = modo === "conferencia_consultoras" ? "Salvar Ficha de Conferência Consultoras" : "Salvar Ficha de Confecção";

  const [dados, setDados] = useState(() => {
    const salvos = osData[campoDados] || {};
    const alturaPadrao = osData.item_altura != null && osData.item_altura !== ""
      ? formatNumeroBR(osData.item_altura)
      : (partesMedidas(osData.item_medidas)[1] || "");
    const larguraPadrao = osData.item_largura != null && osData.item_largura !== ""
      ? formatNumeroBR(osData.item_largura)
      : (partesMedidas(osData.item_medidas)[0] || "");
    const nomeTecidoPadrao = `${osData.item_referencia || ""}${osData.item_cor ? ` (${osData.item_cor})` : ""}`.trim();
    return { ...VAZIO, alturaCortina: alturaPadrao, larguraTrilho: larguraPadrao, nomeTecido: nomeTecidoPadrao, ...salvos };
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  useEffect(() => {
    if (readOnly) return;
    const nome = dados.nomeTecido?.trim();
    if (!nome) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      api.get(`/os/tecidos/largura?nome=${encodeURIComponent(nome)}`, { signal: controller.signal })
        .then((res) => {
          if (!res.largura) return;
          setDados((prev) => (prev.larguraTecido ? prev : { ...prev, larguraTecido: res.largura }));
        })
        .catch(() => {});
    }, 500);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [dados.nomeTecido, readOnly]);

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
      return setErro("Largura vendida inválida ou ausente — verifique a largura cadastrada no item do pedido.");
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
      <div className="os-page-header os-page-header-flat">
        <div className="os-page-header-left">
          <button className="os-back-btn" onClick={onVoltar}>← Voltar</button>
          <h1 className="os-page-title">
            {tituloPagina}
            {readOnly && (
              <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.08)", color: "var(--color-text-muted, #999)" }}>
                🔒 Somente leitura
              </span>
            )}
          </h1>
        </div>
        <div className="os-page-header-right">
          {readOnly ? (
            <button className="os-btn os-btn-secondary" onClick={onVoltar}>Fechar</button>
          ) : (
            <>
              <button className="os-btn os-btn-secondary" onClick={onVoltar} disabled={salvando}>Cancelar</button>
              <button className="os-btn os-btn-primary" onClick={salvar} disabled={salvando}>
                {salvando ? "Salvando..." : `✓ ${labelSalvar}`}
              </button>
            </>
          )}
        </div>
      </div>

      {erro && <div className="os-alert os-alert-danger" style={{ margin: "0 0 16px" }}>{erro}</div>}
      {sucesso && <div className="os-alert os-alert-success" style={{ margin: "0 0 16px" }}>{sucesso}</div>}

      <div className="os-page-body" style={readOnly ? { pointerEvents: "none", opacity: 0.85 } : undefined}>
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

        <div className="os-layout-img">
          <div className="os-col-left-form">
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
                    <option value="Trilho Suíço branco">Trilho Suíço branco</option>
                    <option value="Trilho Suíço Preto">Trilho Suíço Preto</option>
                    <option value="Trilho SLIM branco">Trilho SLIM branco</option>
                    <option value="Trilho SLIM cromado">Trilho SLIM cromado</option>
                    <option value="Trilho Motorizado SOMFY">Trilho Motorizado SOMFY</option>
                    <option value="Trilho Motorizado ADORNIE">Trilho Motorizado ADORNIE</option>
                    <option value="Varão 19mm">Varão 19mm</option>
                    <option value="Varão 22mm">Varão 22mm</option>
                  </select>
                </div>
              </div>

              <div className="os-field">
                <label>Nome do tecido</label>
                <input type="text" placeholder="Nome/código do tecido" value={dados.nomeTecido} onChange={(e) => setCampo("nomeTecido", e.target.value)} />
              </div>

              <div className="os-field-tecido-rolo">
                <img src="/tecido.png" alt="Rolo de tecido" className="os-icon-tecido" />
                <div className="os-field">
                  <label>Largura do tecido no rolo (m)</label>
                  <input type="text" placeholder="Ex: 3,30" value={dados.larguraTecido} onChange={(e) => setCampo("larguraTecido", e.target.value)} />
                </div>
              </div>

              <div className="os-grid-2">
                <div className="os-field">
                  <label>Vendeu barra aplicada?</label>
                  <select value={dados.vendeuBarraAplicada} onChange={(e) => setCampo("vendeuBarraAplicada", e.target.value)}>
                    <option value="">— Selecione —</option>
                    <option value="SIM">Sim</option>
                    <option value="NÃO">Não</option>
                  </select>
                </div>
                <div className="os-field">
                  <label>Cortina lado a lado</label>
                  <select value={dados.cortinaLadoALado} onChange={(e) => setCampo("cortinaLadoALado", e.target.value)}>
                    <option value="">— Selecione —</option>
                    <option value="SIM">Sim</option>
                    <option value="NÃO">Não</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="os-form-section">
              <div className="os-section-title"><FaRulerCombined /> Detalhes da Barra</div>
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
              <div className="os-field">
                <label>Detalhe da barra</label>
                <input type="text" placeholder="Anotações sobre a barra" value={dados.detalheBarra} onChange={(e) => setCampo("detalheBarra", e.target.value)} />
              </div>
            </div>
          </div>

          <div className="os-img-col">
            <div className="os-info-item">
              <span className="os-info-label"><FaRulerCombined /> Largura (medida de venda)</span>
              <span className="os-info-value spec-box">{dados.larguraTrilho ? `${dados.larguraTrilho} m` : "—"}</span>
            </div>
            <img src="/cortina.png" alt="Esboço da cortina" className="os-img-cortina" />
            <div className="os-info-item">
              <span className="os-info-label"><FaRulerCombined /> Altura (medida de venda)</span>
              <span className="os-info-value spec-box">{dados.alturaCortina ? `${dados.alturaCortina} m` : "—"}</span>
            </div>
          </div>
        </div>

        <div className="os-form-section" style={{ marginTop: 20 }}>
          <div className="os-section-title">Resumo / Observações</div>
          <textarea
            className="os-textarea"
            placeholder="Anotações gerais sobre a conferência desta cortina..."
            value={dados.observacoes}
            onChange={(e) => setCampo("observacoes", e.target.value)}
            rows={3}
          />
        </div>
      </div>
    </div>
  );
}
