import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { api } from "../../services/api";
import "./OrdemServicoModal.css";

function CanvasDraw({ title, width = 360, height = 180, onSave, value }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState("#000000");
  const [brushSize, setBrushSize] = useState(3);
  const lastPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
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

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDraw = (e) => { e.preventDefault(); setIsDrawing(true); lastPos.current = getPos(e); };
  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e);
    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize;
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  };
  const stopDraw = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    onSave(canvasRef.current.toDataURL("image/png"));
  };
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    onSave("");
  };

  return (
    <div className="os-canvas-container">
      <div className="os-canvas-header">
        <label>{title}</label>
        <div className="os-canvas-controls">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} title="Cor" />
          <select value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))}>
            <option value={2}>Fino</option>
            <option value={4}>Médio</option>
            <option value={8}>Grosso</option>
          </select>
          <button type="button" className="os-btn-clear" onClick={clearCanvas}>Limpar</button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={stopDraw}
        style={{ touchAction: "none" }}
      />
    </div>
  );
}

const DADOS_TECNICOS_VAZIO = {
  largura: "", altura_esq: "", altura_meio: "", altura_dir: "",
  fixacao: "parede", lado_motor: "n/a", voltagem: "sem_motor",
  cortineiro: "não", tamanho_cortineiro: "", afastamento_suportes: "",
  responsavel_conferencia: "", data_conferencia: new Date().toISOString().slice(0, 10),
  acompanhado_por: "", esboco_tecnico: "", assinatura_tecnico: "", assinatura_cliente: "",
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
  return [
    ["Cortina feita por", dc.feitaPor],
    ["Espaçador", dc.espacador],
    ["Tipo wave", dc.tipoWave],
    ["Abertura", dc.abertura],
    ["Componente", dc.componente],
    ["Largura do trilho", dc.larguraTrilho],
    ["Largura do tecido", dc.larguraTecido],
    ["Nome do tecido", dc.nomeTecido],
    ["Altura da cortina", dc.alturaCortina],
    ["Vendeu barra aplicada", dc.vendeuBarraAplicada],
  ];
}

