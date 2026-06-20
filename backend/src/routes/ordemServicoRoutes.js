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
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'id inválido' });
  try {
    const os = await svc.atualizarStatus(id, status);
    res.json(os);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

router.put('/:id/confeccao', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'id inválido' });
    const os = await svc.salvarDadosConfeccao(id, req.user.id, req.body);
    res.json(os);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

router.get('/pedidos/:pedidoId/os', authMiddleware, async (req, res) => {
  try {
    const pedidoId = Number(req.params.pedidoId);
    if (!Number.isFinite(pedidoId)) return res.status(400).json({ message: 'pedidoId inválido' });
    const rows = await svc.listarPorPedido(pedidoId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'id inválido' });
    const os = await svc.buscar(id);
    if (!os) return res.status(404).json({ message: 'Ordem de serviço não encontrada.' });
    res.json(os);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'id inválido' });
    const os = await svc.salvarDadosTecnicos(id, req.user.id, req.body);
    res.json(os);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

module.exports = router;
