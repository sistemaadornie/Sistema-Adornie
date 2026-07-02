import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { FiCamera } from "react-icons/fi";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/TopBar";

function CanvasDraw({ value, onSave }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const lastPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      };
      img.src = value;
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }, [value]);

  function getPos(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches?.[0];
    return {
      x: (touch ? touch.clientX : e.clientX) - rect.left,
      y: (touch ? touch.clientY : e.clientY) - rect.top,
    };
  }

  function startDraw(e) {
    e.preventDefault();
    setIsDrawing(true);
    lastPos.current = getPos(e);
  }

  function draw(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const pos = getPos(e);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  }

  function stopDraw() {
    if (!isDrawing) return;
    setIsDrawing(false);
    onSave(canvasRef.current.toDataURL("image/png"));
  }

  function limpar() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    onSave("");
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={320}
        height={160}
        style={{
          width: "100%", height: 160, touchAction: "none",
          border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", background: "#fff",
        }}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={stopDraw}
      />
      <button type="button" className="btn" style={{ marginTop: 8 }} onClick={limpar}>
        Limpar assinatura
      </button>
    </div>
  );
}

function FotosConferencia({ agendamentoId, itemId, fotos, onFotosEnviadas }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function onChange(e) {
    const arquivos = Array.from(e.target.files || []);
    e.target.value = "";
    if (!arquivos.length || itemId == null) return;
    setEnviando(true);
    setErro("");
    try {
      const fd = new FormData();
      arquivos.forEach((f) => fd.append("arquivos", f));
      const data = await api.post(`/agendamentos/${agendamentoId}/itens/${itemId}/fotos`, fd, true);
      onFotosEnviadas(data.fotos || []);
    } catch (err) {
      setErro(err.message || "Erro ao enviar foto.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Fotos da Conferência</h3>
      <div className="photo-grid">
        {fotos.map((f) => (
          <div className="photo-thumb" key={f.id}>
            <img src={f.url} alt="" />
          </div>
        ))}
        {itemId != null && (
          <label className="upload-btn" style={{ opacity: enviando ? 0.5 : 1, pointerEvents: enviando ? "none" : "auto" }}>
            <FiCamera />
            Adicionar foto
            <input type="file" accept="image/*" capture="environment" multiple onChange={onChange} style={{ display: "none" }} />
          </label>
        )}
      </div>
      {erro && <div className="banner banner-danger" style={{ marginTop: 8 }}>{erro}</div>}
    </div>
  );
}

const DADOS_TECNICOS_VAZIO = {
  largura: "", altura_esq: "", altura_meio: "", altura_dir: "",
  fixacao: "parede", lado_motor: "n/a", voltagem: "sem_motor",
  cortineiro: "não", tamanho_cortineiro: "", afastamento_suportes: "",
  responsavel_conferencia: "", data_conferencia: new Date().toISOString().slice(0, 10),
  acompanhado_por: "", assinatura_tecnico: "",
};

function painelConfeccao(dc, tipo) {
  if (!dc) return [];
  if (tipo === "forro") {
    return [
      ["Tecido do forro", dc.tecidoForro],
      ["Tipo de tecido", dc.tecidoTipo],
      ["Forro costurado", dc.forroCosturado],
      ["Largura do forro", dc.larguraForro],
      ["Largura do trilho", dc.larguraTrilho],
      ["Tipo wave", dc.tipoWave],
      ["Espaçador", dc.espacador],
    ];
  }
  if (tipo === "persiana") {
    return [
      ["Modelo", dc.modelo],
      ["Tubo", dc.tubo],
      ["Bandô/Caixa", dc.bando],
      ["Tecido", dc.tecido],
      ["Modelo Controle", dc.modeloControle],
      ["Modelo Motor", dc.modeloMotor],
      ["Acessórios", (dc.acessorios || []).join(", ")],
      ["Acionamento", dc.acionamento === "motorizado" ? "Motorizado" : dc.acionamento === "manual" ? "Manual" : null],
      ["Qtd Motor", dc.qtdMotor],
    ];
  }
  return [
    ["Tipo wave", dc.tipoWave],
    ["Abertura", dc.abertura],
    ["Componente", dc.componente],
  ];
}

export default function FichaTecnicaInstalador() {
  const { agendamentoId, osId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [osData, setOsData] = useState(null);
  const [dados, setDados] = useState(DADOS_TECNICOS_VAZIO);
  const [itemId, setItemId] = useState(location.state?.itemId ?? null);
  const [fotos, setFotos] = useState(location.state?.fotos ?? []);

  useEffect(() => { carregar(); }, [osId]);

  // Fallback: se a tela foi aberta sem o state de navegação (ex: refresh),
  // descobre o item do agendamento cruzando pedido_item_id com a OS carregada.
  useEffect(() => {
    if (itemId != null || !osData?.pedido_item_id) return;
    api.get(`/agendamentos/${agendamentoId}`)
      .then((data) => {
        const item = (data.agendamento?.itens_raw || [])
          .find((it) => String(it.pedido_item_id) === String(osData.pedido_item_id));
        if (item) {
          setItemId(item.id);
          setFotos(item.fotos || []);
        }
      })
      .catch(() => {});
  }, [itemId, osData, agendamentoId]);

  async function carregar() {
    setLoading(true);
    setErro("");
    try {
      const res = await api.get(`/os/${osId}`);
      setOsData(res);
      if (res.dados_tecnicos) {
        setDados((prev) => ({ ...prev, ...res.dados_tecnicos }));
      } else {
        setDados((prev) => ({ ...prev, responsavel_conferencia: user?.nome_completo || "" }));
      }
    } catch (err) {
      setErro(err.message || "Erro ao carregar ordem de serviço.");
    } finally {
      setLoading(false);
    }
  }

  function setCampo(chave, valor) {
    setDados((prev) => ({ ...prev, [chave]: valor }));
  }

  function voltar() {
    navigate(`/agenda/${agendamentoId}`);
  }

  async function salvar() {
    setErro("");
    const { largura, altura_esq, altura_meio, altura_dir, responsavel_conferencia, data_conferencia, assinatura_tecnico } = dados;
    const parseNum = (v) => parseFloat(String(v).replace(",", "."));

    if (!largura || isNaN(parseNum(largura)) || parseNum(largura) <= 0) {
      setErro("A largura real é obrigatória e deve ser maior que zero.");
      return;
    }
    if (!altura_esq || isNaN(parseNum(altura_esq)) || parseNum(altura_esq) <= 0) {
      setErro("A altura esquerda é obrigatória e deve ser maior que zero.");
      return;
    }
    if (!altura_meio || isNaN(parseNum(altura_meio)) || parseNum(altura_meio) <= 0) {
      setErro("A altura do meio é obrigatória e deve ser maior que zero.");
      return;
    }
    if (!altura_dir || isNaN(parseNum(altura_dir)) || parseNum(altura_dir) <= 0) {
      setErro("A altura direita é obrigatória e deve ser maior que zero.");
      return;
    }
    if (!responsavel_conferencia?.trim()) {
      setErro("O responsável pela conferência é obrigatório.");
      return;
    }
    if (!data_conferencia) {
      setErro("A data da conferência é obrigatória.");
      return;
    }
    if (!assinatura_tecnico?.trim()) {
      setErro("A assinatura do técnico é obrigatória.");
      return;
    }

    setSalvando(true);
    try {
      await api.put(`/os/${osId}`, dados);
      voltar();
    } catch (err) {
      setErro(err.message || "Erro ao salvar ordem de serviço.");
    } finally {
      setSalvando(false);
    }
  }

  if (loading) {
    return (
      <>
        <TopBar title="Conferência Técnica" back />
        <div className="page"><div className="spinner-wrap"><span className="spinner" /> Carregando...</div></div>
      </>
    );
  }

  if (!osData) {
    return (
      <>
        <TopBar title="Conferência Técnica" back />
        <div className="page">
          <div className="banner banner-danger">{erro || "Ordem de serviço não encontrada."}</div>
        </div>
      </>
    );
  }

  if (!osData.dados_conferencia_consultoras) {
    return (
      <>
        <TopBar title="Conferência Técnica" back />
        <div className="page">
          <div className="banner banner-warning">
            Aguardando a Ficha de Conferência Consultoras. A consultora ainda não preencheu a Ficha de Conferência Consultoras deste item, na Etapa 1 do pedido.
          </div>
        </div>
      </>
    );
  }

  const dc = osData.dados_conferencia_consultoras;
  const campos = painelConfeccao(dc, osData.tipo);

  const IMAGEM_TIPO = {
    cortina:  { src: "/cortina.png",  alt: "Esboço da cortina",  largura: dc.larguraTrilho, altura: dc.alturaCortina },
    persiana: { src: "/persiana.png", alt: "Esboço da persiana", largura: osData.item_largura, altura: osData.item_altura },
  };
  const imagem = IMAGEM_TIPO[osData.tipo];

  const motorizada = osData.tipo === "persiana"
    ? dc.acionamento === "motorizado"
    : osData.tipo === "cortina"
      ? /motoriza/i.test(dc.componente || "")
      : false;

  return (
    <>
      <TopBar title="Conferência Técnica" back />
      <div className="page">
        {erro && <div className="banner banner-danger">{erro}</div>}

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Ficha de Conferência Consultoras (referência)</h3>
          {imagem && (
            <div className="ficha-img-col">
              <div className="ficha-spec-box">
                <span className="detail-label">Largura (medida de venda)</span>
                {imagem.largura ? `${imagem.largura} m` : "—"}
              </div>
              <img src={imagem.src} alt={imagem.alt} className="ficha-img-cortina" />
              <div className="ficha-spec-box">
                <span className="detail-label">Altura (medida de venda)</span>
                {imagem.altura ? `${imagem.altura} m` : "—"}
              </div>
            </div>
          )}
          {campos.map(([label, valor]) => (
            <div className="detail-row" key={label}>
              <div>
                <span className="detail-label">{label}</span>
                {valor || "—"}
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Medidas Técnicas Reais</h3>
          <div className="form-group">
            <label>Largura Real (m)</label>
            <input className="input-base" type="text" placeholder="Ex: 4,19" value={dados.largura} onChange={(e) => setCampo("largura", e.target.value)} />
          </div>
          <div className="form-group">
            <label>Altura Esq. (m)</label>
            <input className="input-base" type="text" placeholder="Ex: 3,00" value={dados.altura_esq} onChange={(e) => setCampo("altura_esq", e.target.value)} />
          </div>
          <div className="form-group">
            <label>Altura Meio (m)</label>
            <input className="input-base" type="text" placeholder="Ex: 3,00" value={dados.altura_meio} onChange={(e) => setCampo("altura_meio", e.target.value)} />
          </div>
          <div className="form-group">
            <label>Altura Dir. (m)</label>
            <input className="input-base" type="text" placeholder="Ex: 3,00" value={dados.altura_dir} onChange={(e) => setCampo("altura_dir", e.target.value)} />
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Confirmação</h3>
          <div className="form-group">
            <label>Fixação</label>
            <select className="input-base" value={dados.fixacao} onChange={(e) => setCampo("fixacao", e.target.value)}>
              <option value="parede">Parede</option>
              <option value="teto">Teto</option>
              <option value="vão">Vão</option>
            </select>
          </div>
          {motorizada && (
            <>
              <div className="form-group">
                <label>Lado Motor</label>
                <select className="input-base" value={dados.lado_motor} onChange={(e) => setCampo("lado_motor", e.target.value)}>
                  <option value="n/a">Sem motor</option>
                  <option value="esquerdo">Esquerdo</option>
                  <option value="direito">Direito</option>
                </select>
              </div>
              <div className="form-group">
                <label>Voltagem</label>
                <select className="input-base" value={dados.voltagem} onChange={(e) => setCampo("voltagem", e.target.value)}>
                  <option value="sem_motor">Sem Motor</option>
                  <option value="110v">110V</option>
                  <option value="220v">220V</option>
                </select>
              </div>
            </>
          )}
          <div className="form-group">
            <label>Cortineiro</label>
            <select className="input-base" value={dados.cortineiro} onChange={(e) => setCampo("cortineiro", e.target.value)}>
              <option value="não">Não</option>
              <option value="sim">Sim</option>
            </select>
          </div>
          <div className="form-group">
            <label>Tamanho Cortineiro</label>
            <input className="input-base" type="text" placeholder="Ex: 30cm x 15cm" value={dados.tamanho_cortineiro} disabled={dados.cortineiro === "não"} onChange={(e) => setCampo("tamanho_cortineiro", e.target.value)} />
          </div>
          <div className="form-group">
            <label>Afastamento Suportes (cm)</label>
            <input className="input-base" type="text" placeholder="Ex: 8 cm" value={dados.afastamento_suportes} onChange={(e) => setCampo("afastamento_suportes", e.target.value)} />
          </div>
          <div className="form-group">
            <label>Acompanhado por</label>
            <input className="input-base" type="text" placeholder="Nome do cliente/arquiteto" value={dados.acompanhado_por} onChange={(e) => setCampo("acompanhado_por", e.target.value)} />
          </div>
          <div className="form-group">
            <label>Responsável Conf.</label>
            <input className="input-base" type="text" value={dados.responsavel_conferencia} onChange={(e) => setCampo("responsavel_conferencia", e.target.value)} />
          </div>
          <div className="form-group">
            <label>Data Conferência</label>
            <input className="input-base" type="date" value={dados.data_conferencia} onChange={(e) => setCampo("data_conferencia", e.target.value)} />
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Assinatura do Técnico</h3>
          <CanvasDraw value={dados.assinatura_tecnico} onSave={(val) => setCampo("assinatura_tecnico", val)} />
        </div>

        <FotosConferencia
          agendamentoId={agendamentoId}
          itemId={itemId}
          fotos={fotos}
          onFotosEnviadas={(novasFotos) => setFotos((prev) => [...prev, ...novasFotos])}
        />

        <button className="btn btn-primary btn-block" disabled={salvando} onClick={salvar}>
          {salvando ? "Salvando..." : "✓ Salvar Conferência Técnica"}
        </button>
      </div>
    </>
  );
}
