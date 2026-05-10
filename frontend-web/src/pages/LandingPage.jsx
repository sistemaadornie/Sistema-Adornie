import { Link } from "react-router-dom";
import "./LandingPage.css";

const FEATURES = [
{ icon: "📅", title: "Agendamentos", text: "Organize visitas, instalações e manutenções com calendário visual, mapa e status em tempo real." },
  { icon: "👥", title: "Gestão de Equipe", text: "Controle de acesso por setor, permissões personalizadas e aprovação de novos membros." },
  { icon: "🗺", title: "Mapa de Operações", text: "Visualize seus agendamentos no mapa e planeje rotas com eficiência geográfica." },
  { icon: "📊", title: "Relatórios", text: "Indicadores em tempo real para tomar decisões com dados atualizados da operação." },
  { icon: "🔒", title: "Segurança", text: "Dados isolados por empresa, autenticação JWT e controle granular de permissões." },
];

const MODULES = [
{ emoji: "📅", name: "Agendamentos", desc: "Calendário, mapa e status de serviços" },
  { emoji: "👥", name: "Usuários", desc: "Equipe, setores e permissões" },
  { emoji: "🏠", name: "Dashboard", desc: "Visão geral da operação" },
];

const PLANS = [
  {
    name: "Básico",
    price: "Grátis",
    period: "",
    desc: "Para pequenas equipes começando a organizar a operação.",
    features: ["Até 3 usuários", "Agendamentos básicos", "Suporte por e-mail"],
    featured: false,
  },
  {
    name: "Profissional",
    price: "R$ 97",
    period: "/mês",
    desc: "Para empresas em crescimento que precisam de controle total.",
    features: ["Usuários ilimitados", "Todos os módulos", "Mapa de operações", "Relatórios avançados", "Suporte prioritário"],
    featured: true,
  },
  {
    name: "Empresarial",
    price: "R$ 247",
    period: "/mês",
    desc: "Para operações complexas com múltiplos setores e equipes.",
    features: ["Multi-empresa", "API de integração", "Backup diário", "Onboarding dedicado", "SLA garantido"],
    featured: false,
  },
];

