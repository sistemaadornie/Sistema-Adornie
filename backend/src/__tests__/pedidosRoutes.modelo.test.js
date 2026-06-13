jest.mock('../database/db', () => ({ query: jest.fn(), connect: jest.fn() }));
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

function makeClient(respostas = []) {
  const client = { query: jest.fn(), release: jest.fn() };
  respostas.forEach(r => client.query.mockResolvedValueOnce(r));
  client.query.mockResolvedValue({ rows: [] });
  return client;
}

describe('PATCH /api/pedidos/:id/itens/:itemId/modelo', () => {
  test('400 quando modelo ausente', async () => {
    const res = await request(app).patch('/api/pedidos/1/itens/11/modelo').send({});
    expect(res.status).toBe(400);
  });

  test('404 quando item nao pertence ao pedido/empresa', async () => {
    const client = makeClient([{ rows: [] }]); // ownership check vazio
    db.connect.mockResolvedValue(client);

    const res = await request(app)
      .patch('/api/pedidos/1/itens/11/modelo')
      .send({ modelo: 'Rolo / Rollo' });

    expect(res.status).toBe(404);
    expect(client.release).toHaveBeenCalled();
  });

  test('200 atualiza modelo/especificacoes e registra auditoria', async () => {
    const client = makeClient([
      { rows: [{ id: 11, descricao: 'Persiana Sala' }] }, // ownership check
      { rows: [] },                                       // BEGIN
      { rows: [{ id: 11, modelo: 'Rolo / Rollo', especificacoes: { tubo: '38mm', bando: null } }] }, // UPDATE
      { rows: [] },                                       // INSERT pedido_auditoria
      { rows: [] },                                       // COMMIT
    ]);
    db.connect.mockResolvedValue(client);

    const res = await request(app)
      .patch('/api/pedidos/1/itens/11/modelo')
      .send({ modelo: 'Rolo / Rollo', especificacoes: { tubo: '38mm', bando: null } });

    expect(res.status).toBe(200);
    expect(res.body.item).toEqual({ id: 11, modelo: 'Rolo / Rollo', especificacoes: { tubo: '38mm', bando: null } });
    expect(client.query.mock.calls[2][0]).toContain('UPDATE pedido_itens');
    expect(client.query.mock.calls[3][0]).toContain('INSERT INTO pedido_auditoria');
    expect(client.query.mock.calls[3][1]).toEqual(expect.arrayContaining(['categorizacao']));
  });
});
