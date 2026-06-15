import { useEffect, useState, useCallback } from "react";
import { api } from "../services/api";
import TopBar from "../components/TopBar";
import { formatDateBR, todayISO } from "../utils/agendamentos";

const COMBUSTIVEIS = ["flex", "gasolina", "etanol", "diesel", "gnv"];

const FORM_INICIAL = {
  data: todayISO(),
  km_atual: "",
  litros: "",
  valor_total: "",
  combustivel: "flex",
  posto_nome: "",
  observacoes: "",
};

export default function Abastecimento() {
  const [veiculos, setVeiculos] = useState([]);
  const [veiculoId, setVeiculoId] = useState("");
  const [form, setForm] = useState(FORM_INICIAL);
  const [historico, setHistorico] = useState([]);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  useEffect(() => {
    api.get("/veiculos")
      .then((data) => {
        const lista = data.veiculos || [];
        setVeiculos(lista);
        if (lista.length > 0) setVeiculoId(String(lista[0].id));
      })
      .catch((err) => setErro(err.message))
      .finally(() => setLoading(false));
  }, []);

  const carregarHistorico = useCallback(() => {
    if (!veiculoId) { setHistorico([]); return; }
    api.get(`/veiculos/${veiculoId}/abastecimentos`)
      .then((data) => setHistorico((data.abastecimentos || []).slice(0, 5)))
      .catch(() => setHistorico([]));
  }, [veiculoId]);

  useEffect(() => {
    carregarHistorico();
    const veiculo = veiculos.find((v) => String(v.id) === String(veiculoId));
    if (veiculo?.combustivel) {
      setForm((f) => ({ ...f, combustivel: veiculo.combustivel }));
    }
  }, [veiculoId, veiculos, carregarHistorico]);

  function update(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!veiculoId) {
      setErro("Selecione um veículo.");
      return;
    }
    if (!form.km_atual || !form.litros) {
      setErro("Informe ao menos o km atual e os litros abastecidos.");
      return;
    }

    setEnviando(true);
    setErro("");
    setSucesso("");
    try {
      await api.post(`/veiculos/${veiculoId}/abastecimentos`, {
        data: form.data,
        km_atual: Number(form.km_atual),
        litros: Number(form.litros),
        valor_total: form.valor_total ? Number(form.valor_total) : null,
        combustivel: form.combustivel,
        posto_nome: form.posto_nome || null,
        observacoes: form.observacoes || null,
      });
      setSucesso("Abastecimento registrado com sucesso!");
      setForm((f) => ({ ...FORM_INICIAL, combustivel: f.combustivel }));
      carregarHistorico();
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  if (loading) {
    return (
      <>
        <TopBar title="Abastecimento" />
        <div className="page"><div className="spinner-wrap">Carregando...</div></div>
      </>
    );
  }

  return (
    <>
      <TopBar title="Abastecimento" />
      <div className="page">
        {veiculos.length === 0 ? (
          <div className="empty-state">Nenhum veículo cadastrado para a sua empresa.</div>
        ) : (
          <>
            <div className="form-group">
              <label>Veículo</label>
              <select className="input-base" value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)}>
                {veiculos.map((v) => (
                  <option key={v.id} value={v.id}>{v.nome}{v.placa ? ` — ${v.placa}` : ""}</option>
                ))}
              </select>
            </div>

            {erro && <div className="banner banner-danger">{erro}</div>}
            {sucesso && <div className="banner banner-info">{sucesso}</div>}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Data</label>
                <input className="input-base" type="date" value={form.data} onChange={(e) => update("data", e.target.value)} required />
              </div>

              <div className="form-group">
                <label>Km atual (odômetro)</label>
                <input className="input-base" type="number" inputMode="decimal" placeholder="Ex.: 45230" value={form.km_atual} onChange={(e) => update("km_atual", e.target.value)} required />
              </div>

              <div className="form-group">
                <label>Litros abastecidos</label>
                <input className="input-base" type="number" inputMode="decimal" step="0.01" placeholder="Ex.: 32.5" value={form.litros} onChange={(e) => update("litros", e.target.value)} required />
              </div>

              <div className="form-group">
                <label>Valor total (R$)</label>
                <input className="input-base" type="number" inputMode="decimal" step="0.01" placeholder="Ex.: 180.00" value={form.valor_total} onChange={(e) => update("valor_total", e.target.value)} />
              </div>

              <div className="form-group">
                <label>Combustível</label>
                <select className="input-base" value={form.combustivel} onChange={(e) => update("combustivel", e.target.value)}>
                  {COMBUSTIVEIS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label>Posto</label>
                <input className="input-base" type="text" placeholder="Nome do posto" value={form.posto_nome} onChange={(e) => update("posto_nome", e.target.value)} />
              </div>

              <div className="form-group">
                <label>Observações</label>
                <textarea className="input-base" value={form.observacoes} onChange={(e) => update("observacoes", e.target.value)} />
              </div>

              <button type="submit" className="btn btn-primary btn-block" disabled={enviando}>
                {enviando ? "Registrando..." : "Registrar abastecimento"}
              </button>
            </form>

            {historico.length > 0 && (
              <>
                <h3 className="section-title">Últimos registros</h3>
                {historico.map((ab) => (
                  <div className="list-item" key={ab.id}>
                    <div className="list-item-top">
                      <div className="list-item-title">{formatDateBR(String(ab.data).slice(0, 10))}</div>
                      <span className="list-item-time">{ab.litros ? `${ab.litros} L` : ""}</span>
                    </div>
                    <div className="list-item-meta">
                      {ab.km_atual ? `Km: ${ab.km_atual}` : ""}
                      {ab.valor_total ? ` · R$ ${Number(ab.valor_total).toFixed(2)}` : ""}
                    </div>
                    {ab.posto_nome && <div className="list-item-meta">{ab.posto_nome}</div>}
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
