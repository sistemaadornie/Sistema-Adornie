const express = require("express");
const db = require("../database/db");
const authMiddleware = require("../middlewares/authMiddleware");

const router = express.Router();

router.get("/vapid-public-key", (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
});

router.post("/subscribe", authMiddleware, async (req, res) => {
  try {
    const { empresa_id, id: userId } = req.user;
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ message: "Subscription inválida." });
    }
    await db.query(
      `INSERT INTO push_subscriptions (usuario_id, empresa_id, endpoint, p256dh, auth, ultimo_uso)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (endpoint) DO UPDATE
         SET usuario_id = EXCLUDED.usuario_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, ultimo_uso = NOW()`,
      [userId, empresa_id, endpoint, keys.p256dh, keys.auth]
    );
    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao salvar subscription." });
  }
});

router.delete("/subscribe", authMiddleware, async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ message: "endpoint obrigatório." });
    await db.query(
      `DELETE FROM push_subscriptions WHERE endpoint = $1 AND usuario_id = $2`,
      [endpoint, userId]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao remover subscription." });
  }
});

module.exports = router;
