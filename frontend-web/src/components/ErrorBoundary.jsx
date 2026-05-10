import { Component } from "react";

/**
 * Captura erros de render em qualquer componente filho.
 * Exibe UI amigável em vez de tela branca.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || "Erro desconhecido." };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info);
  }

  handleReload() {
    window.location.reload();
  }

  handleBack() {
    window.history.back();
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        gap: 16,
        padding: 40,
        textAlign: "center",
      }}>
        <div style={{ fontSize: 48, lineHeight: 1 }}>⚠</div>
        <h2 style={{
          fontSize: 20,
          fontWeight: 700,
          color: "var(--color-text)",
          margin: 0,
        }}>
          Algo deu errado
        </h2>
        <p style={{
          fontSize: 13,
          color: "var(--color-text-muted)",
          maxWidth: 380,
          margin: 0,
          lineHeight: 1.6,
        }}>
          Ocorreu um erro inesperado nesta página. Tente recarregar ou voltar para a tela anterior.
        </p>
        {process.env.NODE_ENV !== "production" && (
          <pre style={{
            fontSize: 11,
            color: "#ef4444",
            background: "var(--color-surface-soft)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            padding: "10px 14px",
            maxWidth: 480,
            overflowX: "auto",
            textAlign: "left",
            margin: 0,
          }}>
            {this.state.message}
          </pre>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button
            onClick={this.handleBack}
            style={{
              padding: "9px 20px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-border)",
              background: "var(--color-surface-soft)",
              color: "var(--color-text)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            ← Voltar
          </button>
          <button
            onClick={this.handleReload}
            style={{
              padding: "9px 20px",
              borderRadius: "var(--radius-sm)",
              border: "none",
              background: "var(--color-primary)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Recarregar
          </button>
        </div>
      </div>
    );
  }
}
