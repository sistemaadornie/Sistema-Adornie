const webpush = require("web-push");
const db = require("../database/db");

async function enviarPush(usuarioId, payload) {
  if (!process.env.VAPID_PRIVATE_KEY) return;

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const { rows } = await db.query(
    "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE usuario_id = $1",
    [usuarioId]
  );
  if (!rows.length) return;

  const body = JSON.stringify(payload);
  await Promise.allSettled(
    rows.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        );
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await db.query("DELETE FROM push_subscriptions WHERE id = $1", [sub.id]);
        } else {
          console.warn("Erro ao enviar push:", err.message);
        }
      }
    })
  );
}

module.exports = { enviarPush };
