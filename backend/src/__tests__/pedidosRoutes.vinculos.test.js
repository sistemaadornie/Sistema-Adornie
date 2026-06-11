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

describe('POST /api/pedidos/:id/vinculos', () => {
  test('400 quando item_id ou item_vinculado_id ausentes', async () => {
    const res = await request(app).post('/api/pedidos/1/vinculos').send({ item_id: 11 });
    expect(res.status).toBe(400);
  });

  test('400 quando item_id === item_vinculado_id', async () => {
    const res = await request(app).post('/api/pedidos/1/vinculos').send({ item_id: 11, item_vinculado_id: 11 });
    expect(res.status).toBe(400);
  });

  test('404 quando os itens nao pertencem ao pedido/empresa', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/api/pedidos/1/vinculos').send({ item_id: 11, item_vinculado_id: 10 });
    expect(res.status).toBe(404);
  });

  test('400 quando categoria do item filho nao e vinculavel', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        { id: 11, vinculavel: false, recebe_vinculos: false },
        { id: 10, vinculavel: false, recebe_vinculos: true },
      ],
    });
    const res = await request(app).post('/api/pedidos/1/vinculos').send({ item_id: 11, item_vinculado_id: 10 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/vinculável/);
  });

  test('400 quando categoria do item principal nao recebe vinculos', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        { id: 11, vinculavel: true, recebe_vinculos: false },
        { id: 10, vinculavel: false, recebe_vinculos: false },
      ],
    });
    const res = await request(app).post('/api/pedidos/1/vinculos').send({ item_id: 11, item_vinculado_id: 10 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/recebe vínculos/);
  });

  test('200 cria vinculo, remove vinculo anterior e limpa sem_vinculo', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [
          { id: 11, vinculavel: true, recebe_vinculos: false },
          { id: 10, vinculavel: false, recebe_vinculos: true },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // DELETE pedido_item_vinculos
      .mockResolvedValueOnce({ rows: [] }) // INSERT pedido_item_vinculos
      .mockResolvedValueOnce({ rows: [] }); // UPDATE sem_vinculo

    const res = await request(app).post('/api/pedidos/1/vinculos').send({ item_id: 11, item_vinculado_id: 10 });

    expect(res.status).toBe(200);
    expect(res.body.vinculo).toEqual({ item_id: 11, item_vinculado_id: 10, tipo_vinculo: 'acessorio' });
    expect(db.query.mock.calls[1][0]).toContain('DELETE FROM pedido_item_vinculos');
    expect(db.query.mock.calls[2][0]).toContain('INSERT INTO pedido_item_vinculos');
    expect(db.query.mock.calls[3][0]).toContain('UPDATE pedido_itens');
  });
});

describe('DELETE /api/pedidos/:id/vinculos/:itemId', () => {
  test('404 quando item nao pertence ao pedido/empresa', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete('/api/pedidos/1/vinculos/11');
    expect(res.status).toBe(404);
  });

  test('200 remove o vinculo', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 11 }] }) // ownership check
      .mockResolvedValueOnce({ rows: [] });          // DELETE pedido_item_vinculos

    const res = await request(app).delete('/api/pedidos/1/vinculos/11');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Vínculo removido.');
    expect(db.query.mock.calls[1][0]).toContain('DELETE FROM pedido_item_vinculos');
    expect(db.query.mock.calls[1][1]).toEqual([11]);
  });
});

describe('PATCH /api/pedidos/:id/itens/:itemId/sem-vinculo', () => {
  test('400 quando sem_vinculo nao e booleano', async () => {
    const res = await request(app).patch('/api/pedidos/1/itens/11/sem-vinculo').send({ sem_vinculo: 'sim' });
    expect(res.status).toBe(400);
  });

  test('404 quando item nao pertence ao pedido/empresa', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).patch('/api/pedidos/1/itens/11/sem-vinculo').send({ sem_vinculo: true });
    expect(res.status).toBe(404);
  });

  test('200 atualiza sem_vinculo', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 11 }] })               // ownership check
      .mockResolvedValueOnce({ rows: [{ id: 11, sem_vinculo: true }] }); // UPDATE

    const res = await request(app).patch('/api/pedidos/1/itens/11/sem-vinculo').send({ sem_vinculo: true });

    expect(res.status).toBe(200);
    expect(res.body.item).toEqual({ id: 11, sem_vinculo: true });
    expect(db.query.mock.calls[1][0]).toContain('UPDATE pedido_itens');
  });
});
