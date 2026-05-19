import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import AppLayout      from "./layouts/AppLayout";
import PrivateRoute   from "./components/PrivateRoute";
import PermissionRoute from "./components/PermissionRoute";
import ErrorBoundary  from "./components/ErrorBoundary";

// ── Rotas públicas ──────────────────────────────────────
const LandingPage      = lazy(() => import("./pages/LandingPage"));
const Login            = lazy(() => import("./pages/Login"));
const RegisterUsuario  = lazy(() => import("./pages/RegisterUsuario"));
const ResetarSenha     = lazy(() => import("./pages/ResetarSenha"));
const DevSetup         = lazy(() => import("./pages/DevSetup"));

// ── Rotas privadas ──────────────────────────────────────
const Home                   = lazy(() => import("./pages/Home"));
const Usuarios               = lazy(() => import("./pages/Usuarios"));
const Clientes               = lazy(() => import("./pages/clientes/Clientes"));
const Agendamentos           = lazy(() => import("./pages/agendamentos/Agendamentos"));
const AgendamentosHistorico  = lazy(() => import("./pages/agendamentos/AgendamentosHistorico"));
const AgendamentosMapa       = lazy(() => import("./pages/agendamentos/MapaAgendamentos"));
const Veiculos               = lazy(() => import("./pages/veiculos/Veiculos"));
const VeiculosHistorico      = lazy(() => import("./pages/veiculos/VeiculosHistorico"));
const Relatorios             = lazy(() => import("./pages/Relatorios"));
const Configuracoes          = lazy(() => import("./pages/Configuracoes"));

import "./styles/theme.css";
import "./styles/globals.css";
import "./styles/layout.css";
import "./styles/utilities.css";
import "./styles/components.css";
import "./styles/forms.css";
import "./styles/auth.css";
import "./styles/shared.css";

function PageLoader() {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: "100vh", background: "var(--color-bg)",
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        border: "2px solid var(--color-border)",
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
            <Route path="/"                 element={<LandingPage />} />
            <Route path="/login"            element={<Login />} />
            <Route path="/solicitar-acesso" element={<RegisterUsuario />} />
            <Route path="/resetar-senha"    element={<ResetarSenha />} />

            {/* ── ROTA DEV (não linkada publicamente) ── */}
            <Route path="/dev" element={<DevSetup />} />

            {/* ── ROTAS PRIVADAS ── */}
            <Route element={<PrivateRoute />}>
              <Route element={<AppLayout />}>

                <Route path="/home" element={<Home />} />

                <Route element={<PermissionRoute perms={["INSTALADOR","COMERCIAL","OPERADOR_AGENDA","ADMIN_MASTER","GESTOR_USUARIOS"]} />}>
                  <Route path="/agendamentos"           element={<Agendamentos />} />
                  <Route path="/agendamentos/historico" element={<AgendamentosHistorico />} />
                </Route>

                <Route element={<PermissionRoute perms={["INSTALADOR","COMERCIAL","OPERADOR_AGENDA","ADMIN_MASTER","GESTOR_USUARIOS"]} />}>
                  <Route path="/agendamentos/mapa" element={<AgendamentosMapa />} />
                </Route>

                <Route element={<PermissionRoute perms={["COMERCIAL","OPERADOR_AGENDA","ADMIN_MASTER","GESTOR_USUARIOS"]} />}>
                  <Route path="/clientes" element={<Clientes />} />
                </Route>

                <Route element={<PermissionRoute perms={["INSTALADOR","OPERADOR_AGENDA","ADMIN_MASTER","GESTOR_USUARIOS"]} />}>
                  <Route path="/veiculos"           element={<Veiculos />} />
                  <Route path="/veiculos/historico" element={<VeiculosHistorico />} />
                </Route>

                <Route element={<PermissionRoute perms={["GESTOR_USUARIOS","ADMIN_MASTER"]} />}>
                  <Route path="/usuarios" element={<Usuarios />} />
                </Route>

                <Route element={<PermissionRoute perms={["OPERADOR_AGENDA","ADMIN_MASTER"]} />}>
                  <Route path="/relatorios" element={<Relatorios />} />
                </Route>

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
