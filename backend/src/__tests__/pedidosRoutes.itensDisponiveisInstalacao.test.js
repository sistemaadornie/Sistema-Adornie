jest.mock('../database/db', () => ({ query: jest.fn() }));
jest.mock('../middlewares/authMiddleware', () => (req, _res, next) => {
  req.user = { id: 1, empresa_id: 10 };
  next();
});

const request = require('supertest');
const express = require('express');
const router  = require('../routes/pedidosRoutes');
const db      = require('../database/db');

const app = express();
app.use(express.json());
app.use('/api/pedidos', router);

afterEach(() => jest.clearAllMocks());

describe('GET /api/pedidos/:id/itens-disponiveis-instalacao', () => {
  test('exclui nao_concluido da subquery de itens ja cobertos', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // pedCheck
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/pedidos/1/itens-disponiveis-instalacao');

    expect(res.status).toBe(200);
    expect(db.query.mock.calls[1][0]).toContain("'cancelado','rejeitado','nao_concluido'");
    expect(db.query.mock.calls[1][0]).toContain("a.tipo = 'Instalação'");
  });

  test('404 quando o pedido nao pertence a empresa', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/pedidos/1/itens-disponiveis-instalacao');
    expect(res.status).toBe(404);
  });
});
