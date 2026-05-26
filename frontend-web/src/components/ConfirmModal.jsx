import { useEffect, useRef } from "react";
import "./ConfirmModal.css";

/**
 * Modal de confirmação reutilizável.
 *
 * Props:
 *   open        {boolean}   — exibe/oculta
 *   titulo      {string}    — título do modal
 *   mensagem    {string}    — corpo/descrição
 *   labelConfirm {string}   — texto do botão de confirmar (default: "Confirmar")
 *   labelCancel  {string}   — texto do botão de cancelar (default: "Cancelar")
 *   variante    {string}    — "danger" | "warning" | "default"
 *   onConfirm   {function}  — callback ao confirmar
 *   onCancel    {function}  — callback ao cancelar / fechar
 */
export default function ConfirmModal({
  open,
  titulo = "Confirmar ação",
  mensagem,
  labelConfirm = "Confirmar",
  labelCancel = "Cancelar",
  variante = "danger",
  onConfirm,
  onCancel,
}) {
  const btnConfirmRef = useRef(null);

  /* Foca o botão de confirmar ao abrir */
  useEffect(() => {
    if (open) setTimeout(() => btnConfirmRef.current?.focus(), 50);
  }, [open]);

  /* Fecha com Escape */
  useEffect(() => {
    if (!open) return;
    function handler(e) { if (e.key === "Escape") onCancel?.(); }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="confirm-overlay">
      <div
        className={`confirm-box confirm-${variante}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <div className="confirm-icon-wrap">
          {variante === "danger"  && <span className="confirm-icon">⚠</span>}
          {variante === "warning" && <span className="confirm-icon">⚠</span>}
        </div>
        <h3 id="confirm-title" className="confirm-titulo">{titulo}</h3>
        {mensagem && <p className="confirm-mensagem">{mensagem}</p>}
        <div className="confirm-actions">
          <button className="confirm-btn confirm-btn-cancel" onClick={onCancel}>
            {labelCancel}
          </button>
          <button
            ref={btnConfirmRef}
            className={`confirm-btn confirm-btn-confirm confirm-btn-${variante}`}
            onClick={onConfirm}
          >
            {labelConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
