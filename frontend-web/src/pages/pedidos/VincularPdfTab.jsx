import { useEffect, useRef, useState } from "react";
import { api } from "../../services/api";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

export default function VincularPdfTab() {
  const [busca,             setBusca]             = useState("");
  const [resultados,        setResultados]        = useState([]);
  const [buscando,          setBuscando]          = useState(false);
  const [pedidoSelecionado, setPedidoSelecionado] = useState(null);
  const [arquivo,           setArquivo]           = useState(null);
  const [erroArquivo,       setErroArquivo]       = useState("");
  const [enviando,          setEnviando]          = useState(false);
  const [feedback,          setFeedback]          = useState(null); // { tipo: "success"|"error", msg }
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!busca.trim()) { setResultados([]); return; }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const res = await api.get(`/pedidos?q=${encodeURIComponent(busca.trim())}`);
        setResultados(res.pedidos || []);
      } catch (_) {
        setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [busca]);

  function selecionarArquivo(file) {
    setErroArquivo("");
    setFeedback(null);
    if (!file) return;
    if (file.type !== "application/pdf") {
      setErroArquivo("Apenas arquivos PDF são aceitos.");
      return;
    }
    if (file.size > MAX_SIZE) {
      setErroArquivo("O arquivo excede o limite de 5 MB.");
      return;
    }
    setArquivo(file);
  }

  async function handleVincular() {
    if (!pedidoSelecionado || !arquivo) return;
    setEnviando(true);
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.append("arquivo", arquivo);
      await api.post(`/pedidos/${pedidoSelecionado.id}/anexo-pdf`, fd, true);
      setFeedback({ tipo: "success", msg: `PDF vinculado ao pedido ${pedidoSelecionado.numero} com sucesso.` });
      setArquivo(null);
      if (inputRef.current) inputRef.current.value = "";
      setPedidoSelecionado(null);
      setBusca("");
      setResultados([]);
    } catch (e) {
      setFeedback({ tipo: "error", msg: e.message || "Erro ao vincular PDF." });
    } finally {
      setEnviando(false);
    }
  }

  function fmtData(iso) {
    if (!iso) return "";
    const d = iso.includes("T") ? new Date(iso) : new Date(iso + "T12:00:00");
    return d.toLocaleDateString("pt-BR");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Busca de pedido */}
      <div>
        <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
          Buscar pedido (número ou nome do cliente)
        </label>
        <div style={{ position: "relative" }}>
          <input
            type="text"
            placeholder="Ex: #00002372 ou João Silva"
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setPedidoSelecionado(null); }}
            style={{
              width: "100%", padding: "9px 12px", fontSize: 13,
              border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)",
              background: "var(--color-surface)", color: "var(--color-text)",
              boxSizing: "border-box",
            }}
          />
          {buscando && (
            <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "var(--color-text-muted)" }}>
              ...
            </span>
          )}
        </div>

        {resultados.length > 0 && !pedidoSelecionado && (
          <div style={{
            border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)",
            marginTop: 4, background: "var(--color-surface)", maxHeight: 200, overflowY: "auto",
          }}>
            {resultados.map((p) => (
              <button
                key={p.id}
                onClick={() => { setPedidoSelecionado(p); setResultados([]); setBusca(""); }}
                style={{
                  width: "100%", textAlign: "left", padding: "9px 12px",
                  border: "none", borderBottom: "1px solid var(--color-border)",
                  background: "transparent", cursor: "pointer", fontSize: 13,
                  color: "var(--color-text)",
                }}
              >
                <strong>{p.numero}</strong>
                {p.cliente_nome && <span style={{ marginLeft: 8, color: "var(--color-text-muted)" }}>{p.cliente_nome}</span>}
                {p.data_pedido && <span style={{ marginLeft: 8, color: "var(--color-text-muted)", fontSize: 12 }}>{fmtData(p.data_pedido)}</span>}
              </button>
            ))}
          </div>
        )}

        {busca.trim() && resultados.length === 0 && !buscando && !pedidoSelecionado && (
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>Nenhum pedido encontrado.</p>
        )}
      </div>

      {/* Card do pedido selecionado */}
      {pedidoSelecionado && (
        <div style={{
          padding: "10px 14px", border: "1px solid var(--color-primary)",
          borderRadius: "var(--radius-md)", background: "rgba(59,130,246,0.06)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <strong style={{ fontSize: 13 }}>{pedidoSelecionado.numero}</strong>
            {pedidoSelecionado.cliente_nome && (
              <span style={{ marginLeft: 8, fontSize: 13, color: "var(--color-text-muted)" }}>
                {pedidoSelecionado.cliente_nome}
              </span>
            )}
          </div>
          <button
            onClick={() => setPedidoSelecionado(null)}
            style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-muted)", fontSize: 16 }}
          >
            ×
          </button>
        </div>
      )}

      {/* Dropzone de PDF */}
      <div>
        <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
          PDF do pedido original
        </label>
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); selecionarArquivo(e.dataTransfer.files[0]); }}
          style={{
            border: "2px dashed var(--color-border)", borderRadius: "var(--radius-md)",
            padding: "24px 16px", textAlign: "center", cursor: "pointer",
            background: arquivo ? "rgba(34,197,94,0.05)" : "var(--color-surface-soft)",
            transition: "background 0.15s",
          }}
        >
          {arquivo ? (
            <>
              <div style={{ fontSize: 28 }}>📄</div>
              <p style={{ fontWeight: 600, fontSize: 13, marginTop: 6 }}>{arquivo.name}</p>
              <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
                {(arquivo.size / 1024).toFixed(1)} KB
              </p>
            </>
          ) : (
            <>
              <div style={{ fontSize: 36 }}>📎</div>
              <p style={{ fontWeight: 600, fontSize: 13, marginTop: 8 }}>Clique ou arraste o PDF aqui</p>
              <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>Apenas .pdf · máx 5 MB</p>
            </>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          style={{ display: "none" }}
          onChange={(e) => selecionarArquivo(e.target.files[0])}
        />
        {erroArquivo && (
          <p style={{ fontSize: 12, color: "#ef4444", marginTop: 4 }}>⚠ {erroArquivo}</p>
        )}
      </div>

      {feedback && (
        <div style={{
          padding: "10px 14px", borderRadius: "var(--radius-md)", fontSize: 13,
          background: feedback.tipo === "success" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
          color: feedback.tipo === "success" ? "#16a34a" : "#ef4444",
        }}>
          {feedback.tipo === "success" ? "✓" : "⚠"} {feedback.msg}
        </div>
      )}

      <button
        className="ek-btn ek-btn-primary"
        onClick={handleVincular}
        disabled={!pedidoSelecionado || !arquivo || enviando}
        style={{ alignSelf: "flex-end", minWidth: 180 }}
      >
        {enviando ? "Vinculando..." : "📎 Vincular PDF ao Pedido"}
      </button>
    </div>
  );
}