export default function OrdemServicoPage() {
  const { osId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const voltarAgendamentoId = location.state?.voltarConferenciaAgendamentoId || null;

  function voltar() {
    if (voltarAgendamentoId) {
      navigate("/agendamentos", { state: { reabrirConferenciaAgendamentoId: voltarAgendamentoId } });
    } else {
      navigate("/pedidos");
    }
  }

  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [osData, setOsData] = useState(null);
  const [dadosTecnicos, setDadosTecnicos] = useState(DADOS_TECNICOS_VAZIO);

  useEffect(() => { carregarOS(); }, [osId]);

  async function carregarOS() {
    setLoading(true);
    setErro("");
    try {
      const res = await api.get(`/os/${osId}`);
      setOsData(res);
      if (res.dados_tecnicos) {
        setDadosTecnicos((prev) => ({ ...prev, ...res.dados_tecnicos }));
      } else {
        setDadosTecnicos((prev) => ({ ...prev, responsavel_conferencia: res.consultor_nome || "" }));
      }
    } catch (err) {
      setErro(err.message || "Erro ao carregar ordem de serviço.");
    } finally {
      setLoading(false);
    }
  }

  function setField(k, v) {
    setDadosTecnicos((prev) => ({ ...prev, [k]: v }));
  }

  async function salvarOS() {
    setErro("");
    setSucesso("");

    const { largura, altura_esq, altura_meio, altura_dir, responsavel_conferencia, data_conferencia, assinatura_tecnico } = dadosTecnicos;
    const parseNum = (val) => parseFloat(String(val).replace(",", "."));

    if (!largura || isNaN(parseNum(largura)) || parseNum(largura) <= 0) {
      setErro("A Largura Técnica Real é obrigatória e deve ser maior que zero.");
      return;
    }
    if (!altura_esq || isNaN(parseNum(altura_esq)) || parseNum(altura_esq) <= 0) {
      setErro("A Altura Esquerda Técnica Real é obrigatória.");
      return;
    }
    if (!altura_meio || isNaN(parseNum(altura_meio)) || parseNum(altura_meio) <= 0) {
      setErro("A Altura do Meio Técnica Real é obrigatória.");
      return;
    }
    if (!altura_dir || isNaN(parseNum(altura_dir)) || parseNum(altura_dir) <= 0) {
      setErro("A Altura Direita Técnica Real é obrigatória.");
      return;
    }
    if (!responsavel_conferencia?.trim()) {
      setErro("O Responsável pela Conferência é obrigatório.");
      return;
    }
    if (!data_conferencia) {
      setErro("A data da Conferência é obrigatória.");
      return;
    }
    if (!assinatura_tecnico?.trim()) {
      setErro("A Assinatura Digital do Técnico é obrigatória.");
      return;
    }

    setSalvando(true);
    try {
      await api.put(`/os/${osId}`, dadosTecnicos);
      setSucesso("Ordem de serviço salva com sucesso!");
      setTimeout(voltar, 1400);
    } catch (err) {
      setErro(err.message || "Erro ao salvar ordem de serviço.");
    } finally {
      setSalvando(false);
    }
  }

  if (loading) {
    return (
      <div className="ek-page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div className="os-spinner" />
          <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Carregando ficha técnica...</p>
        </div>
      </div>
    );
  }

  if (!osData) {
    return (
      <div className="ek-page" style={{ padding: 24 }}>
        <div className="os-alert os-alert-danger">{erro || "Ordem de serviço não encontrada."}</div>
        <button className="os-btn os-btn-secondary" onClick={voltar}>← Voltar</button>
      </div>
    );
  }

  if (!osData.dados_conferencia_consultoras) {
    return (
      <div className="ek-page" style={{ padding: 24 }}>
        <div className="os-alert os-alert-danger" style={{ marginBottom: 16 }}>
          Aguardando a Ficha de Conferência Consultoras. A conferência técnica só pode ser preenchida depois que a consultora preencher a Ficha de Conferência Consultoras deste item, na Etapa 1 do pedido.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="os-btn os-btn-secondary" onClick={voltar}>← Voltar</button>
          <button
            className="os-btn os-btn-primary"
            onClick={() => navigate(`/pedidos/os/${osId}/conferencia-consultoras`, { state: { voltarConferenciaAgendamentoId: voltarAgendamentoId } })}
          >
            Preencher Ficha de Conferência Consultoras
          </button>
        </div>
      </div>
    );
  }

  const pedidoNumero = osData.pedido_numero || osData.pedido_id;
  const dc = osData.dados_conferencia_consultoras;
  const camposConfeccao = painelConfeccao(dc, osData.tipo);
  const motorizada = osData.tipo === "persiana"
    ? dc.acionamento === "motorizado"
    : osData.tipo === "cortina"
      ? /motoriza/i.test(dc.componente || "")
      : false;

  return (
    <div className="ek-page os-page">
      <div className="os-page-header">
        <div className="os-page-header-left">
          <button className="os-back-btn" onClick={voltar}>← Voltar</button>
          <div>
            <h1 className="os-page-title">Conferência Técnica</h1>
            <p className="os-page-subtitle">
              {osData.cliente_nome && <span>{osData.cliente_nome}</span>}
              {pedidoNumero && <span className="os-v-value tag-pedido" style={{ marginLeft: 8 }}>{pedidoNumero}</span>}
              {osData.item_ambiente && <span style={{ marginLeft: 8, color: "var(--color-text-muted)" }}>· {osData.item_ambiente}</span>}
            </p>
          </div>
        </div>
        <div className="os-page-header-right">
          <button className="os-btn os-btn-secondary" onClick={voltar} disabled={salvando}>Cancelar</button>
          <button className="os-btn os-btn-primary" onClick={salvarOS} disabled={salvando}>
            {salvando ? "Salvando..." : "✓ Salvar OS"}
          </button>
        </div>
      </div>

      {erro && <div className="os-alert os-alert-danger" style={{ margin: "0 0 16px" }}>{erro}</div>}
      {sucesso && <div className="os-alert os-alert-success" style={{ margin: "0 0 16px" }}>{sucesso}</div>}

      <div className="os-page-body">
        <div className="os-layout-cols">
          <div className="os-col-left">
            <div className="os-section-title">Ficha de Conferência Consultoras (referência)</div>
            <div className="os-card-visual">
              {camposConfeccao.map(([label, valor]) => (
                <div className="os-visual-field" key={label}>
                  <span className="os-v-label">{label}</span>
                  <span className="os-v-value spec-box">{valor || "—"}</span>
                </div>
              ))}
            </div>

            <div className="os-esboco-section">
              <CanvasDraw
                title="Esboço Técnico"
                width={380}
                height={260}
                value={dadosTecnicos.esboco_tecnico}
                onSave={(val) => setField("esboco_tecnico", val)}
              />
            </div>
          </div>

          <div className="os-col-right-form">
            <div className="os-form-section">
              <div className="os-section-title mandatory-title">Medidas Técnicas Reais (Obrigatório)</div>
              <div className="os-medidas-reais-grid">
                {[
                  { key: "largura", label: "Largura Real (m)", placeholder: "Ex: 4,19" },
                  { key: "altura_esq", label: "Altura Esq. (m)", placeholder: "Ex: 3,00" },
                  { key: "altura_meio", label: "Altura Meio (m)", placeholder: "Ex: 3,00" },
                  { key: "altura_dir", label: "Altura Dir. (m)", placeholder: "Ex: 3,00" },
                ].map(({ key, label, placeholder }) => (
                  <div key={key} className="os-field">
                    <label>{label}</label>
                    <input type="text" placeholder={placeholder} value={dadosTecnicos[key]} onChange={(e) => setField(key, e.target.value)} className="input-highlight" />
                  </div>
                ))}
              </div>
            </div>

            <div className="os-form-section">
              <div className="os-section-title mandatory-title">Confirmação de Medida Técnica (Obrigatório)</div>

              <div className="os-grid-2">
                <div className="os-field">
                  <label>Responsável Conf.</label>
                  <input type="text" placeholder="Nome" value={dadosTecnicos.responsavel_conferencia} onChange={(e) => setField("responsavel_conferencia", e.target.value)} className="input-highlight" />
                </div>
                <div className="os-field">
                  <label>Data Conferência</label>
                  <input type="date" value={dadosTecnicos.data_conferencia} onChange={(e) => setField("data_conferencia", e.target.value)} className="input-highlight" />
                </div>
              </div>

              <div className="os-grid-3">
                <div className="os-field">
                  <label>Fixação</label>
                  <select value={dadosTecnicos.fixacao} onChange={(e) => setField("fixacao", e.target.value)}>
                    <option value="parede">Parede</option>
                    <option value="teto">Teto</option>
                    <option value="vão">Vão</option>
                  </select>
                </div>
                {motorizada && (
                  <>
                    <div className="os-field">
                      <label>Lado Motor</label>
                      <select value={dadosTecnicos.lado_motor} onChange={(e) => setField("lado_motor", e.target.value)}>
                        <option value="n/a">Sem motor</option>
                        <option value="esquerdo">Esquerdo</option>
                        <option value="direito">Direito</option>
                      </select>
                    </div>
                    <div className="os-field">
                      <label>Voltagem</label>
                      <select value={dadosTecnicos.voltagem} onChange={(e) => setField("voltagem", e.target.value)}>
                        <option value="sem_motor">Sem Motor</option>
                        <option value="110v">110V</option>
                        <option value="220v">220V</option>
                      </select>
                    </div>
                  </>
                )}
              </div>

              <div className="os-grid-3">
                <div className="os-field">
                  <label>Cortineiro</label>
                  <select value={dadosTecnicos.cortineiro} onChange={(e) => setField("cortineiro", e.target.value)}>
                    <option value="não">Não</option>
                    <option value="sim">Sim</option>
                  </select>
                </div>
                <div className="os-field">
                  <label>Tamanho Cortineiro</label>
                  <input type="text" placeholder="Ex: 30cm x 15cm" value={dadosTecnicos.tamanho_cortineiro} disabled={dadosTecnicos.cortineiro === "não"} onChange={(e) => setField("tamanho_cortineiro", e.target.value)} />
                </div>
                <div className="os-field">
                  <label>Afastamento Sup. (cm)</label>
                  <input type="text" placeholder="Ex: 8 cm" value={dadosTecnicos.afastamento_suportes} onChange={(e) => setField("afastamento_suportes", e.target.value)} />
                </div>
              </div>

              <div className="os-field">
                <label>Acompanhado por</label>
                <input type="text" placeholder="Nome do cliente/arquiteto que acompanhou" value={dadosTecnicos.acompanhado_por} onChange={(e) => setField("acompanhado_por", e.target.value)} />
              </div>
            </div>

            <div className="os-form-section">
              <div className="os-section-title mandatory-title">Assinaturas Digitais</div>
              <div className="os-signatures-layout">
                <CanvasDraw
                  title="Assinatura do Técnico (Obrigatória)"
                  width={420}
                  height={160}
                  value={dadosTecnicos.assinatura_tecnico}
                  onSave={(val) => setField("assinatura_tecnico", val)}
                />
                <CanvasDraw
                  title="Visto do Cliente (Opcional)"
                  width={420}
                  height={160}
                  value={dadosTecnicos.assinatura_cliente}
                  onSave={(val) => setField("assinatura_cliente", val)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
