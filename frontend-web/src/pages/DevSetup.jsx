import { useState } from "react";
import { API_BASE } from "../services/api";
import "./DevSetup.css";

const DEV_PIN = "adornie@dev";

export default function DevSetup() {
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [pinErro, setPinErro] = useState("");

  // Estado da empresa
  const [empresa, setEmpresa] = useState(null);
  const [loadingEmpresa, setLoadingEmpresa] = useState(false);
  const [msgEmpresa, setMsgEmpresa] = useState("");
  const [tipoMsgEmpresa, setTipoMsgEmpresa] = useState("");

  // Formulário empresa
  const [form, setForm] = useState({
    nome_fantasia: "Adornie Home Decor",
    razao_social: "Adornie Home Decor LTDA",
    cnpj: "",
    telefone: "",
    email: "contato@adornie.com.br",
  });

  function handlePin(e) {
    e.preventDefault();
    if (pin === DEV_PIN) {
      setUnlocked(true);
      verificarEmpresa();
    } else {
      setPinErro("PIN incorreto.");
      setTimeout(() => setPinErro(""), 2000);
    }
  }

  async function verificarEmpresa() {
    setLoadingEmpresa(true);
    try {
      const res = await fetch(`${API_BASE}/auth/empresas`, {
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.ok && data.empresas?.length > 0) {
        setEmpresa(data.empresas[0]);
      }
    } catch {
      // sem empresa cadastrada ainda
    } finally {
      setLoadingEmpresa(false);
    }
  }

  async function criarEmpresa(e) {
    e.preventDefault();
    setLoadingEmpresa(true);
    setMsgEmpresa("");
    try {
      const res = await fetch(`${API_BASE}/auth/register-empresa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        setEmpresa(data.empresa);
        setTipoMsgEmpresa("success");
        setMsgEmpresa("✓ Empresa criada com sucesso!");
      } else {
        setTipoMsgEmpresa("error");
        setMsgEmpresa(data.message || "Erro ao criar empresa.");
      }
    } catch {
      setTipoMsgEmpresa("error");
      setMsgEmpresa("Erro de conexão com o servidor.");
    } finally {
      setLoadingEmpresa(false);
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
            <span className="dev-header-main">Adornie</span>
          </div>
        </div>
        <div className="dev-header-badge">⚙ Dev Setup</div>
      </header>

      <main className="dev-main">

        {/* STATUS EMPRESA */}
        <section className="dev-section">
          <h2 className="dev-section-title">Empresa</h2>

          {loadingEmpresa && (
            <div className="dev-loading">Verificando…</div>
          )}

          {empresa && !loadingEmpresa && (
            <div className="dev-status-card ok">
              <div className="dev-status-icon">✓</div>
              <div>
                <div className="dev-status-label">Empresa cadastrada</div>
                <div className="dev-status-value">{empresa.nome_fantasia}</div>
                <div className="dev-status-meta">ID: {empresa.id} · {empresa.email}</div>
              </div>
            </div>
          )}

          {!empresa && !loadingEmpresa && (
            <div className="dev-status-card pending">
              <div className="dev-status-icon">!</div>
              <div>
                <div className="dev-status-label">Nenhuma empresa cadastrada</div>
                <div className="dev-status-meta">Preencha o formulário abaixo para criar a Adornie no sistema.</div>
              </div>
            </div>
          )}
        </section>

        {/* CRIAR EMPRESA */}
        {!empresa && !loadingEmpresa && (
          <section className="dev-section">
            <h2 className="dev-section-title">Criar empresa Adornie</h2>

            {msgEmpresa && (
              <div className={`dev-msg ${tipoMsgEmpresa}`}>{msgEmpresa}</div>
            )}

            <form onSubmit={criarEmpresa} className="dev-form">
              <div className="dev-form-grid">
                <div className="dev-field">
                  <label>Nome fantasia *</label>
                  <input value={form.nome_fantasia} onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })} required />
                </div>
                <div className="dev-field">
                  <label>Razão social *</label>
                  <input value={form.razao_social} onChange={(e) => setForm({ ...form, razao_social: e.target.value })} required />
                </div>
                <div className="dev-field">
                  <label>CNPJ</label>
                  <input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0001-00" />
                </div>
                <div className="dev-field">
                  <label>Telefone</label>
                  <input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="(00) 00000-0000" />
                </div>
                <div className="dev-field span-2">
                  <label>E-mail</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
              </div>
              <button type="submit" className="dev-submit" disabled={loadingEmpresa}>
                {loadingEmpresa ? "Criando…" : "Criar empresa"}
              </button>
            </form>
          </section>
        )}

        {/* INSTRUÇÕES */}
        <section className="dev-section">
          <h2 className="dev-section-title">Próximos passos</h2>
          <div className="dev-steps">
            <div className={`dev-step ${empresa ? "done" : ""}`}>
              <span className="dev-step-num">{empresa ? "✓" : "1"}</span>
              <div>
                <strong>Criar a empresa Adornie</strong>
                <p>Cadastra o CNPJ e dados da empresa no sistema.</p>
              </div>
            </div>
            <div className="dev-step">
              <span className="dev-step-num">2</span>
              <div>
                <strong>Criar o primeiro admin</strong>
                <p>Acesse <a href="/cadastro-usuario">/cadastro-usuario</a> e registre o administrador principal. Depois aprove e atribua a permissão ADMIN_MASTER pelo painel de Usuários.</p>
              </div>
            </div>
            <div className="dev-step">
              <span className="dev-step-num">3</span>
              <div>
                <strong>Configurar setores e expediente</strong>
                <p>Com o admin criado, acesse <strong>Expediente</strong> no sistema para configurar jornada de trabalho e setores.</p>
              </div>
            </div>
            <div className="dev-step">
              <span className="dev-step-num">4</span>
              <div>
                <strong>Convidar equipe</strong>
                <p>Cada funcionário acessa <a href="/solicitar-acesso">/solicitar-acesso</a> e o admin aprova pelo painel.</p>
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
