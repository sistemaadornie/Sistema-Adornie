import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE } from "../services/api";

function formatarCPF(valor) {
  const n = valor.replace(/\D/g, "").slice(0, 11);
  return n.replace(/^(\d{3})(\d)/, "$1.$2")
          .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
          .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export default function Cadastro() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    nome_completo: "", email: "", senha: "", cpf: "", empresa_id: "", setor_id: "",
  });
  const [empresas, setEmpresas] = useState([]);
  const [setores, setSetores] = useState([]);
  const [loadingSetores, setLoadingSetores] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState(false);
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === "cpf" ? formatarCPF(value) : value,
      ...(name === "empresa_id" ? { setor_id: "" } : {}),
    }));
  }

  useEffect(() => {
    fetch(`${API_BASE}/auth/empresas`)
      .then((r) => r.json())
      .then((d) => { if (d.empresas) setEmpresas(d.empresas); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.empresa_id) { setSetores([]); return; }
    setLoadingSetores(true);
    fetch(`${API_BASE}/auth/setores?empresa_id=${form.empresa_id}`)
      .then((r) => r.json())
      .then((d) => setSetores(d.setores || []))
      .catch(() => setSetores([]))
      .finally(() => setLoadingSetores(false));
  }, [form.empresa_id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(""); setErro(false); setLoading(true);

    const cpfLimpo = form.cpf.replace(/\D/g, "");
    if (cpfLimpo.length !== 11) {
      setErro(true); setMsg("Informe um CPF válido com 11 dígitos."); setLoading(false); return;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome_completo: form.nome_completo, email: form.email,
          senha: form.senha, cpf: cpfLimpo,
          empresa_id: Number(form.empresa_id), setor_id: Number(form.setor_id),
          origem: "pwa",
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErro(true); setMsg(data.message || "Erro ao cadastrar."); return; }
      setErro(false);
      setMsg("Cadastro enviado! Aguarde a aprovação do administrador para conseguir entrar.");
      setForm({ nome_completo: "", email: "", senha: "", cpf: "", empresa_id: "", setor_id: "" });
    } catch {
      setErro(true); setMsg("Erro de conexão com o servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-brand">
        <div className="login-glow" />
        <img src="/icon-192.png" alt="Adornie" className="login-logo" />
        <h1 className="page-title" style={{ marginBottom: 4 }}>Cadastro do instalador</h1>
        <p className="page-subtitle">Preencha os dados e aguarde a aprovação do administrador</p>
      </div>

      {msg && <div className={`banner ${erro ? "banner-danger" : "banner-success"}`}>{msg}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Nome completo</label>
          <input className="input-base" type="text" name="nome_completo"
            value={form.nome_completo} onChange={handleChange} required />
        </div>

        <div className="form-group">
          <label>Email</label>
          <input className="input-base" type="email" name="email"
            value={form.email} onChange={handleChange} required />
        </div>

        <div className="form-group">
          <label>CPF</label>
          <input className="input-base" type="text" name="cpf"
            value={form.cpf} onChange={handleChange} maxLength={14} required />
        </div>

        <div className="form-group">
          <label>Senha</label>
          <input className="input-base" type="password" name="senha"
            value={form.senha} onChange={handleChange} required />
        </div>

        <div className="form-group">
          <label>Empresa</label>
          <select className="input-base" name="empresa_id"
            value={form.empresa_id} onChange={handleChange} required>
            <option value="">Selecione a empresa</option>
            {empresas.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.nome_fantasia}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Setor</label>
          <select className="input-base" name="setor_id"
            value={form.setor_id} onChange={handleChange}
            required disabled={!form.empresa_id || loadingSetores}>
            <option value="">
              {!form.empresa_id ? "Selecione a empresa primeiro"
                : loadingSetores ? "Carregando..." : "Selecione o setor"}
            </option>
            {setores.map((s) => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>
        </div>

        <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
          {loading ? "Enviando..." : "Cadastrar"}
        </button>
      </form>

      <p style={{ textAlign: "center", marginTop: 16 }}>
        <Link to="/login">Já tenho conta — entrar</Link>
      </p>
    </div>
  );
}
