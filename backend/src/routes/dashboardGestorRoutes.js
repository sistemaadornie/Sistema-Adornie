"use strict";
const express = require("express");
const router  = express.Router();
const authMiddleware       = require("../middlewares/authMiddleware");
const permissionMiddleware = require("../middlewares/permissionMiddleware");
const svc = require("../services/dashboardGestorService");

const PERM_DASHBOARD_GESTOR = ["ADMIN_MASTER", "OPERADOR_AGENDA"];

router.use(authMiddleware, permissionMiddleware(PERM_DASHBOARD_GESTOR));

function filtrosDe(req) {
  return {
    periodo: req.query.periodo || "mes",
    consultoraId: req.query.consultora_id || null,
    cidade: req.query.cidade || null,
  };
}

router.get("/filtros", async (req, res) => {
  try {
    res.json(await svc.buscarFiltros(req.user.empresa_id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erro ao buscar filtros." });
  }
});

router.get("/kpis", async (req, res) => {
  try {
    res.json(await svc.buscarKpis(req.user.empresa_id, filtrosDe(req)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erro ao buscar KPIs." });
  }
});

router.get("/funil", async (req, res) => {
  try {
    res.json(await svc.buscarFunil(req.user.empresa_id, filtrosDe(req)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erro ao buscar funil." });
  }
});

router.get("/funil/:numero", async (req, res) => {
  try {
    res.json(await svc.buscarFunilDetalhe(req.user.empresa_id, req.params.numero, filtrosDe(req)));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error(err);
    res.status(500).json({ message: "Erro ao buscar detalhe da etapa." });
  }
});

router.get("/alertas", async (req, res) => {
  try {
    res.json(await svc.buscarAlertas(req.user.empresa_id, filtrosDe(req)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erro ao buscar alertas." });
  }
});

router.get("/mapa", async (req, res) => {
  try {
    res.json(await svc.buscarMapa(req.user.empresa_id, { ...filtrosDe(req), modo: req.query.modo || "bairros" }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erro ao buscar mapa." });
  }
});

router.get("/agenda-semana", async (req, res) => {
  try {
    res.json(await svc.buscarAgendaSemana(req.user.empresa_id, filtrosDe(req)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erro ao buscar agenda da semana." });
  }
});

router.get("/consultoras", async (req, res) => {
  try {
    res.json(await svc.buscarConsultoras(req.user.empresa_id, filtrosDe(req)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erro ao buscar faturamento por consultora." });
  }
});

module.exports = router;
