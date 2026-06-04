const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();
const { registrarLog } = require("./src/utils/securityLog");

/* ── Validação antecipada de secrets críticos ─────────────────────────────
   Em produção, valores padrão de JWT_SECRET/TOKEN_HMAC_SECRET abortam o
   servidor imediatamente — um token forjado comprometeria toda a aplicação. */
const SECRETS_INSEGUROS = new Set([
  "", "SUA_CHAVE_SUPER_SECRETA", "GERE_UM_SEGREDO_AQUI",
  "secret", "changeme", "mysecret", "password",
]);
function validarSecret(nome, valor) {
  if (SECRETS_INSEGUROS.has(valor || "")) {
    const msg = `⛔  ${nome} usa valor padrão inseguro. Gere um secret seguro:
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`;
    if (process.env.NODE_ENV === "production") {
      console.error(msg);
      process.exit(1);
    } else {
      console.warn(msg);
    }
  }
}
validarSecret("JWT_SECRET",       process.env.JWT_SECRET);
validarSecret("TOKEN_HMAC_SECRET", process.env.TOKEN_HMAC_SECRET);

// ROTAS
const authRoutes         = require("./src/routes/authRoutes");
const agendamentosRoutes = require("./src/routes/agendamentosRoutes");
const notificacoesRoutes = require("./src/routes/notificacoesRoutes");
const clientesRoutes     = require("./src/routes/clientesRoutes");
const veiculosRoutes     = require("./src/routes/veiculosRoutes");
const relatoriosRoutes   = require("./src/routes/relatoriosRoutes");
const crewRoutes         = require("./src/routes/crewRoutes");
const pedidosRoutes      = require("./src/routes/pedidosRoutes");
const crmRoutes          = require("./src/routes/crmRoutes");
const produtosRoutes     = require("./src/routes/produtosRoutes");
const fornecedoresRoutes    = require("./src/routes/fornecedoresRoutes");
const etiquetaLogosRoutes   = require("./src/routes/etiquetaLogosRoutes");
const pipelineRoutes     = require("./src/routes/pipelineRoutes");
const arquitetosRoutes   = require("./src/routes/arquitetosRoutes");
const categoriasRoutes   = require("./src/routes/categoriasRoutes");
const ordemServicoRoutes = require("./src/routes/ordemServicoRoutes");
const orcamentosRoutes   = require("./src/routes/orcamentosRoutes");
const uploadRoutes       = require("./src/routes/uploadRoutes");
const prazosRoutes       = require("./src/routes/prazosRoutes");
const dashboardRoutes    = require("./src/routes/dashboardRoutes");

const app = express();


// Confia no proxy reverso SOMENTE se explicitamente configurado.
// Sem isso, X-Forwarded-For não é usado pelo express — previne bypass de rate limit via header forjado.
// Em produção com nginx/Heroku/Railway: defina TRUST_PROXY=1 no .env
if (process.env.TRUST_PROXY) {
  app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);
}

// ── HEADERS DE SEGURANÇA (helmet) ─────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }, // permite Cloudinary CDN carregar mídias
  contentSecurityPolicy: false, // CSP gerenciado pelo frontend (Vite/React)
}));

// ── CORS ───────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : null;

// Em produção sem ALLOWED_ORIGINS configurado: bloqueia todas as origens
// (requisições sem Origin — ex: curl direto — ainda passam; apenas cross-origin é bloqueado)
// Localhost com qualquer porta é sempre permitido (Flutter web, devtools, etc.)
const isLocalhost = (origin) =>
  origin && /^https?:\/\/localhost(:\d+)?$/.test(origin);

const corsOrigin = allowedOrigins
  ? (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin) || isLocalhost(origin))
        cb(null, true);
      else cb(new Error("CORS: origem não permitida"));
    }
  : process.env.NODE_ENV === "production"
    ? false
    : true;

if (process.env.NODE_ENV === "production" && !allowedOrigins) {
  console.warn("⚠  ALLOWED_ORIGINS não configurado — requisições cross-origin bloqueadas em produção.");
}

app.use(cors({ origin: corsOrigin, credentials: true }));

// ── RATE LIMITING ─────────────────────────────────────────────────────────
// Limit geral — valor alto pois é sistema interno com usuários autenticados
app.use("/api/", rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Muitas requisições. Tente novamente em alguns minutos." },
}));

// Limit mais restrito no login (previne brute-force)
app.use("/api/auth/login", rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Muitas tentativas de login. Aguarde 15 minutos." },
}));

// Limit de reset de senha por IP — previne spam de e-mail e enumeração
app.use("/api/auth/solicitar-reset", rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    registrarLog("reset_bloqueado_ip", { ip: req.ip });
    res.status(429).json({ message: "Muitas solicitações deste endereço. Aguarde 15 minutos." });
  },
}));

// Limit no endpoint de uso do token — previne brute-force
app.use("/api/auth/resetar-senha", rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    registrarLog("reset_bloqueado_ip", { ip: req.ip, detalhes: { endpoint: "resetar-senha" } });
    res.status(429).json({ message: "Muitas tentativas. Aguarde 15 minutos." });
  },
}));

// Limita o body JSON a 1 MB — previne ataques de payload gigante
app.use(express.json({ limit: "1mb" }));

// Rotas
app.use("/api/auth",          authRoutes);
app.use("/api/agendamentos",  agendamentosRoutes);
app.use("/api/notificacoes",  notificacoesRoutes);
app.use("/api/clientes",      clientesRoutes);
app.use("/api/veiculos",      veiculosRoutes);
app.use("/api/relatorios",    relatoriosRoutes);
app.use("/api/crews",         crewRoutes);
app.use("/api/pedidos",       pedidosRoutes);
app.use("/api/dashboard",     dashboardRoutes);
app.use("/api/crm",           crmRoutes);
app.use("/api/produtos",      produtosRoutes);
app.use("/api/fornecedores",   fornecedoresRoutes);
app.use("/api/etiqueta-logos", etiquetaLogosRoutes);
app.use("/api/pipeline",      pipelineRoutes);
app.use("/api/arquitetos",    arquitetosRoutes);
app.use("/api/categorias",   categoriasRoutes);
app.use("/api/os",           ordemServicoRoutes);
app.use("/api/orcamentos",   orcamentosRoutes);
app.use("/api/pedidos/config/prazos", prazosRoutes);
app.use("/api",              uploadRoutes);

// Porta
const PORT = process.env.PORT || 3001;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});