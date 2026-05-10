import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

// Componentes de infra — carregados sempre (pequenos)
import AppLayout   from "./layouts/AppLayout";
import PrivateRoute from "./components/PrivateRoute";
import PermissionRoute from "./components/PermissionRoute";
import ErrorBoundary from "./components/ErrorBoundary";

// ── Rotas públicas ─────────────────────────────────────
const LandingPage      = lazy(() => import("./pages/LandingPage"));
const Login            = lazy(() => import("./pages/Login"));
const RegisterUsuario  = lazy(() => import("./pages/RegisterUsuario"));
const RegisterEmpresa  = lazy(() => import("./pages/RegisterEmpresa"));
const ResetarSenha     = lazy(() => import("./pages/ResetarSenha"));

// ── Rotas privadas ─────────────────────────────────────
const Home                   = lazy(() => import("./pages/Home"));
const Usuarios               = lazy(() => import("./pages/Usuarios"));
const Clientes               = lazy(() => import("./pages/clientes/Clientes"));
const Agendamentos           = lazy(() => import("./pages/agendamentos/Agendamentos"));
const AgendamentosHistorico  = lazy(() => import("./pages/agendamentos/AgendamentosHistorico"));
const AgendamentosMapa       = lazy(() => import("./pages/agendamentos/MapaAgendamentos"));
const AgendamentosInstalador = lazy(() => import("./pages/agendamentos/AgendamentosInstalador"));
const Veiculos               = lazy(() => import("./pages/veiculos/Veiculos"));
const Relatorios             = lazy(() => import("./pages/Relatorios"));
const Configuracoes          = lazy(() => import("./pages/Configuracoes"));

// ── Base visual ────────────────────────────────────────
import "./styles/theme.css";
import "./styles/globals.css";
import "./styles/layout.css";
import "./styles/utilities.css";
import "./styles/components.css";
import "./styles/forms.css";
import "./styles/auth.css";
import "./styles/shared.css";

/* Fallback exibido durante o carregamento inicial de cada chunk */
function PageLoader() {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      background: "var(--color-bg)",
    }}>
      <div style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        border: "3px solid var(--color-border)",
        borderTopColor: "var(--color-primary)",
        animation: "spin 0.7s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <Routes>

            {/* ── ROTAS PÚBLICAS ── */}
            <Route path="/"                  element={<LandingPage />} />
            <Route path="/login"             element={<Login />} />
            <Route path="/cadastro-usuario"  element={<RegisterUsuario />} />
            <Route path="/cadastro-empresa"  element={<RegisterEmpresa />} />
            <Route path="/resetar-senha"     element={<ResetarSenha />} />

            {/* ── ROTAS PRIVADAS (verificação de auth + layout global) ── */}
            <Route element={<PrivateRoute />}>
              <Route element={<AppLayout />}>

                {/* Acessível por todos os usuários autenticados */}
                <Route path="/home" element={<Home />} />

                {/* Apenas não-instaladores (vendedor, operador, admin) */}
                <Route element={<PermissionRoute perms={["VENDEDOR","OPERADOR_AGENDA","ADMIN_MASTER"]} />}>
                  <Route path="/agendamentos"           element={<Agendamentos />} />
                  <Route path="/agendamentos/historico" element={<AgendamentosHistorico />} />
                  <Route path="/agendamentos/mapa"      element={<AgendamentosMapa />} />
                </Route>

                {/* Apenas instaladores */}
                <Route element={<PermissionRoute perms={["AGENDAMENTO_INSTALADOR"]} />}>
                  <Route path="/agendamentos/instalador" element={<AgendamentosInstalador />} />
                </Route>

                {/* Apenas Vendedor, Operador, Admin */}
                <Route element={<PermissionRoute perms={["VENDEDOR","OPERADOR_AGENDA","ADMIN_MASTER"]} />}>
                  <Route path="/clientes" element={<Clientes />} />
                </Route>

                {/* Apenas Operador e Admin */}
                <Route element={<PermissionRoute perms={["OPERADOR_AGENDA","ADMIN_MASTER"]} />}>
                  <Route path="/veiculos" element={<Veiculos />} />
                </Route>

                {/* Apenas quem pode gerenciar usuários */}
                <Route element={<PermissionRoute perms={["USUARIO_APROVAR","USUARIO_ATRIBUIR_PERMISSOES"]} />}>
                  <Route path="/usuarios" element={<Usuarios />} />
                </Route>

                {/* Relatórios — operador e admin */}
                <Route element={<PermissionRoute perms={["OPERADOR_AGENDA","ADMIN_MASTER"]} />}>
                  <Route path="/relatorios" element={<Relatorios />} />
                </Route>

                {/* Configurações — apenas admin */}
                <Route element={<PermissionRoute perms={["ADMIN_MASTER"]} />}>
                  <Route path="/expediente" element={<Configuracoes />} />
                </Route>

              </Route>
            </Route>

          </Routes>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
