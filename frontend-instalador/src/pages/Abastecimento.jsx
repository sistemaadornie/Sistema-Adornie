import { useEffect, useState, useCallback } from "react";
import { FaCar, FaGasPump } from "react-icons/fa";
import { api } from "../services/api";
import TopBar from "../components/TopBar";
import { formatDateBR, todayISO } from "../utils/agendamentos";

const COMBUSTIVEIS = ["flex", "gasolina", "etanol", "diesel", "gnv"];

const TIPO_LABELS = {
  carro: "Carro", van: "Van", caminhao: "Caminhão", moto: "Moto", outro: "Outro",
};
const COMBUSTIVEL_LABELS = {
  gasolina: "Gasolina", etanol: "Etanol", flex: "Flex", diesel: "Diesel", gnv: "GNV", eletrico: "Elétrico",
};

function calcularNivelCombustivel(veiculo) {
  const { km_atual, ultimo_km_ab, ultimo_litros_ab, media_km_l, capacidade_tanque } = veiculo;
  if (!ultimo_km_ab || !ultimo_litros_ab || !media_km_l) return null;
  const kmDesde = Math.max(0, Number(km_atual || ultimo_km_ab) - Number(ultimo_km_ab));
  const litrosGastos = kmDesde / Number(media_km_l);
  if (capacidade_tanque && Number(capacidade_tanque) > 0) {
    const litrosRestantes = Math.max(0, Number(ultimo_litros_ab) - litrosGastos);
    return Math.max(0, Math.min(100, Math.round((litrosRestantes / Number(capacidade_tanque)) * 100)));
  }
  const autonomia = Number(ultimo_litros_ab) * Number(media_km_l);
  if (autonomia <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((1 - kmDesde / autonomia) * 100)));
}

/* ── VeiculoCard ── */
function VeiculoCard({ veiculo, onAbastecer }) {
  const nivel = calcularNivelCombustivel(veiculo);
  const kmRodados = veiculo.km_rodados
    ? Math.round(Number(veiculo.km_rodados))
    : veiculo.km_rotas > 0 ? Math.round(Number(veiculo.km_rotas)) : null;
  const kmLabel = veiculo.km_rodados ? "Km rodados" : "Km (rotas)";
  const combClass = `vei-badge vei-badge-comb-${veiculo.combustivel || "flex"}`;

  return (
    <div className="vei-card">
      <div className="vei-fuel-bar" title={nivel !== null ? `Combustível: ~${nivel}%` : "Sem dados de combustível"}>
        <div className="vei-fuel-icon"><FaGasPump /></div>
        <div className="vei-fuel-track">
          <div className="vei-fuel-bar-fill" style={{ height: `${nivel ?? 0}%` }} />
        </div>
        <span className="vei-fuel-bar-pct">{nivel !== null ? `${nivel}%` : "—"}</span>
      </div>

      <div className="vei-card-foto">
        {veiculo.foto_url ? (
          <img src={veiculo.foto_url} alt={veiculo.nome} />
        ) : (
          <div className="vei-card-foto-placeholder">
            <FaCar />
            <span>Sem foto</span>
          </div>
        )}
      </div>

      <div className="vei-card-body">
        <p className="vei-card-nome">{veiculo.nome}</p>

        <div className="vei-card-row">
          {veiculo.placa && <span className="vei-placa">{veiculo.placa}</span>}
          <span className="vei-badge vei-badge-tipo">{TIPO_LABELS[veiculo.tipo] || veiculo.tipo}</span>
        </div>

        <div className="vei-card-row">
          <span className={combClass}>{COMBUSTIVEL_LABELS[veiculo.combustivel] || veiculo.combustivel}</span>
          {veiculo.media_km_l && (
            <span className="vei-card-media">
              <strong>{Number(veiculo.media_km_l).toFixed(1)}</strong> km/l
            </span>
          )}
        </div>

        {kmRodados > 0 && (
          <div className="vei-km-row">
            <span className="vei-km-label">{kmLabel}</span>
            <span className="vei-km-value">{kmRodados.toLocaleString("pt-BR")} km</span>
          </div>
        )}

        <button type="button" className="vei-btn-abastecer" onClick={onAbastecer}>
          <FaGasPump />
          Abastecer
        </button>
      </div>
    </div>
  );
}

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
  const [formAberto, setFormAberto] = useState(false);

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
      setFormAberto(false);
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
        <div className="page"><div className="spinner-wrap"><span className="spinner" /> Carregando...</div></div>
      </>
    );
  }

  const veiculoSelecionado = veiculos.find((v) => String(v.id) === String(veiculoId));

  return (
    <>
      <TopBar title="Abastecimento" />
      <div className="page">
        {veiculos.length === 0 ? (
          <div className="empty-state">Nenhum veículo cadastrado para a sua empresa.</div>
        ) : (
          <>
            {veiculos.length > 1 && (
              <div className="form-group">
                <label>Veículo</label>
                <select className="input-base" value={veiculoId} onChange={(e) => { setVeiculoId(e.target.value); setFormAberto(false); }}>
                  {veiculos.map((v) => (
                    <option key={v.id} value={v.id}>{v.nome}{v.placa ? ` — ${v.placa}` : ""}</option>
                  ))}
                </select>
              </div>
            )}

            {veiculoSelecionado && (
              <VeiculoCard veiculo={veiculoSelecionado} onAbastecer={() => setFormAberto(true)} />
            )}

            {erro && <div className="banner banner-danger" style={{ marginTop: 12 }}>{erro}</div>}
            {sucesso && <div className="banner banner-info" style={{ marginTop: 12 }}>{sucesso}</div>}

            {formAberto && (
            <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
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

              <div className="btn-row">
                <button type="button" className="btn" onClick={() => setFormAberto(false)} disabled={enviando}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={enviando}>
                  {enviando ? "Registrando..." : "Registrar abastecimento"}
                </button>
              </div>
            </form>
            )}

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
