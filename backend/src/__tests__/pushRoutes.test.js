jest.mock('../middlewares/authMiddleware', () => (req, _res, next) => {
  req.user = { id: 7, empresa_id: 1 };
  next();
});
jest.mock('../database/db', () => ({ query: jest.fn() }));

const request = require('supertest');
const express = require('express');
const db = require('../database/db');
const router = require('../routes/pushRoutes');

const app = express();
app.use(express.json());
app.use('/api/push', router);

afterEach(() => jest.clearAllMocks());

describe('GET /api/push/vapid-public-key', () => {
  test('retorna a chave pública configurada', async () => {
    process.env.VAPID_PUBLIC_KEY = 'chave-publica-teste';
    const res = await request(app).get('/api/push/vapid-public-key');
    expect(res.status).toBe(200);
    expect(res.body.publicKey).toBe('chave-publica-teste');
  });
});

describe('POST /api/push/subscribe', () => {
  test('400 sem endpoint/keys', async () => {
    const res = await request(app).post('/api/push/subscribe').send({});
    expect(res.status).toBe(400);
  });

  test('201 e grava subscription', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/api/push/subscribe').send({
      endpoint: 'https://push.example/a',
      keys: { p256dh: 'key', auth: 'auth' },
    });
    expect(res.status).toBe(201);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO push_subscriptions'),
      [7, 1, 'https://push.example/a', 'key', 'auth']
    );
  });
});

describe('DELETE /api/push/subscribe', () => {
  test('400 sem endpoint', async () => {
    const res = await request(app).delete('/api/push/subscribe').send({});
    expect(res.status).toBe(400);
  });

  test('200 e remove subscription', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete('/api/push/subscribe').send({ endpoint: 'https://push.example/a' });
    expect(res.status).toBe(200);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM push_subscriptions'),
      ['https://push.example/a', 7]
    );
  });
});
