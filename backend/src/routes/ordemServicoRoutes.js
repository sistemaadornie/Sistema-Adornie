const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const svc = require('../services/ordemServicoService');

const router = express.Router();

router.post('/', authMiddleware, async (req, res) => {
  const { pedido_item_id, responsavel_id } = req.body;
  if (!pedido_item_id) return res.status(400).json({ message: 'pedido_item_id obrigatório' });
  try {
    const os = await svc.criar({ pedidoItemId: pedido_item_id, responsavelId: responsavel_id });
    res.status(201).json(os);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

router.patch('/:id/status', authMiddleware, async (req, res) => {
  const STATUS_VALIDOS = ['aberta', 'em_andamento', 'aguardando_aprovacao', 'encerrada'];
  const { status } = req.body;
  if (!STATUS_VALIDOS.includes(status)) {
    return res.status(400).json({ message: `status deve ser um de: ${STATUS_VALIDOS.join(', ')}` });
  }
  try {
    const os = await svc.atualizarStatus(Number(req.params.id), status);
    res.json(os);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

router.get('/pedidos/:pedidoId/os', authMiddleware, async (req, res) => {
  try {
    const rows = await svc.listarPorPedido(Number(req.params.pedidoId));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
