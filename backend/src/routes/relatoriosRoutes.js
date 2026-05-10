const express = require("express");
const db      = require("../database/db");
const authMiddleware       = require("../middlewares/authMiddleware");
const permissionMiddleware = require("../middlewares/permissionMiddleware");

const PERM_RELATORIO = ["ADMIN_MASTER", "OPERADOR_AGENDA"];

const router = express.Router();

function periodoWhere(periodo, col = "a.data") {
  switch (periodo) {
    case "7d":  return `${col} >= CURRENT_DATE - INTERVAL '7 days'`;
    case "30d": return `${col} >= CURRENT_DATE - INTERVAL '30 days'`;
    case "90d": return `${col} >= CURRENT_DATE - INTERVAL '90 days'`;
    case "6m":  return `${col} >= CURRENT_DATE - INTERVAL '6 months'`;
    case "1a":  return `${col} >= CURRENT_DATE - INTERVAL '1 year'`;
    default:    return `${col} >= CURRENT_DATE - INTERVAL '30 days'`;
  }
}

/* ══════════════════════════════════════════════════════
   GET /api/relatorios/agendamentos?periodo=30d
══════════════════════════════════════════════════════ */
router.get("/agendamentos", authMiddleware, permissionMiddleware(PERM_RELATORIO), async (req, res) => {
  try {
    const { empresa_id } = req.user;
    const { periodo = "30d" } = req.query;
    const pw = periodoWhere(periodo);

    const [porStatus, porMes, porTipo, porDia, total] = await Promise.all([
      /* por status */
      db.query(`
        SELECT status, COUNT(*)::int AS total
        FROM agendamentos a
        WHERE a.empresa_id=$1 AND ${pw}
        GROUP BY status ORDER BY total DESC
      `, [empresa_id]),

      /* por mês — últimos 12 meses */
      db.query(`
        SELECT TO_CHAR(a.data,'YYYY-MM') AS mes,
               COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status='concluido')::int AS concluidos
        FROM agendamentos a
        WHERE a.empresa_id=$1 AND a.data >= CURRENT_DATE - INTERVAL '12 months'
        GROUP BY mes ORDER BY mes
      `, [empresa_id]),

      /* por tipo */
      db.query(`
        SELECT tipo, COUNT(*)::int AS total
        FROM agendamentos a
        WHERE a.empresa_id=$1 AND ${pw}
        GROUP BY tipo ORDER BY total DESC
      `, [empresa_id]),

      /* por dia da semana */
      db.query(`
        SELECT EXTRACT(DOW FROM a.data)::int AS dow, COUNT(*)::int AS total
        FROM agendamentos a
        WHERE a.empresa_id=$1 AND ${pw}
        GROUP BY dow ORDER BY dow
      `, [empresa_id]),

      /* total + kpis */
      db.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status='concluido')::int AS concluidos,
          COUNT(*) FILTER (WHERE status='nao_concluido')::int AS nao_concluidos,
          COUNT(*) FILTER (WHERE status='cancelado')::int AS cancelados,
          COUNT(*) FILTER (WHERE status='andamento')::int AS em_andamento,
          COUNT(*) FILTER (WHERE status='agendado')::int AS agendados,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE status='concluido')
            / NULLIF(COUNT(*) FILTER (WHERE status IN ('concluido','nao_concluido','cancelado')), 0)
          , 1) AS taxa_conclusao
        FROM agendamentos a
        WHERE a.empresa_id=$1 AND ${pw}
      `, [empresa_id]),
    ]);

    return res.json({
      kpis:       total.rows[0],
      porStatus:  porStatus.rows,
      porMes:     porMes.rows,
      porTipo:    porTipo.rows,
      porDia:     porDia.rows,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao gerar relatório." });
  }
});

/* ══════════════════════════════════════════════════════
   GET /api/relatorios/equipe?periodo=30d
══════════════════════════════════════════════════════ */
router.get("/equipe", authMiddleware, permissionMiddleware(PERM_RELATORIO), async (req, res) => {
  try {
    const { empresa_id } = req.user;
    const { periodo = "30d" } = req.query;
    const pw = periodoWhere(periodo);

    const [porInstalador, kpis] = await Promise.all([
      db.query(`
        SELECT
          u.id,
          u.nome_completo AS nome,
          COUNT(DISTINCT ae.agendamento_id)::int AS total,
          COUNT(DISTINCT ae.agendamento_id) FILTER (WHERE a.status='concluido')::int AS concluidos,
          COUNT(DISTINCT ae.agendamento_id) FILTER (WHERE a.status='nao_concluido')::int AS nao_concluidos,
          COUNT(DISTINCT ae.agendamento_id) FILTER (WHERE a.status='cancelado')::int AS cancelados,
          ROUND(
            100.0 * COUNT(DISTINCT ae.agendamento_id) FILTER (WHERE a.status='concluido')
            / NULLIF(COUNT(DISTINCT ae.agendamento_id) FILTER (WHERE a.status IN ('concluido','nao_concluido','cancelado')), 0)
          , 1) AS taxa_conclusao
        FROM agendamento_equipe ae
        JOIN agendamentos a ON a.id = ae.agendamento_id
        JOIN usuarios u ON u.id = ae.usuario_id
        WHERE a.empresa_id=$1 AND ${pw}
        GROUP BY u.id, u.nome_completo
        ORDER BY total DESC
      `, [empresa_id]),

      db.query(`
        SELECT
          COUNT(DISTINCT usuario_id)::int AS total_instaladores,
          COUNT(DISTINCT agendamento_id)::int AS total_servicos,
          ROUND(AVG(cnt)::numeric, 1) AS media_por_instalador
        FROM (
          SELECT ae.usuario_id, COUNT(*) AS cnt
          FROM agendamento_equipe ae
          JOIN agendamentos a ON a.id = ae.agendamento_id
          WHERE a.empresa_id=$1 AND ${pw}
          GROUP BY ae.usuario_id
        ) sub
      `, [empresa_id]),
    ]);

    return res.json({
      kpis:           kpis.rows[0] || {},
      porInstalador:  porInstalador.rows,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao gerar relatório." });
  }
});

/* ══════════════════════════════════════════════════════
   GET /api/relatorios/clientes?periodo=30d
══════════════════════════════════════════════════════ */
router.get("/clientes", authMiddleware, permissionMiddleware(PERM_RELATORIO), async (req, res) => {
  try {
    const { empresa_id } = req.user;
    const { periodo = "30d" } = req.query;
    const pwA = periodoWhere(periodo, "a.data");
    const pwC = periodoWhere(periodo, "c.created_at");

    const [kpis, topClientes, porCategoria, semAgendamento] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*) FILTER (WHERE c.deleted_at IS NULL)::int AS ativos,
          COUNT(*) FILTER (WHERE c.deleted_at IS NULL AND ${pwC})::int AS novos_periodo,
          (SELECT COUNT(*)::int FROM cliente_enderecos ce JOIN clientes cx ON cx.id=ce.cliente_id WHERE cx.empresa_id=$1 AND ce.deleted_at IS NULL) AS total_enderecos
        FROM clientes c WHERE c.empresa_id=$1
      `, [empresa_id]),

      db.query(`
        SELECT c.nome, COUNT(a.id)::int AS agendamentos
        FROM clientes c
        LEFT JOIN agendamentos a ON LOWER(a.cliente) = LOWER(c.nome) AND a.empresa_id=$1 AND ${pwA}
        WHERE c.empresa_id=$1 AND c.deleted_at IS NULL
        GROUP BY c.id, c.nome
        ORDER BY agendamentos DESC
        LIMIT 10
      `, [empresa_id]),

      db.query(`
        SELECT ce.categoria, COUNT(*)::int AS total
        FROM cliente_enderecos ce
        JOIN clientes c ON c.id=ce.cliente_id
        WHERE c.empresa_id=$1 AND ce.deleted_at IS NULL
        GROUP BY ce.categoria ORDER BY total DESC
      `, [empresa_id]),

      db.query(`
        SELECT COUNT(*)::int AS sem_agendamento
        FROM clientes c
        WHERE c.empresa_id=$1 AND c.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM agendamentos a
          WHERE LOWER(a.cliente)=LOWER(c.nome) AND a.empresa_id=$1 AND ${pwA}
        )
      `, [empresa_id]),
    ]);

    return res.json({
      kpis:         { ...kpis.rows[0], sem_agendamento: semAgendamento.rows[0]?.sem_agendamento },
      topClientes:  topClientes.rows,
      porCategoria: porCategoria.rows,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao gerar relatório." });
  }
});

