import { useNavigate } from "react-router-dom";
import {
  FaUsers, FaCalendarAlt, FaCar, FaUserFriends, FaChartBar,
} from "react-icons/fa";
import useAuth from "../hooks/useAuth";
import "./Home.css";

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const nome = user?.nome_completo?.split(" ")[0] || "Usuário";

  const temPerm = (...perms) => perms.some((p) => user?.permissoes?.includes(p));
  const podeVerClientes   = temPerm("VENDEDOR", "OPERADOR_AGENDA", "ADMIN_MASTER");
  const podeVerVeiculos   = temPerm("OPERADOR_AGENDA", "ADMIN_MASTER");
  const podeVerUsuarios   = temPerm("USUARIO_APROVAR", "USUARIO_ATRIBUIR_PERMISSOES");
  const podeVerRelatorios = temPerm("OPERADOR_AGENDA", "ADMIN_MASTER");

  const hora = new Date().getHours();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";

  const MODULOS = [
    {
      icon: <FaCalendarAlt />,
      cor: "#6B4EFF",
      titulo: "Agendamentos",
      desc: "Gerencie serviços, visitas e manutenções com calendário e mapa.",
      rota: "/agendamentos",
    },
    ...(podeVerClientes
      ? [{
          icon: <FaUserFriends />,
          cor: "#3b82f6",
          titulo: "Clientes",
          desc: "Cadastro completo com endereços e histórico de atendimentos.",
          rota: "/clientes",
        }]
      : []),
    ...(podeVerVeiculos
      ? [{
          icon: <FaCar />,
          cor: "#10b981",
          titulo: "Veículos",
          desc: "Controle da frota com tipo, combustível e informações técnicas.",
          rota: "/veiculos",
        }]
      : []),
    ...(podeVerRelatorios
      ? [{
          icon: <FaChartBar />,
          cor: "#f59e0b",
          titulo: "Relatórios",
          desc: "Análises e indicadores de desempenho de toda a operação.",
          rota: "/relatorios",
        }]
      : []),
    ...(podeVerUsuarios
      ? [{
          icon: <FaUsers />,
          cor: "#ec4899",
          titulo: "Usuários",
          desc: "Gerencie a equipe, setores e permissões de acesso.",
          rota: "/usuarios",
        }]
      : []),
  ];

  return (
    <div className="home-page">
      <div className="home-header">
        <h1 className="home-title">{saudacao}, {nome}</h1>
        <p className="home-sub">Selecione um módulo para começar</p>
      </div>

      <div className="home-grid">
        {MODULOS.map((mod) => (
          <div
            key={mod.rota}
            className="home-card"
            onClick={() => navigate(mod.rota)}
            style={{ "--mod-color": mod.cor }}
          >
            <div className="home-card-icon">{mod.icon}</div>
            <div className="home-card-body">
              <div className="home-card-title">{mod.titulo}</div>
              <div className="home-card-desc">{mod.desc}</div>
            </div>
            <span className="home-card-btn">Acessar →</span>
          </div>
        ))}
      </div>
    </div>
  );
}
