import { Navigate, Outlet } from "react-router-dom";

/**
 * Protege rotas autenticadas.
 * Se não houver token ou user no localStorage, redireciona para /login.
 * Usado como wrapper de <Route element={<PrivateRoute />}> no App.jsx.
 */
export default function PrivateRoute() {
  const token = localStorage.getItem("token");
  const user  = localStorage.getItem("user");

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
