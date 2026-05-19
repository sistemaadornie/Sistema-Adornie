import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { FaCar, FaEdit, FaTrash, FaPlus, FaSearch, FaCamera, FaMapMarkerAlt, FaGasPump, FaTachometerAlt } from "react-icons/fa";
import useVeiculos from "./hooks/useVeiculos";
import ConfirmModal from "../../components/ConfirmModal";
import { api } from "../../services/api";
import useAuth from "../../hooks/useAuth";
import "./Veiculos.css";

function isInstaladorPuro(user) {
  const altas = ["COMERCIAL","OPERADOR_AGENDA","ADMIN_MASTER","GESTOR_USUARIOS"];
  return user?.permissoes?.includes("INSTALADOR") && !altas.some((p) => user?.permissoes?.includes(p));
}

/* ── CONSTANTES ── */
const TIPOS = [
  { value: "carro",    label: "Carro" },
  { value: "van",      label: "Van" },
  { value: "caminhao", label: "Caminhão" },
  { value: "moto",     label: "Moto" },
  { value: "outro",    label: "Outro" },
];

const COMBUSTIVEIS = [
  { value: "gasolina", label: "Gasolina" },
  { value: "etanol",   label: "Etanol" },
  { value: "flex",     label: "Flex" },
  { value: "diesel",   label: "Diesel" },
  { value: "gnv",      label: "GNV" },
  { value: "eletrico", label: "Elétrico" },
];

function labelTipo(v) {
  return TIPOS.find((t) => t.value === v)?.label ?? v;
}

function labelCombustivel(v) {
  return COMBUSTIVEIS.find((c) => c.value === v)?.label ?? v;
}

