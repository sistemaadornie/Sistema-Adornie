jest.mock('../database/db', () => ({ query: jest.fn() }));
jest.mock('../middlewares/authMiddleware', () => (req, _res, next) => {
  req.user = { id: 1, empresa_id: 10 };
  next();
});

const request = require('supertest');
const express = require('express');
const router  = require('../routes/arquitetosRoutes');
const db      = require('../database/db');

const app = express();
app.use(express.json());
app.use('/api/arquitetos', router);

afterEach(() => jest.clearAllMocks());

test('POST /arquitetos/importar retorna contadores de escritorios junto com os de arquitetos', async () => {
  db.query
    .mockResolvedValueOnce({ rows: [] }) // arquitetos existentes
    .mockResolvedValueOnce({ rows: [] }) // escritorios existentes
    .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // INSERT escritorios (linha PJ)

  const res = await request(app)
    .post('/api/arquitetos/importar')
    .send({ registros: [{ tipo_pessoa: 'PJ', nome: 'Escritorio X', cpf_cnpj: '11.222.333/0001-44' }] });

  expect(res.status).toBe(200);
  expect(res.body.escritorios_criados).toBe(1);
  expect(res.body.importados).toBe(0);
});
