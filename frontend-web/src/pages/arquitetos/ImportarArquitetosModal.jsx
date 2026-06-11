import { useState, useRef } from "react";
import { FaUpload, FaFileAlt, FaTimes, FaCheckCircle, FaExclamationTriangle, FaInfoCircle } from "react-icons/fa";
import { api } from "../../services/api";

/* ── Parser CSV com suporte a campos com quebra de linha ── */
function parseCSV(text, delimiter = ";") {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === delimiter) { row.push(field.trim()); field = ""; }
      else if (ch === "\n") {
        row.push(field.trim()); field = "";
        if (row.some(Boolean)) rows.push(row);
        row = [];
      } else if (ch !== "\r") { field += ch; }
    }
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function extrairCAU(obs = "") {
  const m = obs.match(/CAU[:\s.]*([A-Z]\d{5,8}[-–]\d)/i);
  return m ? m[1].replace("–", "-") : "";
}

function mapearRegistros(linhas) {
  if (!linhas.length) return [];
  const headers = linhas[0].map((h) => h.replace(/^"|"$/g, "").trim());

  const idx = {};
  headers.forEach((h, i) => { idx[h] = i; });

  const get = (row, col) => (row[idx[col]] ?? "").replace(/^"|"$/g, "").trim();

  return linhas
    .slice(1)
    .filter((row) => get(row, "Ativo") === "1")
    .map((row) => {
      const nomeRazao    = get(row, "NomeRazaoSocial");
      const apelido      = get(row, "ApelidoNomeFantasia");
      const obs          = get(row, "Observacao");
      const telPrinc     = get(row, "TelefonePrincipal");
      const telOutro     = get(row, "OutroTelefone");
      const tipoPessoa   = get(row, "TipoPessoa");
      const cpf          = get(row, "CPF");
      const cnpj         = get(row, "CNPJ");

      return {
        nome:           nomeRazao || apelido,
        escritorio:     apelido   || "",
        email:          get(row, "Email").replace(/\s/g, ""),
        telefone:       telPrinc  || "",
        outro_telefone: telOutro  || "",
        cau:            extrairCAU(obs),
        tipo_pessoa:    tipoPessoa === "F" ? "PF" : tipoPessoa === "J" ? "PJ" : "",
        cpf_cnpj:       cpf || cnpj || "",
        observacoes:    obs,
      };
    })
    .filter((r) => r.nome);
}

/* ── Componente ── */
export default function ImportarArquitetosModal({ onClose, onImportado }) {
  const [etapa, setEtapa]             = useState("selecionar"); // selecionar | verificando | preview | importando | resultado
  const [registros, setRegistros]     = useState([]);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [verificacao, setVerificacao] = useState(null); // { duplicatas, novos, total }
  const [resultado, setResultado]     = useState(null);
  const [erroLeitura, setErroLeitura] = useState(null);
  const inputRef = useRef();

  function handleArquivo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setNomeArquivo(file.name);
    setErroLeitura(null);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const linhas = parseCSV(ev.target.result);
        const regs   = mapearRegistros(linhas);
        if (!regs.length) {
          setErroLeitura("Nenhum registro válido encontrado no arquivo.");
          return;
        }
        setRegistros(regs);
        setEtapa("verificando");

        try {
          const check = await api.post("/arquitetos/verificar-duplicatas", { registros: regs });
          setVerificacao(check);
        } catch {
          // Se falhar a verificação, segue sem dados de duplicata
          setVerificacao({ duplicatas: [], novos: regs.length, total: regs.length });
        }

        setEtapa("preview");
      } catch {
        setErroLeitura("Falha ao interpretar o arquivo CSV.");
      }
    };
    reader.onerror = () => setErroLeitura("Erro ao ler o arquivo.");
    reader.readAsText(file, "windows-1252");
  }

  async function handleImportar() {
    setEtapa("importando");
    try {
      const res = await api.post("/arquitetos/importar", { registros });
      setResultado(res);
      setEtapa("resultado");
      onImportado();
    } catch (err) {
      setResultado({ importados: 0, atualizados: 0, ignorados: 0, erros: [{ nome: "—", erro: err.message }] });
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
              <p className="imp-drop-title">Clique para selecionar o arquivo CSV</p>
              <p className="imp-drop-hint">Formato esperado: separado por ponto-e-vírgula (;)</p>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.txt"
                style={{ display: "none" }}
                onChange={handleArquivo}
              />
              {erroLeitura && (
                <p className="imp-erro-texto"><FaExclamationTriangle /> {erroLeitura}</p>
              )}
            </div>
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
                  <strong>{registros.length}</strong> arquiteto{registros.length !== 1 ? "s" : ""} no arquivo
                </span>
              </div>

              {/* Resumo de novos vs duplicatas */}
              <div className="imp-resumo-checks">
                <div className="imp-resumo-item imp-resumo-novo">
                  <FaCheckCircle />
                  <span><strong>{verificacao?.novos ?? registros.length}</strong> novo{(verificacao?.novos ?? registros.length) !== 1 ? "s" : ""} (serão importados)</span>
                </div>
                {temDuplicatas && (
                  <div className="imp-resumo-item imp-resumo-dup">
                    <FaInfoCircle />
                    <span>
                      <strong>{verificacao.duplicatas.length}</strong> duplicado{verificacao.duplicatas.length !== 1 ? "s" : ""} encontrado{verificacao.duplicatas.length !== 1 ? "s" : ""} — não serão reimportados, apenas atualizados se houver informações novas
                    </span>
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
                    {registros.slice(0, 5).map((r, i) => (
                      <tr key={i}>
                        <td>{r.tipo_pessoa || <span className="imp-vazio">—</span>}</td>
                        <td>{r.nome || <span className="imp-vazio">—</span>}</td>
                        <td>{r.cpf_cnpj || <span className="imp-vazio">—</span>}</td>
                        <td>{r.telefone || r.outro_telefone || <span className="imp-vazio">—</span>}</td>
                        <td className="imp-email">{r.email || <span className="imp-vazio">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {registros.length > 5 && (
                <p className="imp-mais">… e mais {registros.length - 5} registros</p>
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
              {resultado.importados === 0 && resultado.atualizados === 0 && resultado.ignorados === 0 && !resultado.erros?.length && (
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
          {etapa === "preview" && (
            <>
              <button className="btn-secondary" onClick={() => { setEtapa("selecionar"); setRegistros([]); setVerificacao(null); }}>
                Trocar arquivo
              </button>
              <button className="btn-primary" onClick={handleImportar}
                disabled={verificacao?.novos === 0 && !temDuplicatas}>
                {verificacao?.novos === 0 && temDuplicatas
                  ? `Atualizar ${verificacao.duplicatas.length} duplicados`
                  : temDuplicatas
                    ? `Importar ${verificacao?.novos} novos e verificar ${verificacao.duplicatas.length} duplicados`
                    : `Importar ${registros.length} arquitetos`}
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
