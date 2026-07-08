import { useState, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { FaUpload, FaFileAlt, FaTimes, FaCheckCircle, FaExclamationTriangle, FaInfoCircle } from "react-icons/fa";
import { api } from "../../services/api";

function normalizarTipoPessoa(v) {
  const s = String(v || "").trim().toUpperCase();
  if (s.includes("PJ") || s.includes("CNPJ")) return "PJ";
  if (s.includes("PF") || s.includes("CPF")) return "PF";
  return "";
}

function formatarDataNascimento(v) {
  if (!v) return "";
  if (v instanceof Date && !isNaN(v)) {
    const ano = v.getUTCFullYear();
    const mes = String(v.getUTCMonth() + 1).padStart(2, "0");
    const dia = String(v.getUTCDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  }
  return "";
}

function mapearLinhasHoop(linhas) {
  if (!linhas.length) return [];
  const headers = linhas[0].map((h) => String(h || "").trim());
  const idx = {};
  headers.forEach((h, i) => { idx[h] = i; });
  const get = (row, col) => {
    const v = row[idx[col]];
    return v === undefined || v === null ? "" : v;
  };
  const getStr = (row, col) => String(get(row, col)).trim();

  return linhas
    .slice(1)
    .filter((row) => getStr(row, "Nome"))
    .map((row) => ({
      tipo_pessoa:          normalizarTipoPessoa(getStr(row, "TIPO (PF/PJ)")),
      nome:                 getStr(row, "Nome"),
      email:                getStr(row, "Email").replace(/\s/g, ""),
      cpf_cnpj:             getStr(row, "CPF/CNPJ"),
      data_nascimento:      formatarDataNascimento(get(row, "Data de nascimento")),
      telefone:             getStr(row, "Telefone"),
      rua:                  getStr(row, "Endereço"),
      numero:               getStr(row, "Número"),
      complemento:          getStr(row, "Complemento"),
      bairro:               getStr(row, "Bairro"),
      cidade:               getStr(row, "Cidade"),
      estado:               getStr(row, "Estado (Sigla)"),
      cep:                  getStr(row, "Cep"),
      cau:                  getStr(row, "CAU/CREA"),
      comprou_optin:        getStr(row, "Comprou | OPTIN"),
      chave_pix:            getStr(row, "CHAVE PIX"),
      responsavel_nome:     getStr(row, "Responsável"),
      escritorio_cpf_cnpj:  getStr(row, "CPF / CNPJ ESCRITORIO"),
      escritorio_nome:      getStr(row, "NOME DO ESCRITORIO"),
      escritorio_telefone:  getStr(row, "TELEFONE ESCRITORIO"),
      escritorio_email:     getStr(row, "EMAIL ESCRITORIO"),
    }))
    .filter((r) => r.nome);
}

/* ── Componente ── */
export default function ImportarArquitetosModal({ onClose, onImportado }) {
  const [etapa, setEtapa] = useState("selecionar"); // selecionar | mapear-responsaveis | verificando | preview | importando | resultado
  const [linhasBrutas, setLinhasBrutas] = useState([]); // saída de mapearLinhasHoop, sem consultor_id ainda
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [consultores, setConsultores] = useState([]);
  const [mapaResponsaveis, setMapaResponsaveis] = useState({}); // { "Dag": "7" }
  const [verificacao, setVerificacao] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [erroLeitura, setErroLeitura] = useState(null);
  const inputRef = useRef();

  const responsaveisUnicos = useMemo(() => {
    const set = new Set(linhasBrutas.map((r) => r.responsavel_nome).filter(Boolean));
    return [...set];
  }, [linhasBrutas]);

  const registros = useMemo(
    () => linhasBrutas.map((r) => ({
      ...r,
      consultor_id: r.responsavel_nome ? (mapaResponsaveis[r.responsavel_nome] || null) : null,
    })),
    [linhasBrutas, mapaResponsaveis]
  );

  const registrosPF = useMemo(() => registros.filter((r) => r.tipo_pessoa !== "PJ"), [registros]);
  const registrosPJ = useMemo(() => registros.filter((r) => r.tipo_pessoa === "PJ"), [registros]);

  function handleArquivo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setNomeArquivo(file.name);
    setErroLeitura(null);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array", cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const linhas = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        const regs = mapearLinhasHoop(linhas);
        if (!regs.length) {
          setErroLeitura("Nenhum registro válido encontrado no arquivo.");
          return;
        }
        setLinhasBrutas(regs);

        if (!consultores.length) {
          try {
            const r = await api.get("/auth/admin/usuarios");
            setConsultores((r.usuarios || []).filter((u) => u.status === "aprovado"));
          } catch { /* segue sem consultores — mapeamento fica vazio */ }
        }

        setEtapa("mapear-responsaveis");
      } catch {
        setErroLeitura("Falha ao interpretar o arquivo. Confira se é um .xlsx válido no padrão Hoop.");
      }
    };
    reader.onerror = () => setErroLeitura("Erro ao ler o arquivo.");
    reader.readAsArrayBuffer(file);
  }

  async function confirmarMapeamento() {
    setEtapa("verificando");
    try {
      const check = await api.post("/arquitetos/verificar-duplicatas", { registros });
      setVerificacao(check);
    } catch {
      setVerificacao({ duplicatas: [], novos: registrosPF.length, total: registrosPF.length });
    }
    setEtapa("preview");
  }

  async function handleImportar() {
    setEtapa("importando");
    try {
      const res = await api.post("/arquitetos/importar", { registros });
      setResultado(res);
      setEtapa("resultado");
      onImportado();
    } catch (err) {
      setResultado({ importados: 0, atualizados: 0, ignorados: 0, escritorios_criados: 0, escritorios_atualizados: 0, erros: [{ nome: "—", erro: err.message }] });
      setEtapa("resultado");
    }
  }

  const temDuplicatas = verificacao && verificacao.duplicatas?.length > 0;

  return (
    <div className="modal-overlay">
      <div className="modal-box imp-modal">

        <div className="modal-header">
          <h2 className="modal-title">Importar Arquitetos</h2>
          <button className="modal-close" onClick={onClose}><FaTimes /></button>
        </div>

        <div className="modal-body imp-body">

          {/* ── ETAPA: SELECIONAR ── */}
          {etapa === "selecionar" && (
            <div className="imp-drop-area" onClick={() => inputRef.current.click()}>
              <FaUpload className="imp-drop-icon" />
              <p className="imp-drop-title">Clique para selecionar a planilha (padrão Hoop)</p>
              <p className="imp-drop-hint">Formato esperado: Excel (.xlsx) exportado do Hoop</p>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx"
                style={{ display: "none" }}
                onChange={handleArquivo}
              />
              {erroLeitura && (
                <p className="imp-erro-texto"><FaExclamationTriangle /> {erroLeitura}</p>
              )}
            </div>
          )}

          {/* ── ETAPA: MAPEAR RESPONSÁVEIS ── */}
          {etapa === "mapear-responsaveis" && (
            <>
              <p className="imp-preview-label">
                Vincule cada "Responsável" da planilha a um usuário do sistema (fica como consultor responsável). Pode deixar sem vínculo.
              </p>
              {responsaveisUnicos.length === 0 && (
                <p className="imp-preview-label">Nenhuma coluna "Responsável" preenchida nesse arquivo — pode seguir sem vincular ninguém.</p>
              )}
              {responsaveisUnicos.map((nome) => (
                <div className="ag-form-field" key={nome} style={{ marginBottom: 12 }}>
                  <label>{nome}</label>
                  <select
                    value={mapaResponsaveis[nome] || ""}
                    onChange={(e) => setMapaResponsaveis((m) => ({ ...m, [nome]: e.target.value }))}
                  >
                    <option value="">— Sem consultor —</option>
                    {consultores.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome_completo}</option>
                    ))}
                  </select>
                </div>
              ))}
            </>
          )}

          {/* ── ETAPA: VERIFICANDO ── */}
          {etapa === "verificando" && (
            <div className="imp-loading">
              <span className="imp-spinner" />
              <p>Verificando duplicatas…</p>
            </div>
          )}

          {/* ── ETAPA: PREVIEW ── */}
          {etapa === "preview" && (
            <>
              <div className="imp-info-bar">
                <span className="imp-info-arquivo">
                  <FaFileAlt /> {nomeArquivo}
                </span>
                <span className="imp-info-count">
                  <strong>{registrosPF.length}</strong> arquiteto{registrosPF.length !== 1 ? "s" : ""} no arquivo
                </span>
              </div>

              {/* Resumo de novos vs duplicatas */}
              <div className="imp-resumo-checks">
                <div className="imp-resumo-item imp-resumo-novo">
                  <FaCheckCircle />
                  <span><strong>{verificacao?.novos ?? registrosPF.length}</strong> novo{(verificacao?.novos ?? registrosPF.length) !== 1 ? "s" : ""} (serão importados)</span>
                </div>
                {temDuplicatas && (
                  <div className="imp-resumo-item imp-resumo-dup">
                    <FaInfoCircle />
                    <span>
                      <strong>{verificacao.duplicatas.length}</strong> duplicado{verificacao.duplicatas.length !== 1 ? "s" : ""} encontrado{verificacao.duplicatas.length !== 1 ? "s" : ""} — não serão reimportados, apenas atualizados se houver informações novas
                    </span>
                  </div>
                )}
                {registrosPJ.length > 0 && (
                  <div className="imp-resumo-item imp-resumo-novo">
                    <FaInfoCircle />
                    <span><strong>{registrosPJ.length}</strong> escritório{registrosPJ.length !== 1 ? "s" : ""} serão criados/atualizados junto</span>
                  </div>
                )}
              </div>

              {/* Lista de duplicatas */}
              {temDuplicatas && (
                <details className="imp-dup-details">
                  <summary>Ver duplicados ({verificacao.duplicatas.length})</summary>
                  <ul className="imp-dup-lista">
                    {verificacao.duplicatas.map((nome, i) => (
                      <li key={i}>{nome}</li>
                    ))}
                  </ul>
                </details>
              )}

              <p className="imp-preview-label">Prévia (primeiros 5 registros)</p>
              <div className="imp-table-wrap">
                <table className="imp-table">
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Nome</th>
                      <th>CPF/CNPJ</th>
                      <th>Telefone</th>
                      <th>E-mail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registrosPF.slice(0, 5).map((r, i) => (
                      <tr key={i}>
                        <td>{r.tipo_pessoa || <span className="imp-vazio">—</span>}</td>
                        <td>{r.nome || <span className="imp-vazio">—</span>}</td>
                        <td>{r.cpf_cnpj || <span className="imp-vazio">—</span>}</td>
                        <td>{r.telefone || <span className="imp-vazio">—</span>}</td>
                        <td className="imp-email">{r.email || <span className="imp-vazio">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {registrosPF.length > 5 && (
                <p className="imp-mais">… e mais {registrosPF.length - 5} registros</p>
              )}
            </>
          )}

          {/* ── ETAPA: IMPORTANDO ── */}
          {etapa === "importando" && (
            <div className="imp-loading">
              <span className="imp-spinner" />
              <p>Importando {registros.length} registros…</p>
            </div>
          )}

          {/* ── ETAPA: RESULTADO ── */}
          {etapa === "resultado" && resultado && (
            <div className="imp-resultado">
              {resultado.importados > 0 && (
                <div className="imp-resultado-ok">
                  <FaCheckCircle className="imp-resultado-icon" />
                  <div>
                    <strong>{resultado.importados}</strong> arquiteto{resultado.importados !== 1 ? "s" : ""} novo{resultado.importados !== 1 ? "s" : ""} importado{resultado.importados !== 1 ? "s" : ""} com sucesso
                  </div>
                </div>
              )}
              {resultado.atualizados > 0 && (
                <div className="imp-resultado-info">
                  <FaInfoCircle className="imp-resultado-icon imp-resultado-icon-info" />
                  <div>
                    <strong>{resultado.atualizados}</strong> duplicado{resultado.atualizados !== 1 ? "s" : ""} atualizado{resultado.atualizados !== 1 ? "s" : ""} com novas informações
                  </div>
                </div>
              )}
              {resultado.ignorados > 0 && (
                <div className="imp-resultado-ignorado">
                  <FaInfoCircle className="imp-resultado-icon imp-resultado-icon-muted" />
                  <div>
                    <strong>{resultado.ignorados}</strong> duplicado{resultado.ignorados !== 1 ? "s" : ""} ignorado{resultado.ignorados !== 1 ? "s" : ""} (sem alterações)
                  </div>
                </div>
              )}
              {resultado.escritorios_criados > 0 && (
                <div className="imp-resultado-ok">
                  <FaCheckCircle className="imp-resultado-icon" />
                  <div>
                    <strong>{resultado.escritorios_criados}</strong> escritório{resultado.escritorios_criados !== 1 ? "s" : ""} novo{resultado.escritorios_criados !== 1 ? "s" : ""} criado{resultado.escritorios_criados !== 1 ? "s" : ""}
                  </div>
                </div>
              )}
              {resultado.escritorios_atualizados > 0 && (
                <div className="imp-resultado-info">
                  <FaInfoCircle className="imp-resultado-icon imp-resultado-icon-info" />
                  <div>
                    <strong>{resultado.escritorios_atualizados}</strong> escritório{resultado.escritorios_atualizados !== 1 ? "s" : ""} atualizado{resultado.escritorios_atualizados !== 1 ? "s" : ""}
                  </div>
                </div>
              )}
              {resultado.importados === 0 && resultado.atualizados === 0 && resultado.ignorados === 0 &&
                !resultado.escritorios_criados && !resultado.escritorios_atualizados && !resultado.erros?.length && (
                <div className="imp-resultado-ok">
                  <FaCheckCircle className="imp-resultado-icon" />
                  <div>Importação concluída sem registros novos.</div>
                </div>
              )}
              {resultado.erros?.length > 0 && (
                <div className="imp-resultado-erros">
                  <p><FaExclamationTriangle /> {resultado.erros.length} erro{resultado.erros.length !== 1 ? "s" : ""}:</p>
                  <ul>
                    {resultado.erros.slice(0, 5).map((e, i) => (
                      <li key={i}><em>{e.nome}</em> — {e.erro}</li>
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
          {etapa === "selecionar" && (
            <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          )}
          {etapa === "mapear-responsaveis" && (
            <>
              <button className="btn-secondary" onClick={() => { setEtapa("selecionar"); setLinhasBrutas([]); }}>
                Trocar arquivo
              </button>
              <button className="btn-primary" onClick={confirmarMapeamento}>
                Continuar
              </button>
            </>
          )}
          {etapa === "preview" && (
            <>
              <button className="btn-secondary" onClick={() => { setEtapa("selecionar"); setLinhasBrutas([]); setVerificacao(null); }}>
                Trocar arquivo
              </button>
              <button className="btn-primary" onClick={handleImportar}
                disabled={verificacao?.novos === 0 && !temDuplicatas}>
                {verificacao?.novos === 0 && temDuplicatas
                  ? `Atualizar ${verificacao.duplicatas.length} duplicados`
                  : temDuplicatas
                    ? `Importar ${verificacao?.novos} novos e verificar ${verificacao.duplicatas.length} duplicados`
                    : `Importar ${registrosPF.length} arquitetos`}
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