/* ── COMPONENTE PRINCIPAL ── */
export default function Veiculos() {
  const { user } = useAuth();
  const instalador = isInstaladorPuro(user);
  const { veiculos, loading, erro, carregar, criar, atualizar, excluir } = useVeiculos();

  const [busca,         setBusca]         = useState("");
  const [modal,              setModal]              = useState(null);  // null | "novo" | veiculo
  const [modalPartida,       setModalPartida]       = useState(null);  // null | veiculo
  const [modalAbastecimento, setModalAbastecimento] = useState(null);  // null | veiculo
  const [modalKmManual,      setModalKmManual]      = useState(null);  // null | veiculo
  const [salvando,      setSalvando]      = useState(false);
  const [excluindoId,   setExcluindoId]   = useState(null);
  const [confirmEx,     setConfirmEx]     = useState(null);  // id a excluir
  const [toast,         setToast]         = useState({ texto: "", tipo: "" });

  function mostrarToast(texto, tipo = "success") {
    setToast({ texto, tipo });
    setTimeout(() => setToast({ texto: "", tipo: "" }), 3500);
  }

  const veiculosFiltrados = useMemo(() => {
    if (!busca.trim()) return veiculos;
    const b = busca.toLowerCase();
    return veiculos.filter(
      (v) =>
        v.nome.toLowerCase().includes(b) ||
        (v.placa || "").toLowerCase().includes(b)
    );
  }, [veiculos, busca]);

  async function handleSalvar(formData) {
    setSalvando(true);
    try {
      if (modal === "novo") {
        await criar(formData);
        mostrarToast("Veículo cadastrado com sucesso!");
      } else {
        await atualizar(modal.id, formData);
        mostrarToast("Veículo atualizado!");
      }
      setModal(null);
    } catch (e) {
      mostrarToast(e.message || "Erro ao salvar.", "error");
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarExclusao() {
    const id = confirmEx;
    setConfirmEx(null);
    setExcluindoId(id);
    try {
      await excluir(id);
      mostrarToast("Veículo removido.");
    } catch (e) {
      mostrarToast(e.message || "Erro ao excluir.", "error");
    } finally {
      setExcluindoId(null);
    }
  }

  return (
    <div className="ek-page">
      {/* HEADER */}
      <div className="ek-head">
        <div className="ek-head-info">
          <h1>Veículos</h1>
          <p>{instalador ? "Consulte informações e registre abastecimentos" : "Gerencie os veículos da empresa"}</p>
        </div>
        <div className="ek-head-actions">
          <Link to="/veiculos/historico" className="ek-btn ek-btn-secondary">
            Histórico
          </Link>
          {!instalador && (
            <button className="ek-btn ek-btn-primary" onClick={() => setModal("novo")}>
              <FaPlus /> Novo veículo
            </button>
          )}
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="ek-toolbar" style={{ marginBottom: 20 }}>
        <div className="ek-toolbar-group">
          <div style={{ position: "relative" }}>
            <FaSearch style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-secondary)", fontSize: 13 }} />
            <input
              style={{ paddingLeft: 32 }}
              className="ek-search"
              placeholder="Buscar por nome ou placa..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* CONTEÚDO */}
      {loading ? (
        <div className="ek-empty">Carregando veículos...</div>
      ) : erro ? (
        <div className="ek-empty" style={{ color: "var(--color-danger)" }}>{erro}</div>
      ) : veiculosFiltrados.length === 0 ? (
        <div className="ek-empty">
          {busca ? "Nenhum veículo encontrado." : "Nenhum veículo cadastrado ainda."}
        </div>
      ) : (
        <div className="vei-grid">
          {veiculosFiltrados.map((v) => (
            <VeiculoCard
              key={v.id}
              veiculo={v}
              excluindo={excluindoId === v.id}
              instalador={instalador}
              onEditar={() => setModal(v)}
              onExcluir={() => setConfirmEx(v.id)}
              onPartida={() => setModalPartida(v)}
              onAbastecer={() => setModalAbastecimento(v)}
              onAtualizarKm={() => setModalKmManual(v)}
            />
          ))}
        </div>
      )}

      {/* MODAL EDITAR (oculto para instaladores) */}
      {modal && !instalador && (
        <VeiculoModal
          veiculo={modal === "novo" ? null : modal}
          salvando={salvando}
          onClose={() => setModal(null)}
          onSalvar={handleSalvar}
        />
      )}

      {/* MODAL ENDEREÇOS DE PARTIDA */}
      {modalPartida && (
        <ModalEnderecosPartida
          veiculo={modalPartida}
          onClose={() => setModalPartida(null)}
        />
      )}

      {/* MODAL ABASTECIMENTO */}
      {modalAbastecimento && (
        <ModalAbastecimento
          veiculo={modalAbastecimento}
          onClose={() => setModalAbastecimento(null)}
          onSalvo={() => { mostrarToast("Abastecimento registrado!"); setModalAbastecimento(null); carregar(); }}
        />
      )}

      {/* MODAL ODÔMETRO MANUAL */}
      {modalKmManual && (
        <ModalKmManual
          veiculo={modalKmManual}
          onClose={() => setModalKmManual(null)}
          onSalvo={() => { mostrarToast("Odômetro atualizado!"); setModalKmManual(null); carregar(); }}
        />
      )}

      {/* CONFIRM EXCLUIR */}
      <ConfirmModal
        open={confirmEx !== null}
        titulo="Excluir veículo"
        mensagem="Esta ação não pode ser desfeita. Deseja realmente excluir este veículo?"
        labelConfirm="Excluir"
        variante="danger"
        onConfirm={confirmarExclusao}
        onCancel={() => setConfirmEx(null)}
      />

      {/* TOAST */}
      {toast.texto && (
        <div
          className={`ek-toast${toast.tipo === "error" ? " ek-toast-error" : ""}`}
          style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 9999,
            background: toast.tipo === "error" ? "var(--color-danger, #dc2626)" : "var(--color-primary)",
            color: "#fff", padding: "10px 18px", borderRadius: "var(--radius-sm)",
            fontSize: 13, fontWeight: 600, boxShadow: "var(--shadow-md)",
          }}
        >
          {toast.texto}
        </div>
      )}
    </div>
  );
}

