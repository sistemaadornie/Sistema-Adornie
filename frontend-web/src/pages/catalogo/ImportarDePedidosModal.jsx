import { useState, useEffect } from "react";
import { FaBoxOpen, FaCheckCircle, FaExclamationTriangle, FaTimes } from "react-icons/fa";
import { api } from "../../services/api";

const fmt = (v) =>
  v ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

/* ── Componente principal ── */
export default function ImportarDePedidosModal({ categorias, onClose, onImportado }) {
  const [etapa, setEtapa]           = useState("buscar"); // buscar | classificar | importando | resultado
  const [candidatos, setCandidatos] = useState([]);
  const [selecionados, setSelecionados] = useState({});  // id→ boolean
  const [campos, setCampos]         = useState({});      // id→ { tipo, categoria_id }
  const [resultado, setResultado]   = useState(null);
  const [buscando, setBuscando]     = useState(false);
  const [erroFetch, setErroFetch]   = useState(null);
  const [catGlobal, setCatGlobal]   = useState("");

  // ID único para cada candidato (índice do array)
  function id(i) { return String(i); }

  async function handleBuscar() {
    setBuscando(true);
    setErroFetch(null);
    try {
      const res = await api.get("/produtos/candidatos-de-pedidos");
      const lista = res.candidatos || [];
      if (!lista.length) { setErroFetch("Nenhum item novo encontrado nos pedidos."); setBuscando(false); return; }

      setCandidatos(lista);

      // Pré-selecionar todos e pre-popular categoria a partir da sugestão
      const sel = {};
      const camp = {};
      lista.forEach((c, i) => {
        sel[id(i)] = true;
        const catSugerida = categorias.find((cat) =>
          cat.nome.toLowerCase() === c.sugestao_categoria?.toLowerCase()
        );
        camp[id(i)] = {
          tipo: "produto",
          categoria_id: catSugerida?.id || "",
        };
      });
      setSelecionados(sel);
      setCampos(camp);
      setEtapa("classificar");
    } catch (err) {
      setErroFetch(err.message || "Erro ao buscar candidatos.");
    } finally {
      setBuscando(false);
    }
  }

  function toggleSel(i) {
    setSelecionados((prev) => ({ ...prev, [id(i)]: !prev[id(i)] }));
  }

  function toggleTodos(val) {
    const novo = {};
    candidatos.forEach((_, i) => { novo[id(i)] = val; });
    setSelecionados(novo);
  }

  function setCampo(i, key, val) {
    setCampos((prev) => ({ ...prev, [id(i)]: { ...prev[id(i)], [key]: val } }));
  }

  function aplicarCatGlobal() {
    if (!catGlobal) return;
    setCampos((prev) => {
      const novo = { ...prev };
      candidatos.forEach((_, i) => {
        if (selecionados[id(i)]) {
          novo[id(i)] = { ...novo[id(i)], categoria_id: catGlobal };
        }
      });
      return novo;
    });
  }

  async function handleImportar() {
    const itens = candidatos
      .filter((_, i) => selecionados[id(i)])
      .map((c, i) => {
        const idx = candidatos.indexOf(c);
        const camp = campos[id(idx)] || {};
        return {
          referencia:  c.referencia  || null,
          descricao:   c.descricao,
          unidade:     c.unidade     || "un",
          preco_venda: Number(c.preco_sugerido) || 0,
          tipo:        camp.tipo       || "produto",
          categoria_id: camp.categoria_id ? Number(camp.categoria_id) : null,
        };
      });

    if (!itens.length) return;

    setEtapa("importando");
    try {
      const res = await api.post("/produtos/importar-de-pedidos", { itens });
      setResultado(res);
      setEtapa("resultado");
      onImportado?.();
    } catch (err) {
      setResultado({ importados: 0, erros: [{ descricao: "—", erro: err.message }] });
      setEtapa("resultado");
    }
  }

  const totalSel = Object.values(selecionados).filter(Boolean).length;

  return (
    <div className="modal-overlay">
      <div className="modal-box imp-ped-modal">

        <div className="modal-header">
          <h2 className="modal-title"><FaBoxOpen style={{ marginRight: 8 }} />Importar de Pedidos</h2>
          <button className="modal-close" onClick={onClose}><FaTimes /></button>
        </div>

        <div className="modal-body imp-ped-body">

          {/* ── ETAPA: BUSCAR ── */}
          {etapa === "buscar" && (
            <div className="imp-ped-intro">
              <p className="imp-ped-desc">
                Extrai automaticamente os itens únicos dos seus pedidos que ainda não estão no catálogo.
                Você poderá classificar cada um antes de confirmar.
              </p>
              {erroFetch && (
                <p className="imp-ped-erro"><FaExclamationTriangle /> {erroFetch}</p>
              )}
              <button className="btn-primary" onClick={handleBuscar} disabled={buscando} style={{ marginTop: 8 }}>
                {buscando ? "Buscando…" : "Buscar itens dos pedidos"}
              </button>
            </div>
          )}

          {/* ── ETAPA: CLASSIFICAR ── */}
          {etapa === "classificar" && (
            <>
              <div className="imp-ped-barra">
                <span className="imp-ped-contagem">
                  <strong>{candidatos.length}</strong> item{candidatos.length !== 1 ? "s" : ""} encontrado{candidatos.length !== 1 ? "s" : ""},&nbsp;
                  <strong>{totalSel}</strong> selecionado{totalSel !== 1 ? "s" : ""}
                </span>
                <div className="imp-ped-acao-global">
                  <select
                    className="imp-ped-cat-select"
                    value={catGlobal}
                    onChange={(e) => setCatGlobal(e.target.value)}
                  >
                    <option value="">Categoria para todos…</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                  <button className="btn-ghost" onClick={aplicarCatGlobal} disabled={!catGlobal}>
                    Aplicar
                  </button>
                  <button className="btn-ghost" onClick={() => toggleTodos(true)}>Sel. todos</button>
                  <button className="btn-ghost" onClick={() => toggleTodos(false)}>Limpar</button>
                </div>
              </div>

              <div className="imp-ped-table-wrap">
                <table className="imp-ped-table">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}></th>
                      <th>Referência</th>
                      <th>Descrição</th>
                      <th>Un.</th>
                      <th>Preço</th>
                      <th>Aparições</th>
                      <th>Tipo</th>
                      <th>Categoria</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidatos.map((c, i) => (
                      <tr key={i} className={selecionados[id(i)] ? "" : "imp-ped-row-desativa"}>
                        <td>
                          <input type="checkbox"
                            checked={!!selecionados[id(i)]}
                            onChange={() => toggleSel(i)}
                            className="imp-ped-check"
                          />
                        </td>
                        <td className="imp-ped-ref">{c.referencia || <span className="arq-vazio">—</span>}</td>
                        <td className="imp-ped-desc-cell" title={c.descricao}>{c.descricao}</td>
                        <td>{c.unidade || "un"}</td>
                        <td className="imp-ped-preco">{fmt(c.preco_sugerido)}</td>
                        <td className="imp-ped-aparicoes">{c.total_aparicoes}×</td>
                        <td>
                          <select
                            className="imp-ped-tipo-select"
                            value={campos[id(i)]?.tipo || "produto"}
                            onChange={(e) => setCampo(i, "tipo", e.target.value)}
                            disabled={!selecionados[id(i)]}
                          >
                            <option value="produto">Produto</option>
                            <option value="servico">Serviço</option>
                          </select>
                        </td>
                        <td>
                          <select
                            className="imp-ped-cat-select"
                            value={campos[id(i)]?.categoria_id || ""}
                            onChange={(e) => setCampo(i, "categoria_id", e.target.value)}
                            disabled={!selecionados[id(i)]}
                          >
                            <option value="">Sem categoria</option>
                            {categorias.map((cat) => (
                              <option key={cat.id} value={cat.id}>{cat.nome}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── ETAPA: IMPORTANDO ── */}
          {etapa === "importando" && (
            <div className="imp-loading">
              <span className="imp-spinner" />
              <p>Importando {totalSel} produto{totalSel !== 1 ? "s" : ""}…</p>
            </div>
          )}

          {/* ── ETAPA: RESULTADO ── */}
          {etapa === "resultado" && resultado && (
            <div className="imp-resultado">
              <div className="imp-resultado-ok">
                <FaCheckCircle className="imp-resultado-icon" />
                <div>
                  <strong>{resultado.importados}</strong> produto{resultado.importados !== 1 ? "s" : ""} importado{resultado.importados !== 1 ? "s" : ""} com sucesso
                </div>
              </div>
              {resultado.erros?.length > 0 && (
                <div className="imp-resultado-erros">
                  <p><FaExclamationTriangle /> {resultado.erros.length} erro{resultado.erros.length !== 1 ? "s" : ""}:</p>
                  <ul>
                    {resultado.erros.slice(0, 5).map((e, i) => (
                      <li key={i}><em>{e.descricao}</em> — {e.erro}</li>
                    ))}
                    {resultado.erros.length > 5 && <li>…e mais {resultado.erros.length - 5}</li>}
                  </ul>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Rodapé */}
        <div className="modal-actions">
          {etapa === "buscar" && (
            <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          )}
          {etapa === "classificar" && (
            <>
              <button className="btn-secondary" onClick={() => { setEtapa("buscar"); setCandidatos([]); }}>
                Voltar
              </button>
              <button className="btn-primary" onClick={handleImportar} disabled={totalSel === 0}>
                Importar {totalSel} produto{totalSel !== 1 ? "s" : ""}
              </button>
            </>
          )}
          {etapa === "resultado" && (
            <button className="btn-primary" onClick={onClose}>Fechar</button>
          )}
        </div>

      </div>
    </div>
  );
}
