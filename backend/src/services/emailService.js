const nodemailer = require("nodemailer");
const crypto     = require("crypto");

function criarTransporter() {
  const dkimOpts = process.env.DKIM_PRIVATE_KEY
    ? {
        dkim: {
          domainName:  process.env.DKIM_DOMAIN    || process.env.SMTP_HOST,
          keySelector: process.env.DKIM_SELECTOR  || "mail",
          privateKey:  process.env.DKIM_PRIVATE_KEY.replace(/\\n/g, "\n"),
        },
      }
    : {};

  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    ...dkimOpts,
  });
}

const FROM        = process.env.SMTP_FROM || "Operon <noreply@operon.com.br>";
const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");

/**
 * @param {string}      destinatario
 * @param {string}      nomeUsuario
 * @param {string}      token        token raw (64 hex chars)
 * @param {string|null} ipSolicitacao IP que fez a solicitação (exibido no e-mail como contexto de segurança)
 */
async function enviarResetSenha(destinatario, nomeUsuario, token, ipSolicitacao = null) {
  // Token vai no fragment (#) — nunca chega ao servidor nem aparece em logs HTTP
  const link = `${FRONTEND_URL}/resetar-senha#token=${token}`;

  const dominio   = (process.env.SMTP_FROM || "noreply@operon.com.br").match(/<(.+)>/)?.[1]?.split("@")[1]
                  ?? "operon.com.br";
  const messageId = `<${crypto.randomBytes(16).toString("hex")}@${dominio}>`;

  const transporter = criarTransporter();

  await transporter.sendMail({
    from:      FROM,
    to:        destinatario,
    subject:   "Recuperação de senha — Operon",
    messageId,
    headers: {
      "X-Mailer":   "Operon Mailer",
      "X-Priority": "1",
      "Precedence": "transactional",
    },
    html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#060810;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#060810;padding:48px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:540px;background:#0f1117;border-radius:14px;border:1px solid #1e2433;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="padding:28px 36px;background:linear-gradient(135deg,#1a0d2e,#0f1117);border-bottom:1px solid #1e2433;">
              <span style="font-size:24px;font-weight:900;color:#fff;letter-spacing:-1px;">
                OPER<span style="color:#8b5cf6;">ON</span>
              </span>
            </td>
          </tr>

          <!-- Destaque topo -->
          <tr>
            <td style="padding:32px 36px 0;">
              <div style="display:inline-block;background:rgba(139,92,246,0.12);border:1px solid rgba(139,92,246,0.3);border-radius:8px;padding:6px 14px;margin-bottom:20px;">
                <span style="font-size:12px;font-weight:700;color:#a78bfa;letter-spacing:0.5px;text-transform:uppercase;">🔐 Recuperação de acesso</span>
              </div>
              <h1 style="margin:0 0 10px;font-size:22px;font-weight:800;color:#f1f5f9;line-height:1.3;">
                Olá${nomeUsuario ? `, ${nomeUsuario.split(" ")[0]}` : ""}!
              </h1>
              <p style="margin:0 0 24px;font-size:15px;color:#94a3b8;line-height:1.7;">
                Recebemos uma solicitação para redefinir a senha da sua conta no Operon.
                Clique no botão abaixo para criar uma nova senha.
              </p>
            </td>
          </tr>

          <!-- CTA principal -->
          <tr>
            <td style="padding:0 36px 28px;">
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="border-radius:10px;background:linear-gradient(135deg,#7c3aed,#5b21b6);text-align:center;">
                    <a href="${link}" target="_blank"
                       style="display:block;padding:16px 32px;font-size:16px;font-weight:800;color:#fff;text-decoration:none;letter-spacing:0.3px;">
                      Criar nova senha →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Info validade -->
          <tr>
            <td style="padding:0 36px 28px;">
              <p style="margin:0;font-size:13px;color:#64748b;text-align:center;">
                ⏱ Este link expira em <strong style="color:#94a3b8;">1 hora</strong> e só pode ser usado uma vez.
              </p>
            </td>
          </tr>

          <!-- Fallback URL -->
          <tr>
            <td style="padding:0 36px 28px;">
              <div style="background:#080b14;border:1px solid #1e2433;border-radius:8px;padding:14px 16px;">
                <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;">
                  Botão não funciona? Copie o link:
                </p>
                <p style="margin:0;word-break:break-all;">
                  <a href="${link}" style="font-size:12px;color:#8b5cf6;text-decoration:none;">${link}</a>
                </p>
              </div>
            </td>
          </tr>

          ${ipSolicitacao ? `
          <!-- Contexto de segurança -->
          <tr>
            <td style="padding:0 36px 28px;">
              <div style="background:#0a0d16;border:1px solid #1e2433;border-radius:8px;padding:14px 16px;">
                <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;">Informações da solicitação</p>
                <table cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td style="font-size:12px;color:#64748b;padding:2px 0;">Endereço IP</td>
                    <td style="font-size:12px;color:#94a3b8;text-align:right;font-family:monospace;">${ipSolicitacao}</td>
                  </tr>
                  <tr>
                    <td style="font-size:12px;color:#64748b;padding:2px 0;">Horário</td>
                    <td style="font-size:12px;color:#94a3b8;text-align:right;">${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>
          ` : ""}

          <!-- Aviso de segurança -->
          <tr>
            <td style="padding:0 36px 32px;">
              <div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:8px;padding:14px 16px;">
                <p style="margin:0;font-size:12px;color:#78716c;line-height:1.7;">
                  ⚠️ <strong style="color:#92400e;">Não solicitou isso?</strong>
                  Ignore este e-mail — sua senha não foi alterada e sua conta continua segura.
                  Se suspeitar de acesso não autorizado, entre em contato com o administrador da sua empresa.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 36px;border-top:1px solid #1e2433;text-align:center;">
              <p style="margin:0;font-size:12px;color:#334155;">
                © ${new Date().getFullYear()} Operon &nbsp;·&nbsp; E-mail automático, não responda.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim(),
  });
}

module.exports = { enviarResetSenha };
