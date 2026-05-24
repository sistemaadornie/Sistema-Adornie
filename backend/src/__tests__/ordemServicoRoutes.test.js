jest.mock('../services/ordemServicoService');
jest.mock('../middlewares/authMiddleware', () => (req, _res, next) => {
  req.user = { id: 1, empresa_id: 1 };
  next();
});

const request  = require('supertest');
const express  = require('express');
const router   = require('../routes/ordemServicoRoutes');
const svc      = require('../services/ordemServicoService');

const app = express();
app.use(express.json());
app.use('/api/os', router);
app.use('/api', router);

describe('POST /api/os', () => {
  test('201 ao criar OS com dados válidos', async () => {
    svc.criar.mockResolvedValueOnce({ id: 1, status: 'aberta' });
    const res = await request(app).post('/api/os').send({ pedido_item_id: 5, responsavel_id: 2 });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('aberta');
  });

  test('400 sem pedido_item_id', async () => {
    const res = await request(app).post('/api/os').send({});
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/os/:id/status', () => {
  test('200 ao atualizar para status válido', async () => {
    svc.atualizarStatus.mockResolvedValueOnce({ id: 1, status: 'em_andamento' });
    const res = await request(app).patch('/api/os/1/status').send({ status: 'em_andamento' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('em_andamento');
  });

  test('400 para status inválido', async () => {
    const res = await request(app).patch('/api/os/1/status').send({ status: 'desconhecido' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/pedidos/:pedidoId/os', () => {
  test('200 e lista de OS', async () => {
    svc.listarPorPedido.mockResolvedValueOnce([{ id: 1, status: 'aberta' }]);
    const res = await request(app).get('/api/pedidos/10/os');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});
