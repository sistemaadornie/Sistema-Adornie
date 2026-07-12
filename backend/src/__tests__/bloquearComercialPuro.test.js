const jwt = require('jsonwebtoken');
const bloquearComercialPuro = require('../middlewares/bloquearComercialPuro');

const OLD_ENV = process.env.JWT_SECRET;
beforeAll(() => { process.env.JWT_SECRET = 'segredo-de-teste'; });
afterAll(() => { process.env.JWT_SECRET = OLD_ENV; });

function mockReqRes(authHeader) {
  const req = { headers: authHeader ? { authorization: authHeader } : {} };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  return { req, res, next };
}

describe('bloquearComercialPuro', () => {
  test('403 para COMERCIAL puro', () => {
    const token = jwt.sign({ permissoes: ['COMERCIAL'] }, process.env.JWT_SECRET);
    const { req, res, next } = mockReqRes(`Bearer ${token}`);
    bloquearComercialPuro(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('passa para COMERCIAL + OPERADOR_AGENDA', () => {
    const token = jwt.sign({ permissoes: ['COMERCIAL', 'OPERADOR_AGENDA'] }, process.env.JWT_SECRET);
    const { req, res, next } = mockReqRes(`Bearer ${token}`);
    bloquearComercialPuro(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('passa para INSTALADOR', () => {
    const token = jwt.sign({ permissoes: ['INSTALADOR'] }, process.env.JWT_SECRET);
    const { req, res, next } = mockReqRes(`Bearer ${token}`);
    bloquearComercialPuro(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('passa quando não há token', () => {
    const { req, res, next } = mockReqRes(null);
    bloquearComercialPuro(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('bloquearComercialPuro montado em veiculosRoutes', () => {
  jest.resetModules();
  jest.doMock('../services/veiculoService', () => ({ listar: jest.fn().mockResolvedValue([]) }));
  jest.doMock('../middlewares/authMiddleware', () => (req, _res, next) => {
    req.user = { id: 1, empresa_id: 10, permissoes: ['COMERCIAL'] };
    next();
  });

  test('GET /api/veiculos com token COMERCIAL puro retorna 403', async () => {
    const request = require('supertest');
    const express = require('express');
    const veiculosRouter = require('../routes/veiculosRoutes');
    const app = express();
    app.use(express.json());
    app.use('/api/veiculos', veiculosRouter);

    const token = jwt.sign({ permissoes: ['COMERCIAL'] }, process.env.JWT_SECRET);
    const res = await request(app).get('/api/veiculos').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