/* ══════════════════════════════════════════════════════
   GET /api/relatorios/veiculos?periodo=30d
══════════════════════════════════════════════════════ */
router.get("/veiculos", authMiddleware, permissionMiddleware(PERM_RELATORIO), async (req, res) => {
  try {
    const { empresa_id } = req.user;
    const { periodo = "30d" } = req.query;
    const pw = periodoWhere(periodo, "ab.data");

    const [kpis, porVeiculo, recentes] = await Promise.all([
      db.query(`
        SELECT
          (SELECT COUNT(*)::int FROM veiculos WHERE empresa_id=$1 AND deleted_at IS NULL) AS total_veiculos,
          COALESCE(SUM(ab.litros),0)::numeric AS total_litros,
          COALESCE(SUM(ab.valor_total),0)::numeric AS total_gasto,
          COUNT(ab.id)::int AS total_abastecimentos,
          ROUND(COALESCE(AVG(ab.valor_total / NULLIF(ab.litros,0)),0)::numeric, 2) AS preco_medio_litro
        FROM abastecimentos ab
        JOIN veiculos v ON v.id=ab.veiculo_id
        WHERE ab.empresa_id=$1 AND ${pw}
      `, [empresa_id]),

      db.query(`
        SELECT
          v.nome, v.placa, v.combustivel, v.tipo,
          COUNT(ab.id)::int AS abastecimentos,
          COALESCE(SUM(ab.litros),0)::numeric AS litros,
          COALESCE(SUM(ab.valor_total),0)::numeric AS gasto,
          ROUND(COALESCE(AVG(ab.valor_total / NULLIF(ab.litros,0)),0)::numeric, 2) AS preco_medio
        FROM veiculos v
        LEFT JOIN abastecimentos ab ON ab.veiculo_id=v.id AND ab.empresa_id=$1 AND ${pw}
        WHERE v.empresa_id=$1 AND v.deleted_at IS NULL
        GROUP BY v.id, v.nome, v.placa, v.combustivel, v.tipo
        ORDER BY gasto DESC
      `, [empresa_id]),

      db.query(`
        SELECT ab.data, ab.litros, ab.valor_total, ab.combustivel, ab.posto_nome,
               v.nome AS veiculo, v.placa,
               u.nome_completo AS registrado_por
        FROM abastecimentos ab
        JOIN veiculos v ON v.id=ab.veiculo_id
        LEFT JOIN usuarios u ON u.id=ab.registrado_por
        WHERE ab.empresa_id=$1 AND ${pw}
        ORDER BY ab.data DESC, ab.created_at DESC
        LIMIT 20
      `, [empresa_id]),
    ]);

    return res.json({
      kpis:       kpis.rows[0],
      porVeiculo: porVeiculo.rows,
      recentes:   recentes.rows,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao gerar relatório." });
  }
});

module.exports = router;