/* ── CARD ── */
function calcularNivelCombustivel(veiculo) {
  const { km_atual, ultimo_km_ab, ultimo_litros_ab, media_km_l, capacidade_tanque } = veiculo;
  if (!ultimo_km_ab || !ultimo_litros_ab || !media_km_l) return null;
  const kmDesde     = Math.max(0, Number(km_atual || ultimo_km_ab) - Number(ultimo_km_ab));
  const litrosGastos = kmDesde / Number(media_km_l);
  if (capacidade_tanque && Number(capacidade_tanque) > 0) {
    // Com capacidade do tanque: mostra litros restantes em relação ao tanque cheio
    const litrosRestantes = Math.max(0, Number(ultimo_litros_ab) - litrosGastos);
    return Math.max(0, Math.min(100, Math.round((litrosRestantes / Number(capacidade_tanque)) * 100)));
  }
  // Sem capacidade: autonomia estimada a partir do último abastecimento
  const autonomia = Number(ultimo_litros_ab) * Number(media_km_l);
  if (autonomia <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((1 - kmDesde / autonomia) * 100)));
}

function VeiculoCard({ veiculo, excluindo, instalador, onEditar, onExcluir, onPartida, onAbastecer, onAtualizarKm }) {
  const combClass = `vei-badge vei-badge-comb-${veiculo.combustivel || "flex"}`;
  const nivel     = calcularNivelCombustivel(veiculo);
  const nivelCor  = nivel === null ? "var(--color-border-strong)"
    : nivel > 50 ? "#22c55e"
    : nivel > 25 ? "#f59e0b"
    : "#ef4444";

  // km_rodados = via abastecimentos (odômetro manual); km_rotas = acumulado pelo mapa
  const kmRodados = veiculo.km_rodados
    ? Math.round(Number(veiculo.km_rodados))
    : veiculo.km_rotas > 0 ? Math.round(Number(veiculo.km_rotas)) : null;
  const kmLabel = veiculo.km_rodados ? "Km rodados" : "Km (rotas)";

  return (
    <div className="vei-card">
      {/* Barra de combustível — direita do card */}
      <div className="vei-fuel-bar" title={nivel !== null ? `Combustível: ~${nivel}%` : "Sem dados de combustível"}>
        <div className="vei-fuel-icon"><FaGasPump /></div>
        <div className="vei-fuel-track">
          <div className="vei-fuel-bar-fill" style={{ height: `${nivel ?? 0}%` }} />
        </div>
        <span className="vei-fuel-bar-pct">{nivel !== null ? `${nivel}%` : "—"}</span>
      </div>

      {/* Ações */}
      <div className="vei-card-actions">
        {!instalador && (
          <>
            <button className="vei-icon-btn" title="Endereços de partida" onClick={onPartida}>
              <FaMapMarkerAlt />
            </button>
            <button className="vei-icon-btn" title="Atualizar odômetro" onClick={onAtualizarKm}>
              <FaTachometerAlt />
            </button>
            <button className="vei-icon-btn" title="Editar" onClick={onEditar}>
              <FaEdit />
            </button>
            <button className="vei-icon-btn danger" title="Excluir" onClick={onExcluir} disabled={excluindo}>
              <FaTrash />
            </button>
          </>
        )}
      </div>

      {/* Foto */}
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

      {/* Corpo */}
      <div className="vei-card-body">
        <p className="vei-card-nome">{veiculo.nome}</p>

        <div className="vei-card-row">
          {veiculo.placa && <span className="vei-placa">{veiculo.placa}</span>}
          <span className="vei-badge vei-badge-tipo">{labelTipo(veiculo.tipo)}</span>
        </div>

        <div className="vei-card-row">
          <span className={combClass}>{labelCombustivel(veiculo.combustivel)}</span>
          {veiculo.media_km_l && (
            <span className="vei-card-media">
              <strong>{Number(veiculo.media_km_l).toFixed(1)}</strong> km/l
            </span>
          )}
        </div>

        {/* km rodados */}
        {kmRodados > 0 && (
          <div className="vei-km-row">
            <span className="vei-km-label">{kmLabel}</span>
            <span className="vei-km-value">{kmRodados.toLocaleString("pt-BR")} km</span>
          </div>
        )}

        {/* Botão Abastecer */}
        <button className="vei-btn-abastecer" onClick={onAbastecer}>
          <FaGasPump />
          Abastecer
        </button>
      </div>
    </div>
  );
}

