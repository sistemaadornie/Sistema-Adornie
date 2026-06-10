import React, { useRef, useEffect, useCallback } from "react";
import EtapaCard from "./EtapaCard";

export default function FluxogramaCanvas({ etapas, etapaAtual, onEtapaClick }) {
  const wrapperRef = useRef(null);
  const flowRef = useRef(null);
  const offsetRef = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });

  function applyTransform(x, y) {
    if (!flowRef.current) return;
    flowRef.current.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  }

  const onMouseDown = useCallback((e) => {
    if (e.target.closest("[role='button']") && e.target.closest(".etapa-card")) return;
    dragging.current = true;
    startRef.current = {
      x: e.clientX - offsetRef.current.x,
      y: e.clientY - offsetRef.current.y,
    };
    wrapperRef.current.style.cursor = "grabbing";
  }, []);

  const onMouseMove = useCallback((e) => {
    if (!dragging.current) return;
    const ox = e.clientX - startRef.current.x;
    const oy = e.clientY - startRef.current.y;
    offsetRef.current = { x: ox, y: oy };
    applyTransform(ox, oy);
  }, []);

  const onMouseUp = useCallback(() => {
    dragging.current = false;
    if (wrapperRef.current) wrapperRef.current.style.cursor = "grab";
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  return (
    <div
      className="pf-canvas-wrapper"
      ref={wrapperRef}
      onMouseDown={onMouseDown}
      style={{ userSelect: "none" }}
    >
      <div className="pf-dot-grid" />

      <div className="pf-flow-container" ref={flowRef}>
        {etapas.map((etapa, idx) => (
          <React.Fragment key={etapa.numero}>
            <EtapaCard
              etapa={etapa}
              etapaAtual={etapaAtual}
              onClick={() => onEtapaClick(etapa.numero)}
            />
            {idx < etapas.length - 1 && (
              <div
                className={`pf-conector${etapa.concluida ? " pf-conector-ativo" : ""}`}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      <div className="pf-legenda">
        <div className="pf-legenda-item">
          <div className="pf-legenda-dot" style={{ background: "#0d9488" }} /> Concluída
        </div>
        <div className="pf-legenda-item">
          <div className="pf-legenda-dot" style={{ background: "#f59e0b" }} /> Ativa
        </div>
        <div className="pf-legenda-item">
          <div className="pf-legenda-dot" style={{ background: "#334155" }} /> Pendente
        </div>
      </div>

      <div className="pf-hint">
        🖱️ Arraste para navegar<br />Clique numa etapa para interagir
      </div>
    </div>
  );
}
