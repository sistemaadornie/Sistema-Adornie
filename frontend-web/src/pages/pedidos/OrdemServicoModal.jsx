import { useEffect, useRef, useState } from "react";
import { api } from "../../services/api";
import "./OrdemServicoModal.css";

// --- COMPONENTE INTERATIVO CANVAS ---
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

    // Se já houver um valor salvo (base64), renderiza-o no canvas
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
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const startDraw = (e) => {
    e.preventDefault();
    setIsDrawing(true);
    lastPos.current = getPos(e);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const currentPos = getPos(e);

    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize;
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(currentPos.x, currentPos.y);
    ctx.stroke();

    lastPos.current = currentPos;
  };

  const stopDraw = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    // Salva automaticamente o base64
    const canvas = canvasRef.current;
    const dataUrl = canvas.toDataURL("image/png");
    onSave(dataUrl);
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
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            title="Escolher Cor"
          />
          <select
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            title="Tamanho do Pincel"
          >
            <option value={2}>Fino</option>
            <option value={4}>Médio</option>
            <option value={8}>Grosso</option>
          </select>
          <button type="button" className="os-btn-clear" onClick={clearCanvas}>
            Limpar
          </button>
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

// --- MODAL DA ORDEM DE SERVIÇO ---
export default function OrdemServicoModal({ osId, onClose, onSalvarSucesso }) {
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  // Dados da OS (inclui snapshot do pedido/item)
  const [osData, setOsData] = useState(null);

  // Estado dos dados técnicos (JSONB)
  const [dadosTecnicos, setDadosTecnicos] = useState({
    // ESPECIFICAÇÕES DA CORTINA
    espacador: "",
    bolsas: "",
    modelo: "",
    componente: "",
    abertura: "",
    nivel_chao: "",
    tipo_barra: "",
    modelos_barrado: [], // Array de strings
    obs_barra: "",

    // MEDIDAS TÉCNICAS REAIS (Dados Verdadeiros)
    largura: "",
    altura_esq: "",
    altura_meio: "",
    altura_dir: "",

    // DETALHAMENTO DE FORROS E BLACKOUT
    tecido_principal: "",
    tecido_principal_junto: false,
    forro_tecido: "",
    forro_junto: false,
    forro_franzimento: "",
    forro_obs: "",
    blackout_tecido: "",
    blackout_junto: false,
    blackout_franzimento: "",
    blackout_obs: "",
    xale_tecido: "",
    xale_lado: "",
    xale_modelo: "",
    xale_separado: false,
    xale_tamanho: "",
    xale_obs: "",

    // VALORES TÉCNICOS (Opcional)
    valor_cortina: "",
    valor_forro: "",
    valor_xale: "",

    // CONF. MEDIDA TÉCNICA (Dados Verdadeiros)
    fixacao: "parede",
    lado_motor: "n/a",
    cortineiro: "não",
    afastamento_suportes: "",
    responsavel_conferencia: "",
    data_conferencia: new Date().toISOString().slice(0, 10),
    voltagem: "sem_motor",
    tamanho_cortineiro: "",
    acompanhado_por: "",

    // CANVAS/DESENHOS
    esboco_tecnico: "",
    assinatura_tecnico: "",
    assinatura_cliente: "",
  });

  useEffect(() => {
    carregarOS();
  }, [osId]);

  async function carregarOS() {
    setLoading(true);
    setErro("");
    try {
      const res = await api.get(`/os/${osId}`);
      setOsData(res);
      if (res.dados_tecnicos) {
        // Mescla com valores existentes para garantir retrocompatibilidade de chaves
        setDadosTecnicos((prev) => ({
          ...prev,
          ...res.dados_tecnicos,
        }));
      } else {
        // Inicializa com dados sugeridos vindos do pedido para acelerar preenchimento
        setDadosTecnicos((prev) => ({
          ...prev,
          responsavel_conferencia: res.consultor_nome || "",
          tecido_principal: res.item_cor ? `${res.item_referencia || ""} ${res.item_cor}` : res.item_referencia || "",
          forro_tecido: "",
          blackout_tecido: "",
        }));
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

  function toggleBarrado(modelo) {
    setDadosTecnicos((prev) => {
      const list = prev.modelos_barrado || [];
      if (list.includes(modelo)) {
        return { ...prev, modelos_barrado: list.filter((m) => m !== modelo) };
      } else {
        return { ...prev, modelos_barrado: [...list, modelo] };
      }
    });
  }

  async function salvarOS() {
    setSalvando(false);
    setErro("");
    setSucesso("");

    // Validações locais rigorosas
    const {
      largura,
      altura_esq,
      altura_meio,
      altura_dir,
      responsavel_conferencia,
      data_conferencia,
      assinatura_tecnico,
    } = dadosTecnicos;

    const parseNum = (val) => parseFloat(String(val).replace(",", "."));

    if (!largura || isNaN(parseNum(largura)) || parseNum(largura) <= 0) {
      setErro("A Medida da Largura Técnica Real é obrigatória e deve ser maior que zero.");
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
      setErro("O nome do Responsável pela Conferência Técnica é obrigatório.");
      return;
    }
    if (!data_conferencia) {
      setErro("A data da Conferência Técnica é obrigatória.");
      return;
    }
    if (!assinatura_tecnico?.trim()) {
      setErro("A Assinatura Digital do Técnico Conferencista é obrigatória.");
      return;
    }

    setSalvando(true);
    try {
      await api.put(`/os/${osId}`, dadosTecnicos);
      setSucesso("Ordem de serviço salva com sucesso e validada!");
      setTimeout(() => {
        if (onSalvarSucesso) onSalvarSucesso();
        onClose();
      }, 1500);
    } catch (err) {
      setErro(err.message || "Erro ao salvar ordem de serviço.");
    } finally {
      setSalvando(false);
    }
  }

  if (loading) {
    return (
      <div className="os-modal-overlay">
        <div className="os-modal-box os-modal-loading">
          <div className="os-spinner" />
          <p>Carregando Ficha Técnica da OS...</p>
        </div>
      </div>
    );
  }

  const pedidoNumero = osData?.pedido_numero || osData?.pedido_id;

  return (
    <div className="os-modal-overlay" onClick={onClose}>
      <div className="os-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="os-modal-header">
          <div>
            <h2>Ordem de Serviço Cortina</h2>
            <p>Conferência Técnica e Especificações de Confecção</p>
          </div>
          <button className="os-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        {erro && <div className="os-alert os-alert-danger">{erro}</div>}
        {sucesso && <div className="os-alert os-alert-success">{sucesso}</div>}

        <div className="os-modal-body">
          {/* LAYOUT DUAS COLUNAS */}
          <div className="os-layout-cols">
            
            {/* --- COLUNA ESQUERDA: PRÉ-DADOS VISUAIS (SOMBREAMENTO DE LEITURA) --- */}
            <div className="os-col-left">
              <div className="os-section-title">Dados Originais do Pedido (Visual)</div>
              
              <div className="os-card-visual">
                <div className="os-visual-field">
                  <span className="os-v-label">Cliente:</span>
                  <span className="os-v-value">{osData?.cliente_nome || "—"}</span>
                </div>
                {osData?.cliente_telefone && (
                  <div className="os-visual-field">
                    <span className="os-v-label">📱 Contato:</span>
                    <span className="os-v-value">{osData.cliente_telefone}</span>
                  </div>
                )}
                <div className="os-visual-field">
                  <span className="os-v-label">Pedido:</span>
                  <span className="os-v-value tag-pedido">{pedidoNumero}</span>
                </div>
                <div className="os-visual-field">
                  <span className="os-v-label">Vendedor:</span>
                  <span className="os-v-value">{osData?.consultor_nome || "—"}</span>
                </div>
                {osData?.arquiteto_nome && (
                  <div className="os-visual-field">
                    <span className="os-v-label">Arquiteto:</span>
                    <span className="os-v-value">{osData.arquiteto_nome}</span>
                  </div>
                )}
                
                <hr className="os-divider" />
                
                <div className="os-visual-field">
                  <span className="os-v-label">Ambiente:</span>
                  <span className="os-v-value highlight-text">{osData?.item_ambiente || "—"}</span>
                </div>
                <div className="os-visual-field">
                  <span className="os-v-label">Item Desc:</span>
                  <span className="os-v-value">{osData?.item_descricao || "—"}</span>
                </div>
                <div className="os-visual-field">
                  <span className="os-v-label">Qtd Vendida:</span>
                  <span className="os-v-value">{osData?.item_quantidade} {osData?.item_unidade}</span>
                </div>
                
                <hr className="os-divider" />
                
                <div className="os-visual-field">
                  <span className="os-v-label">Medidas em Venda:</span>
                  <span className="os-v-value spec-box">{osData?.item_medidas || "Sem dimensões de venda"}</span>
                </div>
                <div className="os-visual-field">
                  <span className="os-v-label">Tecido em Venda:</span>
                  <span className="os-v-value spec-box">
                    {osData?.item_referencia || ""} {osData?.item_cor ? `(${osData.item_cor})` : ""}
                  </span>
                </div>
              </div>

              {/* CANVAS DE ESBOÇO TÉCNICO */}
              <div className="os-esboco-section">
                <CanvasDraw
                  title="Esboço Técnico da Cortina (Rabisco)"
                  width={340}
                  height={220}
                  value={dadosTecnicos.esboco_tecnico}
                  onSave={(val) => setField("esboco_tecnico", val)}
                />
              </div>
            </div>

            {/* --- COLUNA DIREITA: DADOS TÉCNICOS VERDADEIROS (EDITÁVEL & OBRIGATÓRIO) --- */}
            <div className="os-col-right-form">
              
              {/* MEDIÇÕES TÉCNICAS REAIS */}
              <div className="os-form-section">
                <div className="os-section-title mandatory-title">Medidas Técnicas Reais (Obrigatório)</div>
                <div className="os-medidas-reais-grid">
                  <div className="os-field">
                    <label>Largura Real (m)</label>
                    <input
                      type="text"
                      placeholder="Ex: 4,19"
                      value={dadosTecnicos.largura}
                      onChange={(e) => setField("largura", e.target.value)}
                      className="input-highlight"
                    />
                  </div>
                  <div className="os-field">
                    <label>Altura Esq. (m)</label>
                    <input
                      type="text"
                      placeholder="Ex: 3,00"
                      value={dadosTecnicos.altura_esq}
                      onChange={(e) => setField("altura_esq", e.target.value)}
                      className="input-highlight"
                    />
                  </div>
                  <div className="os-field">
                    <label>Altura Meio (m)</label>
                    <input
                      type="text"
                      placeholder="Ex: 3,00"
                      value={dadosTecnicos.altura_meio}
                      onChange={(e) => setField("altura_meio", e.target.value)}
                      className="input-highlight"
                    />
                  </div>
                  <div className="os-field">
                    <label>Altura Dir. (m)</label>
                    <input
                      type="text"
                      placeholder="Ex: 3,00"
                      value={dadosTecnicos.altura_dir}
                      onChange={(e) => setField("altura_dir", e.target.value)}
                      className="input-highlight"
                    />
                  </div>
                </div>
              </div>

              {/* CONFIGURAÇÃO TÉCNICA E CONFERÊNCIA */}
              <div className="os-form-section">
                <div className="os-section-title mandatory-title">Confirmação de Medida Técnica (Obrigatório)</div>
                
                <div className="os-grid-2">
                  <div className="os-field">
                    <label>Responsável Conf.</label>
                    <input
                      type="text"
                      placeholder="Nome"
                      value={dadosTecnicos.responsavel_conferencia}
                      onChange={(e) => setField("responsavel_conferencia", e.target.value)}
                      className="input-highlight"
                    />
                  </div>
                  <div className="os-field">
                    <label>Data Conferência</label>
                    <input
                      type="date"
                      value={dadosTecnicos.data_conferencia}
                      onChange={(e) => setField("data_conferencia", e.target.value)}
                      className="input-highlight"
                    />
                  </div>
                </div>

                <div className="os-grid-3">
                  <div className="os-field">
                    <label>Fixação</label>
                    <select
                      value={dadosTecnicos.fixacao}
                      onChange={(e) => setField("fixacao", e.target.value)}
                    >
                      <option value="parede">Parede</option>
                      <option value="teto">Teto</option>
                      <option value="vão">Vão</option>
                    </select>
                  </div>
                  <div className="os-field">
                    <label>Lado Motor</label>
                    <select
                      value={dadosTecnicos.lado_motor}
                      onChange={(e) => setField("lado_motor", e.target.value)}
                    >
                      <option value="n/a">Sem motor</option>
                      <option value="esquerdo">Esquerdo</option>
                      <option value="direito">Direito</option>
                    </select>
                  </div>
                  <div className="os-field">
                    <label>Voltagem</label>
                    <select
                      value={dadosTecnicos.voltagem}
                      onChange={(e) => setField("voltagem", e.target.value)}
                    >
                      <option value="sem_motor">Sem Motor</option>
                      <option value="110v">110V</option>
                      <option value="220v">220V</option>
                    </select>
                  </div>
                </div>

                <div className="os-grid-3">
                  <div className="os-field">
                    <label>Cortineiro</label>
                    <select
                      value={dadosTecnicos.cortineiro}
                      onChange={(e) => setField("cortineiro", e.target.value)}
                    >
                      <option value="não">Não</option>
                      <option value="sim">Sim</option>
                    </select>
                  </div>
                  <div className="os-field">
                    <label>Tamanho Cortineiro</label>
                    <input
                      type="text"
                      placeholder="Ex: 30cm x 15cm"
                      value={dadosTecnicos.tamanho_cortineiro}
                      disabled={dadosTecnicos.cortineiro === "não"}
                      onChange={(e) => setField("tamanho_cortineiro", e.target.value)}
                    />
                  </div>
                  <div className="os-field">
                    <label>Afastamento Sup. (cm)</label>
                    <input
                      type="text"
                      placeholder="Ex: 8 cm"
                      value={dadosTecnicos.afastamento_suportes}
                      onChange={(e) => setField("afastamento_suportes", e.target.value)}
                    />
                  </div>
                </div>

                <div className="os-field">
                  <label>Acompanhado por</label>
                  <input
                    type="text"
                    placeholder="Nome do cliente/arquiteto que acompanhou"
                    value={dadosTecnicos.acompanhado_por}
                    onChange={(e) => setField("acompanhado_por", e.target.value)}
                  />
                </div>
              </div>

              {/* ESPECIFICAÇÃO DE CONFECÇÃO */}
              <div className="os-form-section">
                <div className="os-section-title">Especificação de Confecção (Técnico)</div>
                
                <div className="os-grid-2">
                  <div className="os-field">
                    <label>Componente Trilho</label>
                    <select
                      value={dadosTecnicos.componente}
                      onChange={(e) => setField("componente", e.target.value)}
                    >
                      <option value="">— Selecione —</option>
                      <option value="trilho">Trilho Comum</option>
                      <option value="trilho_motoriz">Trilho Motorizado</option>
                      <option value="varao_19">Varão 19mm</option>
                      <option value="varao_28">Varão 28mm</option>
                      <option value="trilho_cordas">Trilho com Cordas</option>
                    </select>
                  </div>
                  <div className="os-field">
                    <label>Modelo Cortina</label>
                    <select
                      value={dadosTecnicos.modelo}
                      onChange={(e) => setField("modelo", e.target.value)}
                    >
                      <option value="">— Selecione —</option>
                      <option value="wave_p">Wave P</option>
                      <option value="wave_m">Wave M</option>
                      <option value="wave_g">Wave G</option>
                      <option value="prega_macho">Prega Macho</option>
                      <option value="franzida">Franzida</option>
                    </select>
                  </div>
                </div>

                <div className="os-grid-3">
                  <div className="os-field">
                    <label>Espaçador</label>
                    <select
                      value={dadosTecnicos.espacador}
                      onChange={(e) => setField("espacador", e.target.value)}
                    >
                      <option value="">— Selecione —</option>
                      <option value="3.6">3,6</option>
                      <option value="5">5</option>
                      <option value="7">7</option>
                    </select>
                  </div>
                  <div className="os-field">
                    <label>Bolsas (Quantidade)</label>
                    <input
                      type="text"
                      placeholder="Ex: 13 Bolsas"
                      value={dadosTecnicos.bolsas}
                      onChange={(e) => setField("bolsas", e.target.value)}
                    />
                  </div>
                  <div className="os-field">
                    <label>Abertura</label>
                    <select
                      value={dadosTecnicos.abertura}
                      onChange={(e) => setField("abertura", e.target.value)}
                    >
                      <option value="">— Selecione —</option>
                      <option value="sem_abertura">Sem Abertura</option>
                      <option value="central">Central</option>
                    </select>
                  </div>
                </div>

                <div className="os-grid-2">
                  <div className="os-field">
                    <label>Nível do Chão</label>
                    <select
                      value={dadosTecnicos.nivel_chao}
                      onChange={(e) => setField("nivel_chao", e.target.value)}
                    >
                      <option value="">— Selecione —</option>
                      <option value="rente">Rente / Tocando no chão</option>
                      <option value="acima">Acima do chão</option>
                      <option value="arrastando">Arrastando no chão</option>
                    </select>
                  </div>
                  <div className="os-field">
                    <label>Tipo da Barra</label>
                    <select
                      value={dadosTecnicos.tipo_barra}
                      onChange={(e) => setField("tipo_barra", e.target.value)}
                    >
                      <option value="">— Selecione —</option>
                      <option value="barra_simples">Barra Simples</option>
                      <option value="barra_lenço">Barra de Lenço</option>
                      <option value="barrado_standard">Barrado Standard</option>
                      <option value="barrado_aplicado">Barrado Aplicado/Postiço</option>
                    </select>
                  </div>
                </div>

                {/* CHECKBOXES DE MODELOS DE BARRADO */}
                <div className="os-field-checkboxes">
                  <label>Modelos de Barrado</label>
                  <div className="os-checkbox-grid">
                    {["Ponto Palito", "Tôma", "Pesponto", "Simples", "Soutache", "Debrum", "Aplique de Outro Tecido"].map((mod) => (
                      <label key={mod} className="os-checkbox-label">
                        <input
                          type="checkbox"
                          checked={dadosTecnicos.modelos_barrado?.includes(mod)}
                          onChange={() => toggleBarrado(mod)}
                        />
                        {mod}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="os-field">
                  <label>Observações Barra</label>
                  <input
                    type="text"
                    placeholder="Escreva anotações sobre a barra..."
                    value={dadosTecnicos.obs_barra}
                    onChange={(e) => setField("obs_barra", e.target.value)}
                  />
                </div>
              </div>

              {/* DETALHAMENTO DE TECIDO E FORROS */}
              <div className="os-form-section">
                <div className="os-section-title">Detalhamento de Tecidos & Forros</div>
                
                {/* TECIDO PRINCIPAL */}
                <div className="os-box-tecido">
                  <div className="os-grid-2-custom">
                    <div className="os-field">
                      <label>Tecido Cortina Principal</label>
                      <input
                        type="text"
                        placeholder="Nome/código do tecido"
                        value={dadosTecnicos.tecido_principal}
                        onChange={(e) => setField("tecido_principal", e.target.value)}
                      />
                    </div>
                    <div className="os-field-toggle">
                      <label className="os-checkbox-label">
                        <input
                          type="checkbox"
                          checked={dadosTecnicos.tecido_principal_junto}
                          onChange={(e) => setField("tecido_principal_junto", e.target.checked)}
                        />
                        Junto
                      </label>
                    </div>
                  </div>
                </div>

                {/* FORRO */}
                <div className="os-box-tecido">
                  <label className="box-title">Detalhamento Forro</label>
                  <div className="os-grid-3-custom">
                    <div className="os-field">
                      <label>Tecido Forro</label>
                      <input
                        type="text"
                        placeholder="Tecido do forro"
                        value={dadosTecnicos.forro_tecido}
                        onChange={(e) => setField("forro_tecido", e.target.value)}
                      />
                    </div>
                    <div className="os-field">
                      <label>Franzimento Forro</label>
                      <input
                        type="text"
                        placeholder="Ex: Franzido M"
                        value={dadosTecnicos.forro_franzimento}
                        onChange={(e) => setField("forro_franzimento", e.target.value)}
                      />
                    </div>
                    <div className="os-field-toggle">
                      <label className="os-checkbox-label">
                        <input
                          type="checkbox"
                          checked={dadosTecnicos.forro_junto}
                          onChange={(e) => setField("forro_junto", e.target.checked)}
                        />
                        Junto
                      </label>
                    </div>
                  </div>
                  <input
                    type="text"
                    placeholder="Obs forro..."
                    className="os-sub-input"
                    value={dadosTecnicos.forro_obs}
                    onChange={(e) => setField("forro_obs", e.target.value)}
                  />
                </div>

                {/* BLACKOUT */}
                <div className="os-box-tecido">
                  <label className="box-title">Detalhamento Blackout</label>
                  <div className="os-grid-3-custom">
                    <div className="os-field">
                      <label>Tecido Blackout</label>
                      <input
                        type="text"
                        placeholder="Ex: Blackout Cinza 100%"
                        value={dadosTecnicos.blackout_tecido}
                        onChange={(e) => setField("blackout_tecido", e.target.value)}
                      />
                    </div>
                    <div className="os-field">
                      <label>Franzimento Blackout</label>
                      <input
                        type="text"
                        placeholder="Ex: Wave M"
                        value={dadosTecnicos.blackout_franzimento}
                        onChange={(e) => setField("blackout_franzimento", e.target.value)}
                      />
                    </div>
                    <div className="os-field-toggle">
                      <label className="os-checkbox-label">
                        <input
                          type="checkbox"
                          checked={dadosTecnicos.blackout_junto}
                          onChange={(e) => setField("blackout_junto", e.target.checked)}
                        />
                        Junto
                      </label>
                    </div>
                  </div>
                  <input
                    type="text"
                    placeholder="Obs blackout..."
                    className="os-sub-input"
                    value={dadosTecnicos.blackout_obs}
                    onChange={(e) => setField("blackout_obs", e.target.value)}
                  />
                </div>

                {/* XALE */}
                <div className="os-box-tecido">
                  <label className="box-title">Detalhamento Xale</label>
                  <div className="os-grid-2">
                    <div className="os-field">
                      <label>Tecido Xale</label>
                      <input
                        type="text"
                        placeholder="Tecido do xale"
                        value={dadosTecnicos.xale_tecido}
                        onChange={(e) => setField("xale_tecido", e.target.value)}
                      />
                    </div>
                    <div className="os-field">
                      <label>Modelo Xale</label>
                      <input
                        type="text"
                        placeholder="Modelo do xale"
                        value={dadosTecnicos.xale_modelo}
                        onChange={(e) => setField("xale_modelo", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="os-grid-3-custom">
                    <div className="os-field">
                      <label>Lado</label>
                      <select
                        value={dadosTecnicos.xale_lado}
                        onChange={(e) => setField("xale_lado", e.target.value)}
                      >
                        <option value="">— Selecione —</option>
                        <option value="esquerdo">L. Esquerdo</option>
                        <option value="direito">L. Direito</option>
                        <option value="ambos">Ambos lados</option>
                      </select>
                    </div>
                    <div className="os-field">
                      <label>Tamanho Xale</label>
                      <input
                        type="text"
                        placeholder="Largura x Altura"
                        value={dadosTecnicos.xale_tamanho}
                        onChange={(e) => setField("xale_tamanho", e.target.value)}
                      />
                    </div>
                    <div className="os-field-toggle">
                      <label className="os-checkbox-label">
                        <input
                          type="checkbox"
                          checked={dadosTecnicos.xale_separado}
                          onChange={(e) => setField("xale_separado", e.target.checked)}
                        />
                        Separado
                      </label>
                    </div>
                  </div>
                  <input
                    type="text"
                    placeholder="Obs xale..."
                    className="os-sub-input"
                    value={dadosTecnicos.xale_obs}
                    onChange={(e) => setField("xale_obs", e.target.value)}
                  />
                </div>
              </div>

              {/* VALORES CORTINA */}
              <div className="os-form-section">
                <div className="os-section-title">Valores Internos (Opcional)</div>
                <div className="os-grid-3">
                  <div className="os-field">
                    <label>Valor Cortina</label>
                    <input
                      type="text"
                      placeholder="R$ 0,00"
                      value={dadosTecnicos.valor_cortina}
                      onChange={(e) => setField("valor_cortina", e.target.value)}
                    />
                  </div>
                  <div className="os-field">
                    <label>Valor Forro</label>
                    <input
                      type="text"
                      placeholder="R$ 0,00"
                      value={dadosTecnicos.valor_forro}
                      onChange={(e) => setField("valor_forro", e.target.value)}
                    />
                  </div>
                  <div className="os-field">
                    <label>Valor Xale</label>
                    <input
                      type="text"
                      placeholder="R$ 0,00"
                      value={dadosTecnicos.valor_xale}
                      onChange={(e) => setField("valor_xale", e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* CANVAS DE ASSINATURA */}
              <div className="os-form-section">
                <div className="os-section-title mandatory-title">Assinaturas Digitais</div>
                
                <div className="os-signatures-layout">
                  {/* Técnico (Obrigatório) */}
                  <div className="os-signature-box">
                    <CanvasDraw
                      title="Assinatura do Técnico (Obrigatória)"
                      width={310}
                      height={140}
                      value={dadosTecnicos.assinatura_tecnico}
                      onSave={(val) => setField("assinatura_tecnico", val)}
                    />
                  </div>

                  {/* Cliente (Opcional - 1%) */}
                  <div className="os-signature-box">
                    <CanvasDraw
                      title="Visto / Assinatura do Cliente (Opcional)"
                      width={310}
                      height={140}
                      value={dadosTecnicos.assinatura_cliente}
                      onSave={(val) => setField("assinatura_cliente", val)}
                    />
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="os-modal-footer">
          <button type="button" className="os-btn os-btn-secondary" onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button
            type="button"
            className="os-btn os-btn-primary"
            onClick={salvarOS}
            disabled={salvando}
          >
            {salvando ? "Processando e Validando..." : "✓ Salvar & Validar Ordem de Serviço"}
          </button>
        </div>
      </div>
    </div>
  );
}