/* ── MODAL: ENDEREÇOS DE PARTIDA ── */
async function geocodeEndereco(texto) {
  try {
    const qs = new URLSearchParams({ format: "json", limit: "1", countrycodes: "br", q: texto });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${qs}`, {
      headers: { "Accept-Language": "pt-BR", "User-Agent": "sistema-liuu/1.0" },
    });
    const data = await res.json();
    if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {}
  return null;
}

function ModalEnderecosPartida({ veiculo, onClose }) {
  const [enderecos,  setEnderecos]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [salvando,   setSalvando]   = useState(false);
  const [excluindo,  setExcluindo]  = useState(null);
  const [form,       setForm]       = useState({ label: "", endereco: "" });
  const [geocodando, setGeocodando] = useState(false);
  const [geoResult,  setGeoResult]  = useState(null);
  const [erroForm,   setErroForm]   = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/crews/pontos-partida/padrao?veiculo_id=${veiculo.id}`);
      setEnderecos(res.enderecos || []);
    } catch {}
    finally { setLoading(false); }
  }, [veiculo.id]);

  useEffect(() => { carregar(); }, [carregar]);

  async function handleGeocodar() {
    if (!form.endereco.trim()) return;
    setGeocodando(true);
    const coords = await geocodeEndereco(form.endereco);
    setGeoResult(coords);
    setGeocodando(false);
  }

  async function handleSalvar() {
    if (!form.label.trim() || !form.endereco.trim()) {
      setErroForm("Preencha o nome e o endereço.");
      return;
    }
    setSalvando(true);
    try {
      await api.post(`/crews/pontos-partida/padrao`, {
        veiculo_id: veiculo.id,
        label:      form.label.trim(),
        endereco:   form.endereco.trim(),
        lat:        geoResult?.lat || null,
        lng:        geoResult?.lng || null,
      });
      setForm({ label: "", endereco: "" });
      setGeoResult(null);
      setErroForm("");
      await carregar();
    } catch (e) {
      setErroForm(e.message || "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function handleExcluir(id) {
    setExcluindo(id);
    try {
      await api.delete(`/crews/pontos-partida/padrao/${id}`);
      await carregar();
    } catch {}
    finally { setExcluindo(null); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box"
        style={{ maxWidth: 500, maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2>📍 Endereços de partida</h2>
            <p>{veiculo.nome}{veiculo.placa ? ` — ${veiculo.placa}` : ""}</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Lista de endereços cadastrados */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--color-text-muted)", marginBottom: 8 }}>
              Endereços cadastrados
            </div>
            {loading ? (
              <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Carregando...</div>
            ) : enderecos.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--color-text-muted)", fontStyle: "italic" }}>
                Nenhum endereço cadastrado para este veículo.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {enderecos.map((e) => (
                  <div key={e.id} style={{
                    display: "flex", alignItems: "flex-start", gap: 8,
                    padding: "8px 10px",
                    background: "var(--color-surface-soft)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>{e.label}</div>
                      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>{e.endereco}</div>
                      {e.lat && e.lng && (
                        <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
                          📌 {Number(e.lat).toFixed(5)}, {Number(e.lng).toFixed(5)}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleExcluir(e.id)}
                      disabled={excluindo === e.id}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "var(--color-danger, #ef4444)", padding: "2px 4px", fontSize: 14,
                      }}
                      title="Remover"
                    >
                      <FaTrash />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Formulário para adicionar novo endereço */}
          <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--color-text-muted)", marginBottom: 10 }}>
              Adicionar endereço
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="ag-form-field">
                <label>Nome / identificação *</label>
                <input
                  placeholder='Ex: "Empresa principal", "Filial sul"'
                  value={form.label}
                  onChange={(e) => { setForm((p) => ({ ...p, label: e.target.value })); setErroForm(""); }}
                />
              </div>

              <div className="ag-form-field">
                <label>Endereço completo *</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    placeholder="Rua, número, cidade, estado"
                    value={form.endereco}
                    onChange={(e) => { setForm((p) => ({ ...p, endereco: e.target.value })); setGeoResult(null); setErroForm(""); }}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="ek-btn ek-btn-secondary"
                    style={{ fontSize: 12, padding: "0 10px", flexShrink: 0 }}
                    onClick={handleGeocodar}
                    disabled={geocodando || !form.endereco.trim()}
                    title="Verificar localização no mapa"
                  >
                    {geocodando ? "..." : "📌"}
                  </button>
                </div>
                {geoResult ? (
                  <div style={{ fontSize: 11, color: "var(--color-success, #22c55e)", marginTop: 3 }}>
                    ✓ Localização encontrada — {Number(geoResult.lat).toFixed(5)}, {Number(geoResult.lng).toFixed(5)}
                  </div>
                ) : geoResult === null && form.endereco && !geocodando ? null : null}
              </div>

              {erroForm && (
                <div style={{ fontSize: 12, color: "#ef4444" }}>{erroForm}</div>
              )}

              <button
                className="ek-btn ek-btn-primary"
                style={{ alignSelf: "flex-end" }}
                onClick={handleSalvar}
                disabled={salvando}
              >
                {salvando ? "Salvando..." : "Adicionar endereço"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── EDITOR DE FOTO (recorte por arrastar + zoom) ── */
function FotoEditor({ src, onConfirm, onCancelar }) {
  const FRAME_W = 480;
  const FRAME_H = 270;

  const canvasRef  = useRef(null);
  const imgRef     = useRef(new Image());
  const dragging   = useRef(false);
  const lastPos    = useRef({ x: 0, y: 0 });

  const [zoom,   setZoom]   = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);

  // Carrega imagem e calcula zoom mínimo para preencher o frame
  useEffect(() => {
    const img = imgRef.current;
    img.onload = () => {
      const minZ = Math.max(FRAME_W / img.naturalWidth, FRAME_H / img.naturalHeight);
      setZoom(minZ);
      setOffset({ x: 0, y: 0 });
      setLoaded(true);
    };
    img.src = src;
  }, [src]);

  // Desenha no canvas sempre que zoom/offset mudam
  useEffect(() => {
    if (!loaded) return;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");
    const img    = imgRef.current;
    const dw     = img.naturalWidth  * zoom;
    const dh     = img.naturalHeight * zoom;

    // Limita offset para não deixar borda branca
    const minX = Math.min(0, FRAME_W - dw);
    const minY = Math.min(0, FRAME_H - dh);
    const clampedX = Math.max(minX, Math.min(0, offset.x));
    const clampedY = Math.max(minY, Math.min(0, offset.y));

    ctx.clearRect(0, 0, FRAME_W, FRAME_H);
    ctx.drawImage(img, clampedX, clampedY, dw, dh);
  }, [zoom, offset, loaded]);

  function onMouseDown(e) {
    dragging.current = true;
    lastPos.current  = { x: e.clientX, y: e.clientY };
  }

  function onMouseMove(e) {
    if (!dragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setOffset((p) => ({ x: p.x + dx, y: p.y + dy }));
  }

  function onMouseUp() { dragging.current = false; }

  function onTouchStart(e) {
    dragging.current = true;
    lastPos.current  = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }

  function onTouchMove(e) {
    if (!dragging.current) return;
    const dx = e.touches[0].clientX - lastPos.current.x;
    const dy = e.touches[0].clientY - lastPos.current.y;
    lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    setOffset((p) => ({ x: p.x + dx, y: p.y + dy }));
  }

  function confirmar() {
    canvasRef.current.toBlob((blob) => onConfirm(blob), "image/jpeg", 0.92);
  }

  const minZoom = loaded
    ? Math.max(FRAME_W / imgRef.current.naturalWidth, FRAME_H / imgRef.current.naturalHeight)
    : 0.5;

  return (
    <div className="vei-foto-editor">
      <canvas
        ref={canvasRef}
        width={FRAME_W}
        height={FRAME_H}
        className="vei-foto-editor-canvas"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onMouseUp}
      />
      <div className="vei-foto-editor-controles">
        <span className="vei-foto-editor-label">Zoom</span>
        <input
          type="range"
          min={minZoom}
          max={minZoom * 4}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="vei-foto-editor-slider"
        />
        <div className="vei-foto-editor-acoes">
          <button type="button" className="vei-foto-editor-btn-cancel" onClick={onCancelar}>Cancelar</button>
          <button type="button" className="vei-foto-editor-btn-ok"     onClick={confirmar}>Usar esta área</button>
        </div>
      </div>
    </div>
  );
}

/* ── MODAL ── */
function VeiculoModal({ veiculo, salvando, onClose, onSalvar }) {
  const [form, setForm] = useState({
    nome:              veiculo?.nome              ?? "",
    placa:             veiculo?.placa             ?? "",
    tipo:              veiculo?.tipo              ?? "carro",
    combustivel:       veiculo?.combustivel       ?? "flex",
    media_km_l:        veiculo?.media_km_l        ?? "",
    capacidade_tanque: veiculo?.capacidade_tanque ?? "",
    observacoes:       veiculo?.observacoes       ?? "",
  });
  const [fotoFile,    setFotoFile]    = useState(null);
  const [fotoPreview, setFotoPreview] = useState(veiculo?.foto_url ?? null);
  const [erroForm,    setErroForm]    = useState("");
  const [editandoFoto, setEditandoFoto] = useState(false);
  const [fotoOrigem,   setFotoOrigem]   = useState(null); // URL da imagem original para o editor
  const inputFotoRef = useRef(null);

  function set(k, v) { setForm((p) => ({ ...p, [k]: v })); if (erroForm) setErroForm(""); }

  function handleFoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFotoOrigem(URL.createObjectURL(file));
    setEditandoFoto(true);
    e.target.value = "";
  }

  function handleCropConfirm(blob) {
    const file = new File([blob], "foto.jpg", { type: "image/jpeg" });
    setFotoFile(file);
    setFotoPreview(URL.createObjectURL(blob));
    setEditandoFoto(false);
    setFotoOrigem(null);
  }

  function handlePlaca(v) {
    // Aceita formato antigo (ABC-1234) e Mercosul (ABC1D23)
    const clean = v.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 8);
    set("placa", clean);
  }

  function salvar() {
    if (!form.nome.trim()) { setErroForm("Nome é obrigatório."); return; }

    const fd = new FormData();
    fd.append("nome",              form.nome.trim());
    fd.append("placa",             form.placa.trim());
    fd.append("tipo",              form.tipo);
    fd.append("combustivel",       form.combustivel);
    fd.append("media_km_l",        form.media_km_l);
    fd.append("capacidade_tanque", form.capacidade_tanque);
    fd.append("observacoes",       form.observacoes.trim());
    if (fotoFile) fd.append("foto", fotoFile);

    onSalvar(fd);
  }

  const temFoto = !!fotoPreview;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box"
        style={{ maxWidth: 520, maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2>{veiculo ? "Editar veículo" : "Novo veículo"}</h2>
            <p>Dados do veículo da empresa</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Upload de foto */}
          <div className="ag-form-field">
            <label>Foto do veículo</label>
            {editandoFoto && fotoOrigem ? (
              <FotoEditor
                src={fotoOrigem}
                onConfirm={handleCropConfirm}
                onCancelar={() => { setEditandoFoto(false); setFotoOrigem(null); }}
              />
            ) : (
              <>
                <div
                  className={`vei-foto-upload${temFoto ? " tem-foto" : ""}`}
                  onClick={() => inputFotoRef.current?.click()}
                  title="Clique para selecionar uma foto"
                >
                  {fotoPreview && <img src={fotoPreview} alt="Preview" />}
                  <div className="vei-foto-upload-hint">
                    <FaCamera />
                    <span>{temFoto ? "Clique para trocar a foto" : "Clique para adicionar foto"}</span>
                  </div>
                </div>
                <input
                  ref={inputFotoRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleFoto}
                />
              </>
            )}
          </div>

          {/* Nome */}
          <div className="ag-form-field">
            <label>Nome *</label>
            <input
              placeholder="Ex: Fiat Strada 2022"
              value={form.nome}
              onChange={(e) => set("nome", e.target.value)}
              style={erroForm ? { borderColor: "#ef4444" } : undefined}
            />
            {erroForm && (
              <span style={{ fontSize: 12, color: "#ef4444", marginTop: 2 }}>{erroForm}</span>
            )}
          </div>

          {/* Placa */}
          <div className="ag-form-field">
            <label>Placa</label>
            <input
              placeholder="Ex: ABC-1234 ou ABC1D23"
              value={form.placa}
              onChange={(e) => handlePlaca(e.target.value)}
              maxLength={8}
              style={{ fontFamily: "monospace", letterSpacing: "0.05em" }}
            />
          </div>

          {/* Tipo + Combustível lado a lado */}
          <div className="ag-modal-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="ag-form-field">
              <label>Tipo</label>
              <select value={form.tipo} onChange={(e) => set("tipo", e.target.value)}>
                {TIPOS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="ag-form-field">
              <label>Combustível</label>
              <select value={form.combustivel} onChange={(e) => set("combustivel", e.target.value)}>
                {COMBUSTIVEIS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Média km/l + Capacidade do tanque lado a lado */}
          <div className="ag-modal-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="ag-form-field">
              <label>Média de consumo (km/l)</label>
              <input
                type="number"
                min={0}
                step={0.1}
                placeholder="Ex: 12.5"
                value={form.media_km_l}
                onChange={(e) => set("media_km_l", e.target.value)}
              />
            </div>
            <div className="ag-form-field">
              <label>Capacidade do tanque (L)</label>
              <input
                type="number"
                min={0}
                step={1}
                placeholder="Ex: 55"
                value={form.capacidade_tanque}
                onChange={(e) => set("capacidade_tanque", e.target.value)}
              />
            </div>
          </div>

          {/* Observações */}
          <div className="ag-form-field">
            <label>Observações</label>
            <textarea
              rows={3}
              placeholder="Informações adicionais sobre o veículo..."
              value={form.observacoes}
              onChange={(e) => set("observacoes", e.target.value)}
              style={{ resize: "vertical" }}
            />
          </div>

        </div>

        <div className="modal-actions">
          <button className="ek-btn ek-btn-secondary" onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button className="ek-btn ek-btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : veiculo ? "Salvar alterações" : "Cadastrar veículo"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── MODAL: ABASTECIMENTO ── */
function ModalAbastecimento({ veiculo, onClose, onSalvo }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    data:        hoje,
    km_atual:    "",
    litros:      "",
    valor_total: "",
    combustivel: veiculo?.combustivel || "flex",
    posto_nome:  "",
    observacoes: "",
  });
  const [historico,  setHistorico]  = useState([]);
  const [salvando,   setSalvando]   = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro,       setErro]       = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get(`/veiculos/${veiculo.id}/abastecimentos`);
        setHistorico(r.abastecimentos || []);
      } catch { /* ignora */ }
      finally { setCarregando(false); }
    })();
  }, [veiculo.id]);

  function set(k, v) { setForm((p) => ({ ...p, [k]: v })); }

  const valorPorLitro = form.litros && form.valor_total
    ? (Number(form.valor_total) / Number(form.litros)).toFixed(2)
    : null;

  async function salvar() {
    if (!form.litros && !form.valor_total) { setErro("Informe ao menos litros ou valor total."); return; }
    setSalvando(true);
    try {
      await api.post(`/veiculos/${veiculo.id}/abastecimentos`, form);
      onSalvo();
    } catch { setErro("Erro ao registrar abastecimento."); }
    finally { setSalvando(false); }
  }

  async function remover(abId) {
    if (!window.confirm("Remover este registro?")) return;
    await api.delete(`/veiculos/${veiculo.id}/abastecimentos/${abId}`).catch(() => {});
    setHistorico((p) => p.filter((a) => a.id !== abId));
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-lg" style={{ maxWidth: 560, maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>⛽ Abastecer — {veiculo.nome}</h2>
            <p>{veiculo.placa && `Placa: ${veiculo.placa} · `}Combustível: {labelCombustivel(veiculo.combustivel)}</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {erro && <div style={{ color: "#ef4444", fontSize: 13 }}>{erro}</div>}

          <div className="ag-modal-grid">
            <div className="ag-form-field">
              <label>Data</label>
              <input type="date" value={form.data} onChange={(e) => set("data", e.target.value)} />
            </div>
            <div className="ag-form-field">
              <label>Km atual</label>
              <input type="number" min={0} step={0.1} placeholder="Ex: 45230" value={form.km_atual} onChange={(e) => set("km_atual", e.target.value)} />
            </div>
          </div>

          <div className="ag-modal-grid">
            <div className="ag-form-field">
              <label>Litros abastecidos</label>
              <input type="number" min={0} step={0.01} placeholder="Ex: 40.5" value={form.litros} onChange={(e) => set("litros", e.target.value)} />
            </div>
            <div className="ag-form-field">
              <label>Valor total (R$)</label>
              <input type="number" min={0} step={0.01} placeholder="Ex: 250.00" value={form.valor_total} onChange={(e) => set("valor_total", e.target.value)} />
            </div>
          </div>

          {valorPorLitro && (
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", background: "var(--color-surface-soft)", padding: "6px 12px", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border)" }}>
              💰 Preço por litro: <strong>R$ {valorPorLitro}</strong>
            </div>
          )}

          <div className="ag-modal-grid">
            <div className="ag-form-field">
              <label>Combustível</label>
              <select value={form.combustivel} onChange={(e) => set("combustivel", e.target.value)}>
                {COMBUSTIVEIS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="ag-form-field">
              <label>Nome do posto</label>
              <input placeholder="Ex: Posto Shell Centro" value={form.posto_nome} onChange={(e) => set("posto_nome", e.target.value)} />
            </div>
          </div>

          <div className="ag-form-field">
            <label>Observações</label>
            <input placeholder="Opcional" value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} />
          </div>

          {/* Histórico */}
          {!carregando && historico.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)", marginBottom: 8 }}>Histórico de abastecimentos</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {historico.slice(0, 8).map((ab) => (
                  <div key={ab.id} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12, padding: "6px 10px", background: "var(--color-surface-soft)", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border)" }}>
                    <span style={{ color: "var(--color-text-muted)" }}>{ab.data?.slice(0,10)}</span>
                    {ab.litros && <span><strong>{Number(ab.litros).toFixed(1)}L</strong></span>}
                    {ab.valor_total && <span>R$ {Number(ab.valor_total).toFixed(2)}</span>}
                    {ab.posto_nome && <span style={{ color: "var(--color-text-muted)" }}>{ab.posto_nome}</span>}
                    {ab.km_atual && <span style={{ marginLeft: "auto", color: "var(--color-text-muted)" }}>{Number(ab.km_atual).toFixed(0)} km</span>}
                    <button
                      onClick={() => remover(ab.id)}
                      style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", fontSize: 14, padding: 0 }}
                      title="Remover"
                    >×</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="ek-btn ek-btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="ek-btn ek-btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? "Registrando..." : "⛽ Registrar abastecimento"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── MODAL: ODÔMETRO MANUAL ── */
