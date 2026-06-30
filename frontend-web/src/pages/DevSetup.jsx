import { useState } from "react";
import { API_BASE } from "../services/api";
import AdornieWordmark from "../components/AdornieWordmark";
import "./DevSetup.css";

const DEV_PIN = "adornie@dev";

function maskCNPJ(v) {
  v = v.replace(/\D/g, "").slice(0, 14);
  if (v.length <= 2)  return v;
  if (v.length <= 5)  return `${v.slice(0,2)}.${v.slice(2)}`;
  if (v.length <= 8)  return `${v.slice(0,2)}.${v.slice(2,5)}.${v.slice(5)}`;
  if (v.length <= 12) return `${v.slice(0,2)}.${v.slice(2,5)}.${v.slice(5,8)}/${v.slice(8)}`;
  return `${v.slice(0,2)}.${v.slice(2,5)}.${v.slice(5,8)}/${v.slice(8,12)}-${v.slice(12)}`;
}

function maskCPF(v) {
  v = v.replace(/\D/g, "").slice(0, 11);
  if (v.length <= 3)  return v;
  if (v.length <= 6)  return `${v.slice(0,3)}.${v.slice(3)}`;
  if (v.length <= 9)  return `${v.slice(0,3)}.${v.slice(3,6)}.${v.slice(6)}`;
  return `${v.slice(0,3)}.${v.slice(3,6)}.${v.slice(6,9)}-${v.slice(9)}`;
}