export default function LandingPage() {
  return (
    <div className="lp">

      {/* FUNDO: logo Operon com blur */}
      <div className="lp-logo-blur" aria-hidden="true" />

      {/* NAV */}
      <nav className="lp-nav">
        <Link to="/" className="lp-nav-logo">
          <img src="/logooperon.png" alt="Operon" />
          <span className="lp-nav-logo-text">OPER<span>ON</span></span>
        </Link>
        <div className="lp-nav-actions">
          <Link to="/login" className="lp-btn-ghost">Entrar</Link>
          <Link to="/cadastro-usuario" className="lp-btn-ghost">Sou funcionário</Link>
          <Link to="/cadastro-empresa" className="lp-btn-primary">Criar empresa</Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="lp-hero">

        {/* Logo grande no hero */}
        <div className="lp-hero-logo">
          <img src="/logooperon.png" alt="Operon" />
          <span className="lp-hero-logo-text">OPER<span>ON</span></span>
        </div>

        <div className="lp-hero-badge">
          <span className="lp-hero-badge-dot" />
          Sistema de gestão operacional completo
        </div>

        <h1 className="lp-hero-title">
          Gestão inteligente para<br />
          <span className="lp-hero-title-accent">sua empresa crescer</span>
        </h1>

        <p className="lp-hero-sub">
          Controle equipes, agendamentos e operações em um único sistema moderno. Do campo ao escritório.
        </p>

        <div className="lp-hero-actions">
          <Link to="/cadastro-empresa" className="lp-btn-primary lp-btn-lg">
            Começar agora — grátis
          </Link>
          <Link to="/login" className="lp-btn-outline lp-btn-lg">
            Já tenho conta
          </Link>
        </div>

        <div className="lp-hero-stats">
          <div className="lp-hero-stat">
            <span className="lp-hero-stat-num">100%</span>
            <span className="lp-hero-stat-label">Web-based</span>
          </div>
          <div className="lp-hero-stat">
            <span className="lp-hero-stat-num">4+</span>
            <span className="lp-hero-stat-label">Módulos integrados</span>
          </div>
          <div className="lp-hero-stat">
            <span className="lp-hero-stat-num">∞</span>
            <span className="lp-hero-stat-label">Usuários por empresa</span>
          </div>
        </div>
      </section>

      <div className="lp-divider" />

      {/* FEATURES */}
      <section className="lp-section">
        <span className="lp-section-tag">Funcionalidades</span>
        <h2 className="lp-section-title">Tudo que sua operação precisa</h2>
        <p className="lp-section-sub">
          Ferramentas práticas para equipes de campo, gestores e administradores trabalharem em sintonia.
        </p>
        <div className="lp-features-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="lp-feature-card">
              <div className="lp-feature-icon">{f.icon}</div>
              <div className="lp-feature-title">{f.title}</div>
              <p className="lp-feature-text">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="lp-divider" />

      {/* MODULES */}
      <section className="lp-section">
        <span className="lp-section-tag">Módulos</span>
        <h2 className="lp-section-title">Uma plataforma, tudo integrado</h2>
        <p className="lp-section-sub">
          Cada módulo foi pensado para comunicar com os demais — sem planilhas separadas, sem retrabalho.
        </p>
        <div className="lp-modules-strip">
          {MODULES.map((m) => (
            <div key={m.name} className="lp-module-card">
              <div className="lp-module-emoji">{m.emoji}</div>
              <div className="lp-module-name">{m.name}</div>
              <p className="lp-module-desc">{m.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="lp-divider" />

      {/* PRICING */}
      <section className="lp-section">
        <span className="lp-section-tag">Planos</span>
        <h2 className="lp-section-title">Simples e transparente</h2>
        <p className="lp-section-sub">
          Comece de graça e escale conforme sua empresa cresce. Sem taxas escondidas.
        </p>
        <div className="lp-pricing-grid">
          {PLANS.map((p) => (
            <div key={p.name} className={`lp-plan-card${p.featured ? " featured" : ""}`}>
              {p.featured && <span className="lp-plan-featured-badge">Mais popular</span>}
              <div>
                <div className="lp-plan-name">{p.name}</div>
                <div className="lp-plan-price">
                  <span className="lp-plan-price-val">{p.price}</span>
                  {p.period && <span className="lp-plan-price-period">{p.period}</span>}
                </div>
              </div>
              <p className="lp-plan-desc">{p.desc}</p>
              <div className="lp-plan-divider" />
              <div className="lp-plan-features">
                {p.features.map((f) => (
                  <div key={f} className="lp-plan-feature">
                    <span className="lp-plan-feature-check">✓</span>
                    {f}
                  </div>
                ))}
              </div>
              <Link
                to="/cadastro-empresa"
                className={p.featured ? "lp-btn-primary" : "lp-btn-ghost"}
                style={{ textAlign: "center", justifyContent: "center" }}
              >
                {p.price === "Grátis" ? "Começar grátis" : "Assinar plano"}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* CTA FINAL */}
      <div className="lp-cta">
        <h2 className="lp-cta-title">Pronto para organizar sua operação?</h2>
        <p className="lp-cta-sub">
          Crie sua empresa agora e convide sua equipe em minutos.
        </p>
        <div className="lp-cta-actions">
          <Link to="/cadastro-empresa" className="lp-btn-primary lp-btn-lg">
            Criar minha empresa
          </Link>
          <Link to="/cadastro-usuario" className="lp-btn-outline lp-btn-lg">
            Já faço parte de uma empresa
          </Link>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="lp-footer">
        <Link to="/" className="lp-footer-logo">
          <img src="/logooperon.png" alt="Operon" />
          <span className="lp-footer-logo-text">OPER<span>ON</span></span>
        </Link>
        <span className="lp-footer-copy">© {new Date().getFullYear()} Operon. Todos os direitos reservados.</span>
        <div className="lp-footer-links">
          <Link to="/login">Login</Link>
          <Link to="/cadastro-empresa">Criar empresa</Link>
          <Link to="/cadastro-usuario">Cadastro</Link>
        </div>
      </footer>

    </div>
  );
}
