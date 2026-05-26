import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL;

export default function MidiasGaleria({ pedidoId, token }) {
  const [midias, setMidias] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!pedidoId) return;
    setCarregando(true);
    fetch(`${API_URL}/api/pedidos/${pedidoId}/midias`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setMidias(Array.isArray(data) ? data : []))
      .catch(() => setMidias([]))
      .finally(() => setCarregando(false));
  }, [pedidoId, token]);

  if (carregando) return <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Carregando mídias…</p>;
  if (!midias.length) return <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Nenhuma mídia registrada.</p>;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
      {midias.map((m) => (
        <a
          key={m.id}
          href={m.drive_url}
          target="_blank"
          rel="noopener noreferrer"
          title={m.nome_original || m.tipo}
          style={{
            display: "block", width: 80, height: 80, border: "1px solid var(--color-border)",
            borderRadius: 6, overflow: "hidden", background: "var(--color-bg-muted)",
            alignItems: "center", justifyContent: "center",
            fontSize: 28, textDecoration: "none",
          }}
        >
          {m.tipo === "foto" ? "🖼️" : "🎬"}
        </a>
      ))}
    </div>
  );
}