function maskPhone(v) {
  v = v.replace(/\D/g, "").slice(0, 11);
  if (v.length <= 2)  return `(${v}`;
  if (v.length <= 6)  return `(${v.slice(0,2)}) ${v.slice(2)}`;
  if (v.length <= 10) return `(${v.slice(0,2)}) ${v.slice(2,6)}-${v.slice(6)}`;
  return `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
}

const emptyForm = {
  nome_fantasia: "",
  razao_social: "",
  cnpj: "",
  telefone: "",
  email_empresa: "",
  nome_responsavel: "",
  email_responsavel: "",
  cpf_responsavel: "",
  senha: "",
};

export default function DevSetup() {
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [pinErro, setPinErro] = useState("");

  const [empresas, setEmpresas] = useState([]);
  const [loadingEmpresas, setLoadingEmpresas] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState("");
  const [tipoMsg, setTipoMsg] = useState("");
  const [form, setForm] = useState(emptyForm);

  function handlePin(e) {
    e.preventDefault();
    if (pin === DEV_PIN) {
      setUnlocked(true);
      carregarEmpresas();
    } else {
      setPinErro("PIN incorreto.");
      setTimeout(() => setPinErro(""), 2000);
    }
  }

  async function carregarEmpresas() {
    setLoadingEmpresas(true);
    try {
      const res = await fetch(`${API_BASE}/auth/empresas`, {
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.ok && data.empresas?.length > 0) {
        setEmpresas(data.empresas);
        setShowForm(false);
      } else {
        setShowForm(true);
      }
    } catch {
      setShowForm(true);
    } finally {
      setLoadingEmpresas(false);
    }
  }

  async function criarEmpresa(e) {
    e.preventDefault();
    setLoadingEmpresas(true);
    setMsg("");
    try {
      const res = await fetch(`${API_BASE}/auth/register-empresa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        setEmpresas((prev) => [...prev, data.empresa]);
        setForm(emptyForm);
        setShowForm(false);
        setTipoMsg("success");
        setMsg(`✓ "${data.empresa.nome_fantasia}" criada com sucesso!`);
        setTimeout(() => setMsg(""), 4000);
      } else {
        setTipoMsg("error");
        setMsg(data.message || "Erro ao criar empresa.");
      }
    } catch {
      setTipoMsg("error");
      setMsg("Erro de conexão com o servidor.");
    } finally {
      setLoadingEmpresas(false);
    }
  }

  if (!unlocked) {
    return (
      <div className="dev-lock">
        <div className="dev-lock-box">
          <img src="/logo-adornie.png" alt="Adornie" className="dev-lock-logo" />
          <h1 className="dev-lock-title">Área Restrita</h1>
          <p className="dev-lock-sub">Configuração do desenvolvedor</p>

          <form onSubmit={handlePin} className="dev-lock-form">
            <input
              type="password"
              className="dev-lock-input"
              placeholder="Digite o PIN de acesso"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoFocus
              autoComplete="off"
            />
            {pinErro && <span className="dev-lock-erro">{pinErro}</span>}
            <button type="submit" className="dev-lock-btn">Acessar</button>
          </form>

          <a href="/" className="dev-lock-back">← Voltar ao site</a>
        </div>
      </div>
    );
  }

  return (
    <div className="dev-page">
      <header className="dev-header">
        <div className="dev-header-logo">
          <img src="/logo-adornie.png" alt="Adornie" />
          <div>
            <span className="dev-header-sub">agenda</span>
            <AdornieWordmark className="dev-header-main-img" />
          </div>
        </div>
        <div className="dev-header-badge">⚙ Dev Setup</div>
      </header>

      <main className="dev-main">

        {/* STATUS EMPRESAS */}
        <section className="dev-section">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h2 className="dev-section-title" style={{ marginBottom: 0 }}>
              Empresas {empresas.length > 0 && <span style={{ fontSize: "0.75em", color: "#888", fontWeight: 400 }}>({empresas.length} cadastrada{empresas.length > 1 ? "s" : ""})</span>}
            </h2>
            {empresas.length > 0 && !showForm && (
              <button
                className="dev-submit"
                style={{ marginTop: 0, padding: "8px 18px", fontSize: "0.9em" }}
                onClick={() => { setShowForm(true); setMsg(""); }}
              >
                + Nova filial
              </button>
            )}
          </div>

          {loadingEmpresas && <div className="dev-loading">Verificando…</div>}

          {msg && <div className={`dev-msg ${tipoMsg}`}>{msg}</div>}

          {!loadingEmpresas && empresas.length === 0 && !showForm && (
            <div className="dev-status-card pending">
              <div className="dev-status-icon">!</div>
              <div>
                <div className="dev-status-label">Nenhuma empresa cadastrada</div>
                <div className="dev-status-meta">Preencha o formulário abaixo para criar a primeira empresa.</div>
              </div>
            </div>
          )}

          {empresas.map((emp, i) => (
            <div key={emp.id} className="dev-status-card ok" style={{ marginBottom: 8 }}>
              <div className="dev-status-icon">✓</div>
              <div>
                <div className="dev-status-label">{i === 0 ? "Empresa principal" : `Filial ${i}`}</div>
                <div className="dev-status-value">{emp.nome_fantasia}</div>
                <div className="dev-status-meta">ID: {emp.id} · {emp.email}</div>
              </div>
            </div>
          ))}
        </section>

        {/* FORMULÁRIO CRIAR EMPRESA */}
        {showForm && (
          <section className="dev-section">
            <h2 className="dev-section-title">
              {empresas.length === 0 ? "Criar empresa" : "Criar filial"}
            </h2>

            <form onSubmit={criarEmpresa} className="dev-form">
              <div className="dev-form-grid">
                <div className="dev-field">
                  <label>Nome fantasia *</label>
                  <input value={form.nome_fantasia} onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })} placeholder="Ex: Adornie Brasil" required />
                </div>
                <div className="dev-field">
                  <label>Razão social</label>
                  <input value={form.razao_social} onChange={(e) => setForm({ ...form, razao_social: e.target.value })} />
                </div>
                <div className="dev-field">
                  <label>CNPJ *</label>
                  <input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: maskCNPJ(e.target.value) })} placeholder="00.000.000/0001-00" required />
                </div>
                <div className="dev-field">
                  <label>Telefone *</label>
                  <input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: maskPhone(e.target.value) })} placeholder="(00) 00000-0000" required />
                </div>
                <div className="dev-field span-2">
                  <label>E-mail da empresa *</label>
                  <input type="email" value={form.email_empresa} onChange={(e) => setForm({ ...form, email_empresa: e.target.value })} required />
                </div>
              </div>
              <h3 className="dev-section-subtitle">Administrador principal</h3>
              <div className="dev-form-grid">
                <div className="dev-field">
                  <label>Nome completo *</label>
                  <input value={form.nome_responsavel} onChange={(e) => setForm({ ...form, nome_responsavel: e.target.value })} required />
                </div>
                <div className="dev-field">
                  <label>CPF *</label>
                  <input value={form.cpf_responsavel} onChange={(e) => setForm({ ...form, cpf_responsavel: maskCPF(e.target.value) })} placeholder="000.000.000-00" required />
                </div>
                <div className="dev-field">
                  <label>E-mail *</label>
                  <input type="email" value={form.email_responsavel} onChange={(e) => setForm({ ...form, email_responsavel: e.target.value })} required />
                </div>
                <div className="dev-field">
                  <label>Senha *</label>
                  <input type="password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} required />
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <button type="submit" className="dev-submit" style={{ marginTop: 0 }} disabled={loadingEmpresas}>
                  {loadingEmpresas ? "Criando…" : empresas.length === 0 ? "Criar empresa" : "Criar filial"}
                </button>
                {empresas.length > 0 && (
                  <button
                    type="button"
                    onClick={() => { setShowForm(false); setMsg(""); }}
                    style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: "0.9em" }}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </section>
        )}

        {/* INSTRUÇÕES */}
        <section className="dev-section">
          <h2 className="dev-section-title">Próximos passos</h2>
          <div className="dev-steps">
            <div className={`dev-step ${empresas.length > 0 ? "done" : ""}`}>
              <span className="dev-step-num">{empresas.length > 0 ? "✓" : "1"}</span>
              <div>
                <strong>Criar a empresa e o admin</strong>
                <p>Preencha o formulário acima. A empresa é criada com os 4 setores padrão e o responsável já recebe acesso total (ADMIN_MASTER). Para filiais, clique em <strong>+ Nova filial</strong>.</p>
              </div>
            </div>
            <div className="dev-step">
              <span className="dev-step-num">2</span>
              <div>
                <strong>Fazer login com o admin</strong>
                <p>Acesse <a href="/login">/login</a> com o e-mail e senha do responsável cadastrado acima.</p>
              </div>
            </div>
            <div className="dev-step">
              <span className="dev-step-num">3</span>
              <div>
                <strong>Configurar expediente</strong>
                <p>No sistema, acesse <strong>Expediente</strong> para definir a jornada de trabalho da equipe.</p>
              </div>
            </div>
            <div className="dev-step">
              <span className="dev-step-num">4</span>
              <div>
                <strong>Convidar a equipe</strong>
                <p>Cada funcionário acessa <a href="/solicitar-acesso">/solicitar-acesso</a> para solicitar entrada. O admin aprova e atribui o setor pelo painel de Usuários.</p>
              </div>
            </div>
          </div>
        </section>

        {/* INFO PIN */}
        <section className="dev-section">
          <h2 className="dev-section-title">Segurança</h2>
          <div className="dev-info-box">
            <p>O PIN de acesso está definido no arquivo <code>src/pages/DevSetup.jsx</code>, linha 4.</p>
            <p>Esta página não aparece em nenhum link público do sistema. A URL <code>/dev</code> é de conhecimento exclusivo do desenvolvedor.</p>
            <p style={{ marginTop: 8 }}>Para alterar o PIN: abra o arquivo e mude o valor de <code>DEV_PIN</code>.</p>
          </div>
        </section>

      </main>
    </div>
  );
}
