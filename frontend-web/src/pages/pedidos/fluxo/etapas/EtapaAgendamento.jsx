import React from "react";
export default function EtapaAgendamento({ onClose }) {
  return (
    <div className="pf-modal-overlay">
      <div className="pf-modal">
        <div className="pf-modal-header">
          <div className="pf-modal-titulo">📅 Agendamento</div>
          <button className="pf-modal-fechar" onClick={onClose}>×</button>
        </div>
        <div className="pf-modal-body" style={{color:"var(--pf-card-sub)"}}>Em implementação...</div>
      </div>
    </div>
  );
}
