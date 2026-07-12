const jwt = require('jsonwebtoken');
const bloquearAppPWA = require('../middlewares/bloquearAppPWA');

const OLD_ENV = process.env.JWT_SECRET;
beforeAll(() => { process.env.JWT_SECRET = 'segredo-de-teste'; });
afterAll(() => { process.env.JWT_SECRET = OLD_ENV; });

function mockReqRes(authHeader) {
  const req = { headers: authHeader ? { authorization: authHeader } : {} };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  return { req, res, next };
}

describe('bloquearAppPWA', () => {
  test('403 para token app=pwa sem ADMIN_MASTER', () => {
    const token = jwt.sign({ permissoes: ['INSTALADOR'], app: 'pwa' }, process.env.JWT_SECRET);
    const { req, res, next } = mockReqRes(`Bearer ${token}`);
    bloquearAppPWA(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('passa para token app=pwa com ADMIN_MASTER', () => {
    const token = jwt.sign({ permissoes: ['ADMIN_MASTER'], app: 'pwa' }, process.env.JWT_SECRET);
    const { req, res, next } = mockReqRes(`Bearer ${token}`);
    bloquearAppPWA(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('passa para token app=web independente da permissão', () => {
    const token = jwt.sign({ permissoes: ['COMERCIAL'], app: 'web' }, process.env.JWT_SECRET);
    const { req, res, next } = mockReqRes(`Bearer ${token}`);
    bloquearAppPWA(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('passa quando não há token (authMiddleware trata depois)', () => {
    const { req, res, next } = mockReqRes(null);
    bloquearAppPWA(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('passa quando o token é inválido (authMiddleware trata depois)', () => {
    const { req, res, next } = mockReqRes('Bearer token-invalido');
    bloquearAppPWA(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('bloquearAppPWA montado em clientesRoutes', () => {
  jest.resetModules();
  jest.doMock('../services/clienteService', () => ({ listar: jest.fn().mockResolvedValue([]) }));
  jest.doMock('../middlewares/authMiddleware', () => (req, _res, next) => {
    req.user = { id: 1, empresa_id: 10, permissoes: ['INSTALADOR'] };
    next();
  });

  test('GET /api/clientes com token app=pwa e sem ADMIN_MASTER retorna 403', async () => {
    const request = require('supertest');
    const express = require('express');
    const clientesRouter = require('../routes/clientesRoutes');
    const app = express();
    app.use(express.json());
    app.use('/api/clientes', clientesRouter);

    const token = jwt.sign({ permissoes: ['INSTALADOR'], app: 'pwa' }, process.env.JWT_SECRET);
    const res = await request(app).get('/api/clientes').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
