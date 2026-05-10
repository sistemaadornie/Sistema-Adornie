export default function FiltroStatus({ filtros, onChange, contagem, statusMeta, total }) {
  const totalGeral = total ?? Object.values(contagem).reduce((s, v) => s + v, 0);

  /* Apenas status com pelo menos 1 ocorrência no período */
  const statusVisiveis = Object.entries(statusMeta).filter(
    ([key]) => key !== "cancelado" && (contagem[key] ?? 0) > 0
  );

  function toggle(key) {
    onChange(filtros.includes(key) ? filtros.filter((k) => k !== key) : [...filtros, key]);
  }

  return (
    <div className="ag-sidebar-card">
      <div className="ag-sidebar-title ag-filter-header">
        Filtrar por status
        {filtros.length > 0 && (
          <button className="ag-filter-clear-btn" onClick={() => onChange([])}>
            Limpar
          </button>
        )}
      </div>

      <div className="ag-filter-group">
        {totalGeral === 0 ? (
          <div className="ag-filter-vazio">
            Nenhum agendamento neste período
          </div>
        ) : (
          <>
            {/* Todos */}
            <div
              className={`ag-filter-item${filtros.length === 0 ? " active ag-filter-todos-active" : ""}`}
              onClick={() => onChange([])}
            >
              <span className="ag-filter-todos-dot" />
              <span className="ag-filter-todos-label">Todos</span>
              <span className="ag-filter-count">{totalGeral}</span>
            </div>

            <div className="ag-filter-divider" />

            {/* Status com ocorrências */}
            {statusVisiveis.map(([key, meta]) => {
              const ativo = filtros.includes(key);
              return (
                <div
                  key={key}
                  className={`ag-filter-item${ativo ? " active" : ""}`}
                  style={ativo ? {
                    background: `color-mix(in srgb, ${meta.cor} 11%, var(--color-surface))`,
                    borderLeft: `3px solid ${meta.cor}`,
                    paddingLeft: 5,
                  } : {}}
                  onClick={() => toggle(key)}
                >
                  <span className={`ag-badge ${meta.classe}`}>{meta.label}</span>
                  <span
                    className="ag-filter-count"
                    style={ativo ? { color: meta.cor, borderColor: `color-mix(in srgb, ${meta.cor} 40%, transparent)` } : {}}
                  >
                    {contagem[key]}
                  </span>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
