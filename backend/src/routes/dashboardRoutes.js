"use strict";
const express = require("express");
const router  = express.Router();
const auth    = require("../middlewares/authMiddleware");
const bloquearAppPWA = require("../middlewares/bloquearAppPWA");
const svc     = require("../services/dashboardService");

router.use(bloquearAppPWA);

router.get("/pedidos", auth, async (req, res) => {
  try {
    const filtros = {
      consultora_id: req.query.consultora_id || null,
      status:        req.query.status        || null,
      alerta:        req.query.alerta        || null,
      busca:         req.query.busca         || null,
    };
    const result = await svc.listarPedidosDashboard(
      req.user.empresa_id, req.user.id, req.user.permissoes, filtros
    );
    return res.json({ pedidos: result });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao listar dashboard" });
  }
});

module.exports = router;
