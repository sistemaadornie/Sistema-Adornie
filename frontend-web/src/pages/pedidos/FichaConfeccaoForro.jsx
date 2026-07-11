import { useEffect, useMemo, useState } from "react";
import { FaUser, FaTag, FaUserTie, FaHome, FaGift, FaRulerCombined } from "react-icons/fa";
import { api } from "../../services/api";
import { calcularQuantForro } from "../../utils/calculoCortina";
import "./OrdemServicoModal.css";

const VAZIO = {
  tecidoForro: "", tecidoTipo: "", franzimento: "", forroCosturado: "", itemVinculadoId: "",
  larguraForro: "", alturaBarraForro: "",
  espacador: "", larguraTrilho: "", tipoWave: "", tipoWaveOutros: "", abertura: "", alturaCortina: "",
};

function paraNumero(valor) {
  const n = parseFloat(String(valor ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export default function FichaConfeccaoForro({ osData, modo = "confeccao", onSalvar, onVoltar, readOnly = false }) {
  const campoDados = modo === "conferencia_consultoras" ? "dados_conferencia_consultoras" : "dados_confeccao";
  const endpointSalvar = modo === "conferencia_consultoras" ? "conferencia-consultoras" : "confeccao";
  const tituloPagina = modo === "conferencia_consultoras" ? "Ficha de Conferência Consultoras — Forro" : "Ficha de Confecção — Forro";
  const labelSalvar = modo === "conferencia_consultoras" ? "Salvar Ficha de Conferência Consultoras" : "Salvar Ficha de Confecção";

  const [dados, setDados] = useState({ ...VAZIO, ...(osData[campoDados] || {}) });
  const [itensAmbiente, setItensAmbiente] = useState([]);

  useEffect(() => {
    api.get(`/os/${osData.id}/itens-ambiente`)
      .then((res) => setItensAmbiente(res || []))
      .catch(() => setItensAmbiente([]));
  }, [osData.id]);
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
    if (dados.forroCosturado === "JUNTO" && !dados.itemVinculadoId) {
      return setErro("Selecione o item em que este forro será costurado.");
    }
    if (dados.tipoWave === "Outros" && !dados.tipoWaveOutros?.trim()) {
      return setErro('Descreva o tipo wave selecionado em "Outros".');
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
                  <select
                    value={dados.forroCosturado}
                    onChange={(e) => {
                      const valor = e.target.value;
                      setDados((prev) => ({ ...prev, forroCosturado: valor, itemVinculadoId: valor === "JUNTO" ? prev.itemVinculadoId : "" }));
                    }}
                    className="input-highlight"
                  >
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

              {dados.forroCosturado === "JUNTO" && (
                <div className="os-field">
                  <label>Vincular a qual item deste ambiente?</label>
                  <select
                    value={dados.itemVinculadoId}
                    onChange={(e) => setCampo("itemVinculadoId", e.target.value)}
                    className="input-highlight"
                  >
                    <option value="">— Selecione —</option>
                    {itensAmbiente.map((it) => (
                      <option key={it.id} value={it.id}>
                        {[it.categoria_nome, it.descricao, it.cor].filter(Boolean).join(" — ")}
                      </option>
                    ))}
                  </select>
                </div>
              )}

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
                  <select
                    value={dados.tipoWave}
                    onChange={(e) => {
                      const valor = e.target.value;
                      setDados((prev) => ({ ...prev, tipoWave: valor, tipoWaveOutros: valor === "Outros" ? prev.tipoWaveOutros : "" }));
                    }}
                  >
                    <option value="">— Selecione —</option>
                    <option value="P">P</option>
                    <option value="M">M</option>
                    <option value="G">G</option>
                    <option value="Franzida 1,3">Franzida 1,3</option>
                    <option value="Franzida 1,8">Franzida 1,8</option>
                    <option value="Outros">Outros</option>
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
              {dados.tipoWave === "Outros" && (
                <div className="os-field">
                  <label>Descreva o tipo wave</label>
                  <input
                    type="text"
                    placeholder="Ex: Prega americana dupla"
                    value={dados.tipoWaveOutros}
                    onChange={(e) => setCampo("tipoWaveOutros", e.target.value)}
                    className="input-highlight"
                  />
                </div>
              )}
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

          <div className="os-img-col">
            <div className="os-form-section" style={{ width: "100%" }}>
              <div className="os-section-title">Cálculo (atualiza ao digitar)</div>
              <div className="os-field"><label>Quant. forro</label><div className="os-v-value spec-box">{quantForro || "—"}</div></div>
            </div>
            <div className="os-info-item">
              <span className="os-info-label"><FaRulerCombined /> Largura do trilho (referência)</span>
              <span className="os-info-value spec-box">{dados.larguraTrilho ? `${dados.larguraTrilho} m` : "—"}</span>
            </div>
            <img src="/cortina.png" alt="Esboço da cortina (referência)" className="os-img-cortina" />
            <div className="os-info-item">
              <span className="os-info-label"><FaRulerCombined /> Altura da cortina (referência)</span>
              <span className="os-info-value spec-box">{dados.alturaCortina ? `${dados.alturaCortina} m` : "—"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
