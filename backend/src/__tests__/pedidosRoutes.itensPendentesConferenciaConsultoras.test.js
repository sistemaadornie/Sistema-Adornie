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

describe('GET /api/pedidos/:id/itens-pendentes-conferencia-consultoras', () => {
  test('404 quando o pedido nao pertence a empresa', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/pedidos/1/itens-pendentes-conferencia-consultoras');
    expect(res.status).toBe(404);
  });

  test('200 retorna itens pendentes de conferencia consultoras', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // pedCheck
      .mockResolvedValueOnce({
        rows: [
          { pedido_item_id: 11, ordem: 0, ambiente: 'Sala', descricao: 'Cortina Wave', medidas: '3,16x2,88', ordem_servico_id: null },
        ],
      });

    const res = await request(app).get('/api/pedidos/1/itens-pendentes-conferencia-consultoras');

    expect(res.status).toBe(200);
    expect(res.body.itens).toEqual([
      { pedido_item_id: 11, ordem: 0, ambiente: 'Sala', descricao: 'Cortina Wave', medidas: '3,16x2,88', ordem_servico_id: null },
    ]);
    expect(db.query.mock.calls[1][0]).toContain('necessita_conferencia');
    expect(db.query.mock.calls[1][0]).toContain('dados_conferencia_consultoras IS NULL');
  });

  test('filtra item pai expandido (não lista o pai apos a expansao)', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // pedCheck
      .mockResolvedValueOnce({ rows: [] });

    await request(app).get('/api/pedidos/1/itens-pendentes-conferencia-consultoras');

    expect(db.query.mock.calls[1][0]).toContain('NOT (pi.item_pai_id IS NULL AND pi.expandido = true)');
  });

  test('200 retorna lista vazia quando nao ha itens pendentes', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/pedidos/1/itens-pendentes-conferencia-consultoras');

    expect(res.status).toBe(200);
    expect(res.body.itens).toEqual([]);
  });
});
