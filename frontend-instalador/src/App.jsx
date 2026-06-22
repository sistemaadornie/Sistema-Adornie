import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import PrivateRoute from "./components/PrivateRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Agenda from "./pages/Agenda";
import AgendamentoDetalhe from "./pages/AgendamentoDetalhe";
import FichaTecnicaInstalador from "./pages/FichaTecnicaInstalador";
import Rotas from "./pages/Rotas";
import Abastecimento from "./pages/Abastecimento";
import Perfil from "./pages/Perfil";

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route
              element={
                <PrivateRoute>
                  <Layout />
                </PrivateRoute>
              }
            >
              <Route path="/" element={<Home />} />
              <Route path="/agenda" element={<Agenda />} />
              <Route path="/agenda/:id" element={<AgendamentoDetalhe />} />
              <Route path="/agenda/:agendamentoId/os/:osId" element={<FichaTecnicaInstalador />} />
              <Route path="/rotas" element={<Rotas />} />
              <Route path="/abastecimento" element={<Abastecimento />} />
              <Route path="/perfil" element={<Perfil />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
