const express = require("express");
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const crypto  = require("crypto");

const db = require("../database/db");
const cloudinary = require("../config/cloudinary");
const upload = require("../middlewares/uploadMemory");
const { validarMagicBytes } = require("../middlewares/uploadMemory");
const streamifier = require("streamifier");

const authMiddleware = require("../middlewares/authMiddleware");
const permissionMiddleware = require("../middlewares/permissionMiddleware");
const { enviarResetSenha } = require("../services/emailService");
const { registrarLog }    = require("../utils/securityLog");

const router = express.Router();

const ACCESS_EXPIRY  = process.env.JWT_EXPIRY           || "1d";
const REFRESH_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || "7d";

/* ── HMAC para tokens de reset ── */
function hashToken(raw) {
  const secret = process.env.TOKEN_HMAC_SECRET || process.env.JWT_SECRET;
  return crypto.createHmac("sha256", secret).update(raw).digest("hex");
}

/* ── helper: ler cookie de um header ── */
function parseCookie(req, name) {
  const header = req.headers.cookie || "";
  const match  = header.split(";").find((c) => c.trim().startsWith(name + "="));
  return match ? decodeURIComponent(match.trim().slice(name.length + 1)) : null;
}

/* ── helper: opções do cookie de refresh ── */
function refreshCookieOpts() {
  return {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge:   7 * 24 * 60 * 60 * 1000,
    path:     "/api/auth",
  };
}