function ModalKmManual({ veiculo, onClose, onSalvo }) {
  const [km,       setKm]       = useState(veiculo.km_atual ? String(Math.round(Number(veiculo.km_atual))) : "");
  const [salvando, setSalvando] = useState(false);
  const [erro,     setErro]     = useState("");

  async function handleSalvar() {
    const val = Number(km);
    if (!km || isNaN(val) || val < 0) { setErro("Informe um valor válido."); return; }
    setSalvando(true);
    try {
      await api.patch(`/veiculos/${veiculo.id}/km-manual`, { km_atual: val });
      onSalvo();
    } catch (e) {
      setErro(e.message || "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box"
        style={{ maxWidth: 380 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2>Atualizar odômetro</h2>
            <p>{veiculo.nome}{veiculo.placa ? ` · ${veiculo.placa}` : ""}</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="ag-form-field">
            <label>Leitura atual do odômetro (km)</label>
            <input
              type="number"
              min={0}
              step={1}
              placeholder="Ex: 52340"
              value={km}
              onChange={(e) => { setKm(e.target.value); setErro(""); }}
              autoFocus
            />
            {erro && <span style={{ fontSize: 12, color: "#ef4444", marginTop: 2 }}>{erro}</span>}
            <span style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>
              Informe o valor marcado no painel do veículo. Isso recalcula o nível de combustível.
            </span>
          </div>
        </div>
        <div className="modal-actions">
          <button className="ek-btn ek-btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button className="ek-btn ek-btn-primary" onClick={handleSalvar} disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
