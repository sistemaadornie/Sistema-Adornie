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

describe('GET /api/pedidos/:id/itens-disponiveis-conferencia-entrega', () => {
  test('404 quando o pedido nao pertence a empresa', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/pedidos/1/itens-disponiveis-conferencia-entrega');
    expect(res.status).toBe(404);
  });

  test('200 retorna itens pendentes de conferencia', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // pedCheck
      .mockResolvedValueOnce({
        rows: [
          { id: 11, ambiente: 'Sala', descricao: 'Persiana Rolo', quantidade: 1, unidade: 'UN', categoria_id: 5, categoria_nome: 'Persianas' },
        ],
      });

    const res = await request(app).get('/api/pedidos/1/itens-disponiveis-conferencia-entrega');

    expect(res.status).toBe(200);
    expect(res.body.itens).toEqual([
      { id: 11, ambiente: 'Sala', descricao: 'Persiana Rolo', quantidade: 1, unidade: 'UN', categoria_id: 5, categoria_nome: 'Persianas' },
    ]);
    expect(db.query.mock.calls[1][0]).toContain('necessita_conferencia');
    expect(db.query.mock.calls[1][0]).toContain("a.tipo = 'Conferência'");
  });

  test('200 retorna lista vazia quando nao ha itens pendentes', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // pedCheck
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/pedidos/1/itens-disponiveis-conferencia-entrega');

    expect(res.status).toBe(200);
    expect(res.body.itens).toEqual([]);
  });
});
