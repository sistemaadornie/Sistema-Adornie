// frontend-web/src/pages/pedidos/ModeloSelectorPanel.jsx
import { useState } from "react";

const panelStyle = {
  position: "fixed",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  zIndex: 1200,
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-lg, 10px)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.22)",
  minWidth: 320,
  maxWidth: 420,
  width: "90vw",
};

const backdropStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 1199,
  background: "rgba(0,0,0,0.35)",
};

const headerStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 16px",
  borderBottom: "1px solid var(--color-border)",
  fontWeight: 700,
  fontSize: 14,
};

const bodyStyle = {
  padding: "16px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const fieldStyle = { display: "flex", flexDirection: "column", gap: 4 };
const labelStyle = { fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" };

function CloseBtn({ onClose }) {
  return (
    <button
      onClick={onClose}
      aria-label="Fechar"
      style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--color-text-muted)", lineHeight: 1 }}
    >
      ×
    </button>
  );
}

function SimpleSelectorPanel({ titulo, config, valor, onChange, onClose }) {
  return (
    <>
      <div style={backdropStyle} onClick={onClose} role="presentation" />
      <div style={panelStyle} role="dialog" aria-modal="true">
        <div style={headerStyle}>
          <span>{titulo}</span>
          <CloseBtn onClose={onClose} />
        </div>
        <div style={bodyStyle}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {config.modelos.map((m) => (
              <button
                key={m}
                onClick={() => { onChange({ modelo: m, especificacoes: null }); onClose(); }}
                style={{
                  padding: "6px 14px",
                  borderRadius: "var(--radius-md, 6px)",
                  border: valor?.modelo === m ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
                  background: valor?.modelo === m ? "var(--color-primary)" : "var(--color-surface-soft)",
                  color: valor?.modelo === m ? "#fff" : "var(--color-text)",
                  cursor: "pointer",
                  fontWeight: 500,
                  fontSize: 13,
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function PersianaSelectorPanel({ config, valor, onChange, onClose }) {
  const [modeloSel, setModeloSel] = useState(valor?.modelo || "");
  const [tuboSel,   setTuboSel]   = useState(valor?.especificacoes?.tubo  || "");
  const [bandoSel,  setBandoSel]  = useState(valor?.especificacoes?.bando || "");

  const modeloCfg = config.modelos.find((m) => m.nome === modeloSel);
  const opcoesBandoCaixa = modeloCfg
    ? [...(modeloCfg.caixas || []), ...(modeloCfg.bandos || [])]
    : [];

  function aplicar() {
    if (!modeloSel || !tuboSel) return;
    onChange({
      modelo: modeloSel,
      especificacoes: { tubo: tuboSel, bando: bandoSel || null },
    });
    onClose();
  }

  const selectStyle = {
    padding: "6px 10px",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md, 6px)",
    background: "var(--color-surface)",
    color: "var(--color-text)",
    fontSize: 13,
  };

  return (
    <>
      <div style={backdropStyle} onClick={onClose} role="presentation" />
      <div style={panelStyle} role="dialog" aria-modal="true">
        <div style={headerStyle}>
          <span>Especificações da persiana</span>
          <CloseBtn onClose={onClose} />
        </div>
        <div style={bodyStyle}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Modelo</label>
            <select
              value={modeloSel}
              onChange={(e) => { setModeloSel(e.target.value); setTuboSel(""); setBandoSel(""); }}
              style={selectStyle}
            >
              <option value="">— selecionar —</option>
              {config.modelos.map((m) => (
                <option key={m.nome} value={m.nome}>{m.nome}</option>
              ))}
            </select>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Tubo</label>
            <select
              value={tuboSel}
              onChange={(e) => setTuboSel(e.target.value)}
              disabled={!modeloCfg}
              style={{ ...selectStyle, opacity: modeloCfg ? 1 : 0.5 }}
            >
              <option value="">— selecionar —</option>
              {(modeloCfg?.tubos || []).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>
              Bandô / Caixa{" "}
              <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(opcional)</span>
            </label>
            <select
              value={bandoSel}
              onChange={(e) => setBandoSel(e.target.value)}
              disabled={!modeloCfg}
              style={{ ...selectStyle, opacity: modeloCfg ? 1 : 0.5 }}
            >
              <option value="">— Nenhum —</option>
              {opcoesBandoCaixa.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          <button
            className="ek-btn ek-btn-primary"
            onClick={aplicar}
            disabled={!modeloSel || !tuboSel}
            style={{ marginTop: 4 }}
          >
            Aplicar
          </button>
        </div>
      </div>
    </>
  );
}

export default function ModeloSelectorPanel({ tipo, config, valor, onChange, onClose }) {
  if (tipo === "cortina") {
    return <SimpleSelectorPanel titulo="Selecionar modelo de cortina" config={config} valor={valor} onChange={onChange} onClose={onClose} />;
  }
  if (tipo === "forro") {
    return <SimpleSelectorPanel titulo="Selecionar modelo de forro" config={config} valor={valor} onChange={onChange} onClose={onClose} />;
  }
  if (tipo === "persiana") {
    return <PersianaSelectorPanel config={config} valor={valor} onChange={onChange} onClose={onClose} />;
  }
  return null;
}