/* ── helper: gera e persiste refresh token ── */
async function emitirRefreshToken(res, usuarioId) {
  const raw  = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");

  await db.query(
    `INSERT INTO refresh_tokens (usuario_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
    [usuarioId, hash]
  );

  res.cookie("refreshToken", raw, refreshCookieOpts());
  return raw;
}

/* ── migration: tabela de refresh tokens ── */
db.query(`
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          SERIAL PRIMARY KEY,
    usuario_id  INTEGER NOT NULL,
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(() => {});
db.query(`CREATE INDEX IF NOT EXISTS idx_rt_usuario ON refresh_tokens(usuario_id)`).catch(() => {});

/* ── migration: tabela de tokens de reset de senha ── */
db.query(`
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id                 SERIAL PRIMARY KEY,
    usuario_id         INTEGER NOT NULL,
    token_hash         TEXT NOT NULL,
    expires_at         TIMESTAMPTZ NOT NULL,
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    ip_criacao         TEXT,
    user_agent_criacao TEXT
  )
`).catch(() => {});
/* Garante que só existe 1 token por usuário — previne múltiplos tokens válidos simultâneos */
db.query(`CREATE UNIQUE INDEX IF NOT EXISTS uidx_prt_usuario ON password_reset_tokens(usuario_id)`).catch(() => {});
/* Colunas de contexto — adicionadas em tabelas já existentes */
db.query(`ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS ip_criacao TEXT`).catch(() => {});
db.query(`ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS user_agent_criacao TEXT`).catch(() => {});

/* ── migration: tabela de logs de segurança ── */
db.query(`
  CREATE TABLE IF NOT EXISTS security_logs (
    id          SERIAL PRIMARY KEY,
    tipo        TEXT NOT NULL,
    ip          TEXT,
    usuario_id  INTEGER,
    detalhes    JSONB,
    criado_em   TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(() => {});
db.query(`CREATE INDEX IF NOT EXISTS idx_sl_tipo ON security_logs(tipo)`).catch(() => {});
db.query(`CREATE INDEX IF NOT EXISTS idx_sl_criado ON security_logs(criado_em DESC)`).catch(() => {});

/* ── HELPER UPLOAD ── */
function uploadToCloudinary(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (err, result) => { if (err) return reject(err); resolve(result); }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

/* ==========================
   MIGRAÇÃO: coluna solicitar_reset + novas permissões
========================== */
db.query(
  `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS solicitar_reset BOOLEAN DEFAULT false`
).catch(() => {});

/* ============================================================
   MIGRATION: Canonicalizar setores de todas as empresas
   Substitui quaisquer setores existentes pelos 4 canônicos.
   ============================================================ */
(async () => {
  const SETORES_CANONICOS = [
    "Administração",
    "Instalação",
    "Comercial",
    "Operador de Agenda",
  ];

  try {
    const empresas = await db.query(`SELECT id FROM empresas WHERE status = 'ativa'`);

    for (const empresa of empresas.rows) {
      const empId = empresa.id;

      /* Garantir que os 4 setores canônicos existam */
      const setoresIds = {};
      for (const nome of SETORES_CANONICOS) {
        const existe = await db.query(
          `SELECT id FROM setores WHERE nome = $1 AND empresa_id = $2 LIMIT 1`,
          [nome, empId]
        );
        if (existe.rows.length > 0) {
          setoresIds[nome] = existe.rows[0].id;
        } else {
          const novo = await db.query(
            `INSERT INTO setores (nome, empresa_id) VALUES ($1, $2) RETURNING id`,
            [nome, empId]
          );
          setoresIds[nome] = novo.rows[0].id;
        }
      }

      /* Mover usuários de setores não-canônicos para "Administração" */
      await db.query(
        `UPDATE usuarios
         SET setor_id = $1
         WHERE empresa_id = $2
           AND setor_id NOT IN (
             SELECT id FROM setores
             WHERE nome = ANY($3::text[])
               AND empresa_id = $2
           )`,
        [setoresIds["Administração"], empId, SETORES_CANONICOS]
      );

      /* Remover setores não-canônicos (sem usuários agora) */
      await db.query(
        `DELETE FROM setores
         WHERE empresa_id = $1
           AND nome NOT IN (${SETORES_CANONICOS.map((_, i) => `$${i + 2}`).join(",")})`,
        [empId, ...SETORES_CANONICOS]
      );
    }

    console.log("[setores] Canonicalização concluída — 4 setores por empresa.");
  } catch (err) {
    console.error("[setores] Erro na canonicalização:", err.message);
  }
})();

/* ============================================================
   MIGRATION: Canonicalizar tabela de permissões
   Remove tudo que não está na lista e garante as 6 certas.
   ============================================================ */
(async () => {
  const PERMISSOES_CANONICAS = [
    {
      codigo: "INSTALADOR",
      nome_exibicao: "Instalador",
      descricao: "Acessa o calendário, executa agendamentos da sua equipe e registra abastecimentos.",
      modulo: "Campo",
      ordem: 1,
    },
    {
      codigo: "COMERCIAL",
      nome_exibicao: "Comercial",
      descricao: "Cria e gerencia clientes e os próprios agendamentos.",
      modulo: "Operação",
      ordem: 2,
    },
    {
      codigo: "OPERADOR_AGENDA",
      nome_exibicao: "Operador de Agenda",
      descricao: "Gerencia toda a operação: agendamentos, clientes, veículos e relatórios.",
      modulo: "Operação",
      ordem: 3,
    },
    {
      codigo: "GESTOR_USUARIOS",
      nome_exibicao: "Gestor de Usuários",
      descricao: "Aprova usuários, atribui permissões, gerencia acessos e senhas.",
      modulo: "Administração",
      ordem: 4,
    },
    {
      codigo: "ADMIN_MASTER",
      nome_exibicao: "Admin Master",
      descricao: "Acesso total ao sistema.",
      modulo: "Administração",
      ordem: 5,
    },
    {
      codigo: "KANBAN_VIEW",
      nome_exibicao: "Kanban — Visualizar",
      descricao: "Visualiza o Kanban de Fluxo de Vendas e todos os projetos.",
      modulo: "Kanban",
      ordem: 6,
    },
    {
      codigo: "KANBAN_COMPRAS",
      nome_exibicao: "Kanban — Compras",
      descricao: "Marca itens como chegados em loja e define prazos de entrega.",
      modulo: "Kanban",
      ordem: 7,
    },
    {
      codigo: "KANBAN_CONFECCAO",
      nome_exibicao: "Kanban — Confecção",
      descricao: "Marca itens em confecção como concluídos.",
      modulo: "Kanban",
      ordem: 8,
    },
    {
      codigo: "KANBAN_ADMIN",
      nome_exibicao: "Kanban — Admin",
      descricao: "Reencaminha projetos para etapas anteriores e aprova na verificação admin.",
      modulo: "Kanban",
      ordem: 9,
    },
    {
      codigo: "KANBAN_CONFIG",
      nome_exibicao: "Kanban — Configuração",
      descricao: "Acessa a tela de configuração de prazos do Kanban.",
      modulo: "Kanban",
      ordem: 10,
    },
  ];

  try {
    const codigos = PERMISSOES_CANONICAS.map((p) => p.codigo);

    /* 1. Remover usuario_permissoes que apontam para permissões não-canônicas */
    await db.query(
      `DELETE FROM usuario_permissoes
       WHERE permissao_id IN (
         SELECT id FROM permissoes
         WHERE codigo NOT IN (${codigos.map((_, i) => `$${i + 1}`).join(",")})
           AND nome  NOT IN (${codigos.map((_, i) => `$${i + 1}`).join(",")})
       )`,
      codigos
    );

    /* 2. Remover permissões não-canônicas */
    await db.query(
      `DELETE FROM permissoes
       WHERE codigo NOT IN (${codigos.map((_, i) => `$${i + 1}`).join(",")})
         AND nome   NOT IN (${codigos.map((_, i) => `$${i + 1}`).join(",")})`,
      codigos
    );

    /* 3. Inserir ou atualizar as permissões canônicas */
    for (const p of PERMISSOES_CANONICAS) {
      const existe = await db.query(
        `SELECT id FROM permissoes WHERE codigo = $1 OR nome = $1 LIMIT 1`,
        [p.codigo]
      );
      if (existe.rows.length === 0) {
        await db.query(
          `INSERT INTO permissoes (codigo, nome, nome_exibicao, descricao, modulo, ordem, ativo)
           VALUES ($1,$1,$2,$3,$4,$5,true)`,
          [p.codigo, p.nome_exibicao, p.descricao, p.modulo, p.ordem]
        );
      } else {
        await db.query(
          `UPDATE permissoes
           SET nome_exibicao=$2, descricao=$3, modulo=$4, ordem=$5, ativo=true
           WHERE codigo=$1 OR nome=$1`,
          [p.codigo, p.nome_exibicao, p.descricao, p.modulo, p.ordem]
        );
      }
    }

    console.log(`[permissoes] Canonicalização concluída — ${PERMISSOES_CANONICAS.length} permissões ativas.`);
  } catch (err) {
    console.error("[permissoes] Erro na canonicalização:", err.message);
  }
})();

/* ==========================
   HELPERS
========================== */
function limparCPF(cpf = "") {
  return String(cpf).replace(/\D/g, "");
}

/* ==========================
   EMPRESAS - LISTAR ATIVAS
========================== */
router.get("/empresas", async (req, res) => {
  try {
    const result = await db.query(
      `
      SELECT id, nome_fantasia
      FROM empresas
      WHERE status = 'ativa'
      ORDER BY nome_fantasia ASC
      `
    );

    return res.status(200).json({ empresas: result.rows });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao buscar empresas." });
  }
});

/* ==========================
   SETORES - LISTAR POR EMPRESA
========================== */
router.get("/setores", async (req, res) => {
  try {
    const { empresa_id } = req.query;

    if (!empresa_id) {
      return res.status(400).json({ message: "empresa_id é obrigatório." });
    }

    const result = await db.query(
      `
      SELECT id, nome
      FROM setores
      WHERE empresa_id = $1
      ORDER BY nome ASC
      `,
      [empresa_id]
    );

    return res.status(200).json({ setores: result.rows });
  } catch (error) {
    console.error("Erro ao buscar setores:", error);
    return res.status(500).json({ message: "Erro ao buscar setores." });
  }
});

/* ==========================
   REGISTER
========================== */
router.post("/register", async (req, res) => {
  try {
    let { email, senha, nome_completo, cpf, setor_id, empresa_id } = req.body;

    cpf = limparCPF(cpf);

    if (!email || !senha || !nome_completo || !cpf || !setor_id || !empresa_id) {
      return res.status(400).json({ message: "Preencha todos os campos obrigatórios." });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Informe um e-mail válido." });
    }

    if (senha.length < 8) {
      return res.status(400).json({ message: "A senha deve ter pelo menos 8 caracteres." });
    }

    if (cpf.length !== 11) {
      return res.status(400).json({ message: "CPF inválido." });
    }

    const existe = await db.query("SELECT id FROM usuarios WHERE email = $1", [email]);

    if (existe.rows.length > 0) {
      return res.status(400).json({ message: "Email já cadastrado." });
    }

    const cpfExistente = await db.query("SELECT id FROM usuarios WHERE cpf = $1", [cpf]);

    if (cpfExistente.rows.length > 0) {
      return res.status(400).json({ message: "CPF já cadastrado." });
    }

    const empresaExiste = await db.query(
      `
      SELECT id
      FROM empresas
      WHERE id = $1 AND status = 'ativa'
      `,
      [empresa_id]
    );

    if (empresaExiste.rows.length === 0) {
      return res.status(400).json({ message: "Empresa inválida." });
    }

    const setorValido = await db.query(
      `
      SELECT id
      FROM setores
      WHERE id = $1 AND empresa_id = $2
      `,
      [setor_id, empresa_id]
    );

    if (setorValido.rows.length === 0) {
      return res.status(400).json({ message: "Setor inválido para a empresa selecionada." });
    }

    const senhaCriptografada = await bcrypt.hash(senha, 10);

    const novoUsuario = await db.query(
      `
      INSERT INTO usuarios (email, senha, nome_completo, cpf, setor_id, empresa_id, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'pendente')
      RETURNING id, email, nome_completo, status, empresa_id, setor_id
      `,
      [email, senhaCriptografada, nome_completo, cpf, setor_id, empresa_id]
    );

    const usuarioCriado = novoUsuario.rows[0];

    /* Novos usuários ficam sem permissões até o admin atribuir o perfil correto */

    return res.status(201).json({
      message: "Usuário cadastrado! Aguarde aprovação.",
      user: usuarioCriado,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Erro no servidor." });
  }
});

/* ==========================
   REGISTER EMPRESA
========================== */
router.post("/register-empresa", async (req, res) => {
  try {
    let {
      nome_fantasia,
      razao_social,
      cnpj,
      email_empresa,
      telefone,
      nome_responsavel,
      email_responsavel,
      cpf_responsavel,
      senha,
    } = req.body;

    cpf_responsavel = limparCPF(cpf_responsavel);
    cnpj = String(cnpj || "").replace(/\D/g, "");

    if (
      !nome_fantasia ||
      !cnpj ||
      !email_empresa ||
      !telefone ||
      !nome_responsavel ||
      !email_responsavel ||
      !cpf_responsavel ||
      !senha
    ) {
      return res.status(400).json({
        message: "Preencha todos os campos obrigatórios.",
      });
    }

    const empresaExistente = await db.query(
      "SELECT id FROM empresas WHERE cnpj = $1",
      [cnpj]
    );

    if (empresaExistente.rows.length > 0) {
      return res.status(400).json({
        message: "Já existe uma empresa cadastrada com esse CNPJ.",
      });
    }

    const usuarioExistente = await db.query(
      "SELECT id FROM usuarios WHERE email = $1",
      [email_responsavel]
    );

    if (usuarioExistente.rows.length > 0) {
      return res.status(400).json({
        message: "Já existe um usuário cadastrado com esse email.",
      });
    }

    const senhaCriptografada = await bcrypt.hash(senha, 10);

    await db.query("BEGIN");

    const novaEmpresa = await db.query(
      `
      INSERT INTO empresas (
        nome_fantasia,
        razao_social,
        cnpj,
        email,
        telefone,
        plano,
        status
      )
      VALUES ($1, $2, $3, $4, $5, 'basico', 'ativa')
      RETURNING id, nome_fantasia
      `,
      [nome_fantasia, razao_social || null, cnpj, email_empresa, telefone]
    );

    const empresa = novaEmpresa.rows[0];

    const setoresCanonicos = ["Administração", "Instalação", "Comercial", "Operador de Agenda"];
    let setorAdminId = null;
    for (const nomeSetor of setoresCanonicos) {
      const res = await db.query(
        `INSERT INTO setores (nome, empresa_id) VALUES ($1, $2) RETURNING id`,
        [nomeSetor, empresa.id]
      );
      if (nomeSetor === "Administração") setorAdminId = res.rows[0].id;
    }
    const setorAdmin = { id: setorAdminId };

    const novoUsuario = await db.query(
      `
      INSERT INTO usuarios (
        email,
        senha,
        nome_completo,
        cpf,
        setor_id,
        empresa_id,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'aprovado')
      RETURNING id, email, nome_completo, empresa_id, setor_id, status
      `,
      [
        email_responsavel,
        senhaCriptografada,
        nome_responsavel,
        cpf_responsavel,
        setorAdmin.id,
        empresa.id,
      ]
    );

    const usuarioAdmin = novoUsuario.rows[0];

    const permissoesResult = await db.query(
      `
      SELECT id
      FROM permissoes
      WHERE ativo = true OR ativo IS NULL
      `
    );

    for (const perm of permissoesResult.rows) {
      await db.query(
        `
        INSERT INTO usuario_permissoes (usuario_id, permissao_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        `,
        [usuarioAdmin.id, perm.id]
      );
    }

    await db.query("COMMIT");

    const allPerms = permissoesResult.rows.map((p) => p.id); // já buscado acima
    const permissoesCodigos = ["ADMIN_MASTER","OPERADOR_AGENDA","COMERCIAL","INSTALADOR","GESTOR_USUARIOS"];

    const token = jwt.sign(
      {
        id:            usuarioAdmin.id,
        email:         usuarioAdmin.email,
        nome_completo: usuarioAdmin.nome_completo,
        foto_url:      null,
        status:        usuarioAdmin.status,
        empresa_id:    usuarioAdmin.empresa_id,
        setor_id:      usuarioAdmin.setor_id,
        permissoes:    permissoesCodigos,
        type:          "access",
      },
      process.env.JWT_SECRET,
      { expiresIn: ACCESS_EXPIRY }
    );

    const refreshToken = await emitirRefreshToken(res, usuarioAdmin.id);

    return res.status(201).json({
      message: "Empresa cadastrada com sucesso!",
      token,
      refreshToken,
      empresa: {
        id:           empresa.id,
        nome_fantasia: empresa.nome_fantasia,
        email:        email_empresa,
      },
      user: {
        id:           usuarioAdmin.id,
        email:        usuarioAdmin.email,
        nome_completo: usuarioAdmin.nome_completo,
        empresa_id:   usuarioAdmin.empresa_id,
        empresa_nome: empresa.nome_fantasia,
        setor_id:     usuarioAdmin.setor_id,
        setor_nome:   setorAdmin.nome,
        status:       usuarioAdmin.status,
        permissoes:   permissoesCodigos,
      },
    });
  } catch (error) {
    await db.query("ROLLBACK");
    console.error(error);
    return res.status(500).json({ message: "Erro ao cadastrar empresa." });
  }
});

/* ==========================
   LOGIN
========================== */
router.post("/login", async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ message: "Preencha todos os campos." });
    }

    const resultado = await db.query(
      `
      SELECT 
        u.*,
        s.nome AS setor_nome,
        e.nome_fantasia AS empresa_nome
      FROM usuarios u
      LEFT JOIN setores s ON s.id = u.setor_id
      LEFT JOIN empresas e ON e.id = u.empresa_id
      WHERE u.email = $1
      `,
      [email]
    );

    if (resultado.rows.length === 0) {
      return res.status(400).json({ message: "Email ou senha inválidos." });
    }

    const usuario = resultado.rows[0];

    if (usuario.status !== "aprovado") {
      return res.status(403).json({
        message: "Conta ainda não aprovada. Aguarde um responsável liberar.",
      });
    }

    const senhaCorreta = await bcrypt.compare(senha, usuario.senha);

    if (!senhaCorreta) {
      return res.status(400).json({ message: "Email ou senha inválidos." });
    }

    const permissoesResult = await db.query(
      `
      SELECT COALESCE(p.codigo, p.nome) AS codigo
      FROM usuario_permissoes up
      JOIN permissoes p ON p.id = up.permissao_id
      WHERE up.usuario_id = $1
      `,
      [usuario.id]
    );

    const permissoes = permissoesResult.rows.map((p) => p.codigo);

    const token = jwt.sign(
      {
        id:            usuario.id,
        email:         usuario.email,
        nome_completo: usuario.nome_completo,
        foto_url:      usuario.foto_url || null,
        status:        usuario.status,
        empresa_id:    usuario.empresa_id,
        setor_id:      usuario.setor_id,
        permissoes,
        type:          "access",
      },
      process.env.JWT_SECRET,
      { expiresIn: ACCESS_EXPIRY }
    );

    const refreshToken = await emitirRefreshToken(res, usuario.id);

    return res.status(200).json({
      message: "Login realizado com sucesso!",
      token,
      refreshToken,
      user: {
        id:          usuario.id,
        email:       usuario.email,
        nome_completo: usuario.nome_completo,
        foto_url:    usuario.foto_url,
        setor_id:    usuario.setor_id,
        setor_nome:  usuario.setor_nome,
        empresa_id:  usuario.empresa_id,
        empresa_nome: usuario.empresa_nome,
        status:      usuario.status,
        permissoes,
      },
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Erro no servidor." });
  }
});

/* ==========================
   SOLICITAR RESET DE SENHA (público)
========================== */
router.post("/solicitar-reset", async (req, res) => {
  const ip = req.ip;
  // Resposta genérica — não revela se o e-mail existe no sistema
  const MSG_GENERICA = "Se esse e-mail estiver cadastrado, você receberá um link de recuperação em instantes.";
  // Tempo mínimo de resposta para equalizar timing entre email existente e inexistente
  const TEMPO_MINIMO_MS = 600;
  const inicio = Date.now();
  const responder = (status, body) => {
    const elapsed = Date.now() - inicio;
    const delay = Math.max(0, TEMPO_MINIMO_MS - elapsed);
    return new Promise((resolve) => setTimeout(() => resolve(res.status(status).json(body)), delay));
  };

  try {
    const { email } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Informe um e-mail válido." });
    }

    const emailNorm = email.trim().toLowerCase();

    registrarLog("reset_solicitado", { ip, detalhes: { email: emailNorm } });

    const resultado = await db.query(
      `SELECT id, nome_completo, status FROM usuarios WHERE LOWER(email) = $1`,
      [emailNorm]
    );

    if (resultado.rows.length === 0) {
      return responder(200, { message: MSG_GENERICA });
    }

    const usuario = resultado.rows[0];

    if (usuario.status === "bloqueado") {
      return responder(200, { message: MSG_GENERICA });
    }

    // Rate limit por e-mail — bloqueia se já existe token criado nos últimos 5 min
    const recenteCheck = await db.query(
      `SELECT 1 FROM password_reset_tokens
       WHERE usuario_id = $1 AND created_at > NOW() - INTERVAL '5 minutes'
       LIMIT 1`,
      [usuario.id]
    );
    if (recenteCheck.rows.length > 0) {
      registrarLog("reset_bloqueado_email", { ip, usuario_id: usuario.id });
      return res.status(429).json({
        message: "Aguarde alguns minutos antes de solicitar um novo link.",
      });
    }

    // Gera token seguro — raw vai no e-mail (no fragment #), HMAC no banco
    const tokenRaw  = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(tokenRaw);
    const userAgent = req.headers["user-agent"] || null;

    // UPSERT atômico — garante que só existe 1 token válido por usuário a qualquer momento
    await db.query(
      `INSERT INTO password_reset_tokens
         (usuario_id, token_hash, expires_at, created_at, ip_criacao, user_agent_criacao)
       VALUES ($1, $2, NOW() + INTERVAL '1 hour', NOW(), $3, $4)
       ON CONFLICT (usuario_id) DO UPDATE
         SET token_hash         = EXCLUDED.token_hash,
             expires_at         = EXCLUDED.expires_at,
             created_at         = NOW(),
             ip_criacao         = EXCLUDED.ip_criacao,
             user_agent_criacao = EXCLUDED.user_agent_criacao`,
      [usuario.id, tokenHash, ip, userAgent]
    );

    // Dispara e-mail sem bloquear resposta — erros de SMTP ficam só no log do servidor
    enviarResetSenha(emailNorm, usuario.nome_completo, tokenRaw, ip).catch((err) => {
      console.error("[reset] Falha ao enviar e-mail:", err.message);
    });

    return responder(200, { message: MSG_GENERICA });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro no servidor." });
  }
});

/* ==========================
   RESETAR SENHA VIA TOKEN (público)
========================== */
router.post("/resetar-senha", async (req, res) => {
  const ip = req.ip;
  try {
    const { token, nova_senha } = req.body;

    if (!token || !nova_senha) {
      return res.status(400).json({ message: "Token e nova senha são obrigatórios." });
    }

    if (nova_senha.length < 8) {
      return res.status(400).json({ message: "A senha deve ter pelo menos 8 caracteres." });
    }

    const tokenHash = hashToken(token);

    const resultado = await db.query(
      `SELECT prt.id, prt.usuario_id, prt.expires_at,
              prt.ip_criacao, prt.user_agent_criacao,
              u.status, u.email, u.nome_completo, u.foto_url,
              u.setor_id, u.empresa_id,
              s.nome AS setor_nome, e.nome_fantasia AS empresa_nome
       FROM password_reset_tokens prt
       JOIN usuarios u ON u.id = prt.usuario_id
       LEFT JOIN setores s  ON s.id  = u.setor_id
       LEFT JOIN empresas e ON e.id  = u.empresa_id
       WHERE prt.token_hash = $1`,
      [tokenHash]
    );

    if (resultado.rows.length === 0) {
      registrarLog("reset_token_invalido", { ip });
      return res.status(400).json({ message: "Link inválido ou já utilizado." });
    }

    const registro = resultado.rows[0];

    if (new Date(registro.expires_at) < new Date()) {
      await db.query(`DELETE FROM password_reset_tokens WHERE usuario_id = $1`, [registro.usuario_id]);
      registrarLog("reset_token_expirado", { ip, usuario_id: registro.usuario_id });
      return res.status(400).json({ message: "Este link expirou. Solicite um novo." });
    }

    if (registro.status === "bloqueado") {
      return res.status(403).json({ message: "Conta bloqueada. Entre em contato com o administrador." });
    }

    // Alerta se o IP de uso diferir muito do de criação (apenas log — IPs mudam legitimamente)
    if (registro.ip_criacao && registro.ip_criacao !== ip) {
      registrarLog("reset_ip_diferente", {
        ip,
        usuario_id: registro.usuario_id,
        detalhes: { ip_criacao: registro.ip_criacao, ip_uso: ip },
      });
    }

    const hash = await bcrypt.hash(nova_senha, 10);

    await db.query(
      `UPDATE usuarios SET senha = $1, solicitar_reset = false WHERE id = $2`,
      [hash, registro.usuario_id]
    );

    // Invalida TODOS os tokens de reset + TODAS as sessões ativas (refresh tokens)
    await db.query(`DELETE FROM password_reset_tokens WHERE usuario_id = $1`, [registro.usuario_id]);
    await db.query(`DELETE FROM refresh_tokens WHERE usuario_id = $1`, [registro.usuario_id]);

    registrarLog("reset_concluido", { ip, usuario_id: registro.usuario_id });

    // Auto-login — busca permissões e emite JWT para o usuário não precisar fazer login manual
    const permissoesResult = await db.query(
      `SELECT COALESCE(p.codigo, p.nome) AS codigo
       FROM usuario_permissoes up
       JOIN permissoes p ON p.id = up.permissao_id
       WHERE up.usuario_id = $1`,
      [registro.usuario_id]
    );
    const permissoes = permissoesResult.rows.map((p) => p.codigo);

    const accessToken = jwt.sign(
      {
        id:            registro.usuario_id,
        email:         registro.email,
        nome_completo: registro.nome_completo,
        foto_url:      registro.foto_url || null,
        status:        registro.status,
        empresa_id:    registro.empresa_id,
        setor_id:      registro.setor_id,
        permissoes,
        type:          "access",
      },
      process.env.JWT_SECRET,
      { expiresIn: ACCESS_EXPIRY }
    );

    await emitirRefreshToken(res, registro.usuario_id);

    return res.status(200).json({
      message: "Senha alterada com sucesso!",
      token: accessToken,
      user: {
        id:           registro.usuario_id,
        email:        registro.email,
        nome_completo: registro.nome_completo,
        foto_url:     registro.foto_url,
        setor_id:     registro.setor_id,
        setor_nome:   registro.setor_nome,
        empresa_id:   registro.empresa_id,
        empresa_nome: registro.empresa_nome,
        status:       registro.status,
        permissoes,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro no servidor." });
  }
});

/* ==========================
   ADMIN - LISTAR PENDENTES
========================== */
router.get(
  "/admin/usuarios-pendentes",
  authMiddleware,
  permissionMiddleware("GESTOR_USUARIOS"),
  async (req, res) => {
    try {
      const resultado = await db.query(
        `
        SELECT u.id, u.email, u.nome_completo, u.cpf, u.status, u.setor_id, u.foto_url, s.nome as setor
        FROM usuarios u
        LEFT JOIN setores s ON s.id = u.setor_id
        WHERE u.status = 'pendente'
          AND u.empresa_id = $1
        ORDER BY u.id
        `,
        [req.user.empresa_id]
      );

      return res.status(200).json({ usuarios: resultado.rows });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: "Erro no servidor." });
    }
  }
);

/* ==========================
   ADMIN - LISTAR SOLICITAÇÕES DE RESET
========================== */
router.get(
  "/admin/solicitacoes-reset",
  authMiddleware,
  permissionMiddleware("GESTOR_USUARIOS"),
  async (req, res) => {
    try {
      const resultado = await db.query(
        `
        SELECT u.id, u.email, u.nome_completo, u.cpf, u.status, u.setor_id, u.foto_url, s.nome as setor
        FROM usuarios u
        LEFT JOIN setores s ON s.id = u.setor_id
        WHERE u.solicitar_reset = true
          AND u.empresa_id = $1
        ORDER BY u.id
        `,
        [req.user.empresa_id]
      );

      return res.status(200).json({ usuarios: resultado.rows });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Erro no servidor." });
    }
  }
);

/* ==========================
   ADMIN - LISTAR TODOS
========================== */
router.get(
  "/admin/usuarios",
  authMiddleware,
  permissionMiddleware("GESTOR_USUARIOS"),
  async (req, res) => {
    try {
      const resultado = await db.query(
        `
        SELECT u.id, u.email, u.nome_completo, u.status, u.setor_id, u.foto_url, s.nome as setor
        FROM usuarios u
        LEFT JOIN setores s ON s.id = u.setor_id
        WHERE u.empresa_id = $1
        ORDER BY u.id
        `,
        [req.user.empresa_id]
      );

      return res.status(200).json({ usuarios: resultado.rows });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: "Erro no servidor." });
    }
  }
);

/* ==========================
   ADMIN - LISTAR PERMISSÕES DISPONÍVEIS
========================== */
router.get(
  "/admin/permissoes-disponiveis",
  authMiddleware,
  permissionMiddleware("GESTOR_USUARIOS"),
  async (req, res) => {
    try {
      const result = await db.query(
        `
        SELECT 
          id,
          COALESCE(codigo, nome) AS codigo,
          nome_exibicao,
          descricao,
          modulo,
          ordem
        FROM permissoes
        WHERE ativo = true OR ativo IS NULL
        ORDER BY modulo NULLS FIRST, ordem ASC, id ASC
        `
      );

      return res.status(200).json({ permissoes: result.rows });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Erro ao buscar permissões." });
    }
  }
);

/* ==========================
   ADMIN - BUSCAR PERMISSÕES DE UM USUÁRIO
========================== */
router.get(
  "/admin/permissoes/:id",
  authMiddleware,
  permissionMiddleware("GESTOR_USUARIOS"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const usuarioValido = await db.query(
        `
        SELECT id
        FROM usuarios
        WHERE id = $1 AND empresa_id = $2
        `,
        [id, req.user.empresa_id]
      );

      if (usuarioValido.rows.length === 0) {
        return res.status(404).json({ message: "Usuário não encontrado." });
      }

      const resultado = await db.query(
        `
        SELECT COALESCE(p.codigo, p.nome) AS codigo
        FROM usuario_permissoes up
        JOIN permissoes p ON p.id = up.permissao_id
        WHERE up.usuario_id = $1
        `,
        [id]
      );

      const permissoes = resultado.rows.map((p) => p.codigo);

      return res.status(200).json({ permissoes });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: "Erro no servidor." });
    }
  }
);

/* ==========================
   ADMIN - APROVAR
========================== */
router.put(
  "/admin/aprovar/:id",
  authMiddleware,
  permissionMiddleware("GESTOR_USUARIOS"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const resultado = await db.query(
        `
        UPDATE usuarios
        SET status = 'aprovado'
        WHERE id = $1 AND empresa_id = $2
        RETURNING id
        `,
        [id, req.user.empresa_id]
      );

      if (resultado.rows.length === 0) {
        return res.status(404).json({ message: "Usuário não encontrado." });
      }

      return res.status(200).json({ message: "Usuário aprovado com sucesso!" });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: "Erro no servidor." });
    }
  }
);

/* ==========================
   ADMIN - EDITAR SETOR
========================== */
router.put(
  "/admin/usuarios/:id/setor",
  authMiddleware,
  permissionMiddleware("GESTOR_USUARIOS"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { setor_id } = req.body;

      if (!setor_id) {
        return res.status(400).json({ message: "Setor inválido." });
      }

      const usuarioValido = await db.query(
        `
        SELECT id
        FROM usuarios
        WHERE id = $1 AND empresa_id = $2
        `,
        [id, req.user.empresa_id]
      );

      if (usuarioValido.rows.length === 0) {
        return res.status(404).json({ message: "Usuário não encontrado." });
      }

      const setorValido = await db.query(
        `
        SELECT id
        FROM setores
        WHERE id = $1 AND empresa_id = $2
        `,
        [setor_id, req.user.empresa_id]
      );

      if (setorValido.rows.length === 0) {
        return res.status(400).json({ message: "Setor inválido para esta empresa." });
      }

      await db.query(
        `
        UPDATE usuarios
        SET setor_id = $1
        WHERE id = $2 AND empresa_id = $3
        `,
        [setor_id, id, req.user.empresa_id]
      );

      return res.status(200).json({ message: "Setor atualizado com sucesso!" });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: "Erro no servidor." });
    }
  }
);

/* ==========================
   ADMIN - EDITAR USUÁRIO COMPLETO
========================== */
router.put(
  "/admin/usuarios/:id/editar",
  authMiddleware,
  permissionMiddleware("GESTOR_USUARIOS"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { setor_id, permissoes } = req.body;

      if (!setor_id) {
        return res.status(400).json({ message: "Setor inválido." });
      }

      if (!Array.isArray(permissoes)) {
        return res.status(400).json({ message: "Permissões inválidas." });
      }

      const usuarioValido = await db.query(
        `
        SELECT id
        FROM usuarios
        WHERE id = $1 AND empresa_id = $2
        `,
        [id, req.user.empresa_id]
      );

      if (usuarioValido.rows.length === 0) {
        return res.status(404).json({ message: "Usuário não encontrado." });
      }

      const setorValido = await db.query(
        `
        SELECT id
        FROM setores
        WHERE id = $1 AND empresa_id = $2
        `,
        [setor_id, req.user.empresa_id]
      );

      if (setorValido.rows.length === 0) {
        return res.status(400).json({ message: "Setor inválido para esta empresa." });
      }

      await db.query("BEGIN");

      await db.query(
        `
        UPDATE usuarios
        SET setor_id = $1
        WHERE id = $2 AND empresa_id = $3
        `,
        [setor_id, id, req.user.empresa_id]
      );

      await db.query("DELETE FROM usuario_permissoes WHERE usuario_id = $1", [id]);

      for (const perm of permissoes) {
        const permResult = await db.query(
          `
          SELECT id
          FROM permissoes
          WHERE codigo = $1 OR nome = $1
          LIMIT 1
          `,
          [perm]
        );

        if (permResult.rows.length > 0) {
          const permId = permResult.rows[0].id;

          await db.query(
            `
            INSERT INTO usuario_permissoes (usuario_id, permissao_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
            `,
            [id, permId]
          );
        }
      }

      await db.query("COMMIT");

      return res.status(200).json({ message: "Usuário atualizado com sucesso!" });
    } catch (error) {
      await db.query("ROLLBACK");
      console.log(error);
      return res.status(500).json({ message: "Erro no servidor." });
    }
  }
);

/* ==========================
   ADMIN - RESETAR SENHA PARA CPF
========================== */
router.put(
  "/admin/resetar-senha/:id",
  authMiddleware,
  permissionMiddleware("GESTOR_USUARIOS"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const usuarioResult = await db.query(
        `
        SELECT id, cpf
        FROM usuarios
        WHERE id = $1 AND empresa_id = $2
        `,
        [id, req.user.empresa_id]
      );

      if (usuarioResult.rows.length === 0) {
        return res.status(404).json({ message: "Usuário não encontrado." });
      }

      const usuario = usuarioResult.rows[0];
      const cpfLimpo = limparCPF(usuario.cpf);

      if (!cpfLimpo || cpfLimpo.length !== 11) {
        return res.status(400).json({
          message: "Não foi possível resetar. CPF do usuário inválido.",
        });
      }

      const senhaCriptografada = await bcrypt.hash(cpfLimpo, 10);

      await db.query(
        `UPDATE usuarios SET senha = $1, solicitar_reset = false WHERE id = $2 AND empresa_id = $3`,
        [senhaCriptografada, id, req.user.empresa_id]
      );

      // Invalida quaisquer tokens de reset pendentes do usuário
      await db.query(`DELETE FROM password_reset_tokens WHERE usuario_id = $1`, [id]);

      return res.status(200).json({
        message: "Senha resetada com sucesso. O usuário poderá entrar com o CPF como senha.",
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: "Erro no servidor." });
    }
  }
);

/* ==========================
   ADMIN - BLOQUEAR
========================== */
router.put(
  "/admin/bloquear/:id",
  authMiddleware,
  permissionMiddleware("GESTOR_USUARIOS"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const resultado = await db.query(
        `
        UPDATE usuarios
        SET status = 'bloqueado'
        WHERE id = $1 AND empresa_id = $2
        RETURNING id
        `,
        [id, req.user.empresa_id]
      );

      if (resultado.rows.length === 0) {
        return res.status(404).json({ message: "Usuário não encontrado." });
      }

      return res.status(200).json({ message: "Usuário bloqueado com sucesso!" });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: "Erro no servidor." });
    }
  }
);

/* ==========================
   ADMIN - DESBLOQUEAR
========================== */
router.put(
  "/admin/desbloquear/:id",
  authMiddleware,
  permissionMiddleware("GESTOR_USUARIOS"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const resultado = await db.query(
        `
        UPDATE usuarios
        SET status = 'aprovado'
        WHERE id = $1 AND empresa_id = $2
        RETURNING id
        `,
        [id, req.user.empresa_id]
      );

      if (resultado.rows.length === 0) {
        return res.status(404).json({ message: "Usuário não encontrado." });
      }

      return res.status(200).json({ message: "Usuário desbloqueado com sucesso!" });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: "Erro no servidor." });
    }
  }
);

/* ==========================
   ADMIN - EXCLUIR
========================== */
router.delete(
  "/admin/excluir/:id",
  authMiddleware,
  permissionMiddleware("GESTOR_USUARIOS"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const resultado = await db.query(
        `
        DELETE FROM usuarios
        WHERE id = $1 AND empresa_id = $2
        RETURNING id
        `,
        [id, req.user.empresa_id]
      );

      if (resultado.rows.length === 0) {
        return res.status(404).json({ message: "Usuário não encontrado." });
      }

      return res.status(200).json({ message: "Usuário excluído com sucesso!" });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: "Erro no servidor." });
    }
  }
);


/* ==========================
   USER - UPLOAD DE FOTO
========================== */
router.put("/user/foto-upload", authMiddleware, upload.single("foto"), validarMagicBytes, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Nenhum arquivo enviado." });
    }

    // Remover foto antiga do Cloudinary, se existir
    const atual = await db.query("SELECT foto_url FROM usuarios WHERE id = $1", [req.user.id]);
    const fotoAtual = atual.rows[0]?.foto_url;
    if (fotoAtual) {
      try {
        const publicId = fotoAtual.split("/").slice(-2).join("/").replace(/\.[^.]+$/, "");
        await cloudinary.uploader.destroy(publicId);
      } catch { /* silencioso */ }
    }

    const resultado = await uploadToCloudinary(req.file.buffer, "usuarios/fotos");
    const novaUrl = resultado.secure_url;

    await db.query("UPDATE usuarios SET foto_url = $1 WHERE id = $2", [novaUrl, req.user.id]);

    res.json({ success: true, foto_url: novaUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erro ao salvar foto." });
  }
});

/* ==========================
   USER - ATUALIZAR FOTO (URL direta)
========================== */
router.put("/user/foto", authMiddleware, async (req, res) => {
  const { foto_url } = req.body;

  // Aceita apenas URLs do Cloudinary ou null (remover foto)
  const CLOUDINARY_HOST = "res.cloudinary.com";
  if (foto_url !== null && foto_url !== undefined && foto_url !== "") {
    try {
      const parsed = new URL(foto_url);
      if (parsed.protocol !== "https:" || parsed.hostname !== CLOUDINARY_HOST) {
        return res.status(400).json({ message: "URL de foto inválida." });
      }
    } catch {
      return res.status(400).json({ message: "URL de foto inválida." });
    }
  }

  try {
    await db.query(
      "UPDATE usuarios SET foto_url = $1 WHERE id = $2",
      [foto_url || null, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Erro ao salvar foto." });
  }
});

/* ==========================
   USER - DELETAR FOTO
========================== */
router.delete("/user/foto", authMiddleware, async (req, res) => {
  try {
    const userResult = await db.query(
      "SELECT foto_url FROM usuarios WHERE id = $1",
      [req.user.id]
    );

    const foto = userResult.rows[0]?.foto_url;

    if (foto) {
      const publicId = foto.split("/").pop().split(".")[0];
      await cloudinary.uploader.destroy(publicId);
    }

    await db.query(
      "UPDATE usuarios SET foto_url = NULL WHERE id = $1",
      [req.user.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erro ao deletar foto" });
  }
});

/* ==========================
   REFRESH TOKEN
========================== */
router.post("/refresh", async (req, res) => {
  try {
    const raw = parseCookie(req, "refreshToken") || req.body?.refreshToken;
    if (!raw) return res.status(401).json({ message: "Refresh token não fornecido." });

    const hash = crypto.createHash("sha256").update(raw).digest("hex");

    const result = await db.query(
      `SELECT rt.usuario_id, rt.expires_at, rt.token_hash,
              u.email, u.nome_completo, u.foto_url, u.status, u.empresa_id, u.setor_id
       FROM refresh_tokens rt
       JOIN usuarios u ON u.id = rt.usuario_id
       WHERE rt.token_hash = $1
       LIMIT 1`,
      [hash]
    );

    if (!result.rows.length) {
      return res.status(401).json({ message: "Refresh token inválido." });
    }

    const rt = result.rows[0];

    if (new Date(rt.expires_at) < new Date()) {
      await db.query(`DELETE FROM refresh_tokens WHERE token_hash = $1`, [hash]).catch(() => {});
      return res.status(401).json({ message: "Refresh token expirado. Faça login novamente." });
    }

    if (rt.status !== "aprovado") {
      return res.status(403).json({ message: "Usuário sem acesso." });
    }

    const permRes = await db.query(
      `SELECT COALESCE(p.codigo, p.nome) AS codigo
       FROM usuario_permissoes up
       JOIN permissoes p ON p.id = up.permissao_id
       WHERE up.usuario_id = $1`,
      [rt.usuario_id]
    );
    const permissoes = permRes.rows.map((p) => p.codigo);

    /* Rotacionar: troca o hash no lugar (invalida o token anterior) */
    const newRaw  = crypto.randomBytes(32).toString("hex");
    const newHash = crypto.createHash("sha256").update(newRaw).digest("hex");
    await db.query(
      `UPDATE refresh_tokens
       SET token_hash = $1, expires_at = NOW() + INTERVAL '7 days'
       WHERE token_hash = $2`,
      [newHash, hash]
    );

    const token = jwt.sign(
      {
        id:            rt.usuario_id,
        email:         rt.email,
        nome_completo: rt.nome_completo,
        foto_url:      rt.foto_url || null,
        status:        rt.status,
        empresa_id:    rt.empresa_id,
        setor_id:      rt.setor_id,
        permissoes,
        type:          "access",
      },
      process.env.JWT_SECRET,
      { expiresIn: ACCESS_EXPIRY }
    );

    res.cookie("refreshToken", newRaw, refreshCookieOpts());
    return res.json({ token, refreshToken: newRaw });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao renovar sessão." });
  }
});

/* ==========================
   LOGOUT
========================== */
router.post("/logout", async (req, res) => {
  try {
    const raw = parseCookie(req, "refreshToken") || req.body?.refreshToken;
    if (raw) {
      const hash = crypto.createHash("sha256").update(raw).digest("hex");
      await db.query(`DELETE FROM refresh_tokens WHERE token_hash = $1`, [hash]).catch(() => {});
    }
    res.clearCookie("refreshToken", { path: "/api/auth" });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao encerrar sessão." });
  }
});

module.exports = router;