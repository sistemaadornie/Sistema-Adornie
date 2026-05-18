import { Link } from "react-router-dom";
import "./LandingPage.css";

const FEATURES = [
  {
    icon: "📅",
    title: "Calendário",
    desc: "Calendário visual completo com status em tempo real, filtros por equipe e controle de cada etapa do serviço.",
    placeholder: "Calendário de agendamentos",
    screen: "/screen-calendario.png",
  },
  {
    icon: "🗺",
    title: "Mapa de Rotas",
    desc: "Visualize todos os pontos de atendimento no mapa, otimize rotas e acompanhe o deslocamento das equipes.",
    placeholder: "Mapa com rotas otimizadas",
    screen: "/screen-mapa.png",
  },
  {
    icon: "🚗",
    title: "Veículos",
    desc: "Controle da frota com registro de quilometragem por rota e histórico de uso por equipe.",
    placeholder: "Controle de veículos",
    screen: "/screen-veiculos.png",
  },
  {
    icon: "📊",
    title: "Relatórios",
    desc: "Indicadores de desempenho, histórico de serviços e análises para apoiar decisões estratégicas.",
    placeholder: "Relatórios e indicadores",
    screen: "/screen-relatorios.png",
  },
];

export default function LandingPage() {
  return (
    <div className="lp">

      {/* ── NAV ── */}
      <nav className="lp-nav">
        <Link to="/" className="lp-nav-logo">
          <img src="/logo-adornie.png" alt="Adornie" className="lp-nav-logo-img" />
          <div className="lp-nav-logo-text">
            <span className="lp-nav-logo-sub">agenda</span>
            <span className="lp-nav-logo-main">Adornie</span>
          </div>
        </Link>
        <div className="lp-nav-actions">
          <Link to="/solicitar-acesso" className="lp-btn-ghost">Solicitar acesso</Link>
          <Link to="/login" className="lp-btn-primary">Entrar</Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="lp-hero">
        {/* Foto decorativa de fundo */}
        <div className="lp-hero-bg" />

        <div className="lp-hero-inner">
          <div className="lp-hero-eyebrow">
            <span className="lp-eyebrow-line" />
            <span>Sistema de gestão interno</span>
            <span className="lp-eyebrow-line" />
          </div>

          <div className="lp-hero-logo">
            <img src="/logo-adornie.png" alt="Adornie" className="lp-hero-logo-img" />
            <div className="lp-hero-logo-text">
              <span className="lp-hero-logo-sub">agenda</span>
              <span className="lp-hero-logo-main">Adornie</span>
            </div>
          </div>

          <p className="lp-hero-desc">
            Plataforma de gestão desenvolvida exclusivamente para a Adornie Home Decor.
            Agendamentos, equipes, clientes e rotas em um só lugar.
          </p>

          <div className="lp-hero-actions">
            <Link to="/login" className="lp-btn-primary lp-btn-lg">Acessar o sistema</Link>
            <Link to="/solicitar-acesso" className="lp-btn-outline lp-btn-lg">Solicitar acesso</Link>
          </div>
        </div>
      </section>

      {/* ── FOTOS DECORATIVAS ── */}
      <div className="lp-photos">
        <div className="lp-photo-item">
          <img src="/foto-sala.jpg" alt="Adornie — ambiente" />
        </div>
        <div className="lp-photo-item lp-photo-wide">
          <img src="/hero-adornie.jpg" alt="Adornie — showroom" />
        </div>
        <div className="lp-photo-item">
          <img src="/foto-mesa.jpg" alt="Adornie — reunião" />
        </div>
      </div>

      {/* ── FEATURES ── */}
      <section className="lp-section">
        <div className="lp-section-inner">
          <div className="lp-section-head">
            <span className="lp-section-tag">Funcionalidades</span>
            <h2 className="lp-section-title">Tudo para sua operação</h2>
            <p className="lp-section-sub">
              Cada módulo foi construído pensando nos fluxos reais da Adornie.
            </p>
          </div>

          <div className="lp-features-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="lp-feature-card">
                {f.screen ? (
                  <div className="lp-feature-screen lp-feature-screen--img">
                    <img src={f.screen} alt={f.title} className="lp-feature-screen-img" />
                  </div>
                ) : (
                  <div className="lp-feature-screen">
                    <span className="lp-feature-screen-icon">{f.icon}</span>
                    <span className="lp-feature-screen-label">{f.placeholder}</span>
                  </div>
                )}
                <div className="lp-feature-body">
                  <div className="lp-feature-title">{f.title}</div>
                  <p className="lp-feature-desc">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── QUOTE ── */}
      <div className="lp-quote-wrap">
        <div className="lp-quote">
          <div className="lp-quote-line" />
          <blockquote className="lp-quote-text">
            "Inspired by Him and for Him"
          </blockquote>
          <cite className="lp-quote-ref">RM 11:36</cite>
          <div className="lp-quote-line" />
        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer className="lp-footer">
        <Link to="/" className="lp-footer-logo">
          <img src="/logo-adornie.png" alt="Adornie" className="lp-footer-logo-img" />
          <div className="lp-footer-logo-text">
            <span className="lp-footer-logo-sub">agenda</span>
            <span className="lp-footer-logo-main">Adornie</span>
          </div>
        </Link>
        <span className="lp-footer-copy">
          © {new Date().getFullYear()} Adornie Home Decor · Todos os direitos reservados
        </span>
        <div className="lp-footer-links">
          <Link to="/login">Entrar</Link>
          <Link to="/solicitar-acesso">Solicitar acesso</Link>
        </div>
      </footer>

    </div>
  );
}
