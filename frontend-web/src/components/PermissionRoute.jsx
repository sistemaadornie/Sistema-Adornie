import { Outlet } from "react-router-dom";
import useAuth from "../hooks/useAuth";

/**
 * Protege rotas por permissão.
 * Props:
 *   - perms: array de permissões (OR) — se o usuário tiver qualquer uma, passa
 *   - check: função(user) => boolean — alternativa a perms para lógica customizada
 *
 * Se o usuário não tiver permissão, exibe tela de "Sem permissão" no lugar da página.
 */
export default function PermissionRoute({ perms, check }) {
  const { user } = useAuth();

  const temAcesso = check
    ? check(user)
    : perms?.some((p) => user?.permissoes?.includes(p));

  if (!temAcesso) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        gap: 12,
        textAlign: "center",
        padding: "2rem",
      }}>
        <div style={{ fontSize: 56 }}>🔒</div>
        <h2 style={{ color: "var(--color-text)", margin: 0 }}>Acesso restrito</h2>
        <p style={{ color: "var(--color-text-muted)", maxWidth: 360, margin: 0 }}>
          Você não tem permissão para acessar esta página. Entre em contato com o administrador
          do sistema caso precise de acesso.
        </p>
      </div>
    );
  }

  return <Outlet />;
}
