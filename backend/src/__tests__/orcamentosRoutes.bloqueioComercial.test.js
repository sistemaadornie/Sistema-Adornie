jest.mock('../services/orcamentoService', () => ({ listar: jest.fn().mockResolvedValue([]) }));
jest.mock('../services/crmService', () => ({
  listarOrcamentos: jest.fn().mockResolvedValue([]),
  listarFinanceiro: jest.fn().mockResolvedValue([]),
  listarComissoes:  jest.fn().mockResolvedValue([]),
  listarRetornos:   jest.fn().mockResolvedValue([]),
}));
jest.mock('../middlewares/authMiddleware', () => (req, _res, next) => {
  req.user = { id: 1, empresa_id: 10, permissoes: ['COMERCIAL'] };
  next();
});

const jwt = require('jsonwebtoken');
const request = require('supertest');
const express = require('express');
const orcamentosRouter = require('../routes/orcamentosRoutes');
const crmRouter = require('../routes/crmRoutes');

const app = express();
app.use(express.json());
app.use('/api/orcamentos', orcamentosRouter);
app.use('/api/crm', crmRouter);

// `bloquearComercialPuro` (Task 7) decodifica o próprio Authorization header —
// não depende do authMiddleware mockado acima — então as chamadas ao CRM
// legado precisam de um JWT real assinado com o mesmo JWT_SECRET pra exercitar
// o middleware de fato (ver backend/src/__tests__/bloquearComercialPuro.test.js).
const OLD_JWT_SECRET = process.env.JWT_SECRET;
beforeAll(() => { process.env.JWT_SECRET = 'segredo-de-teste'; });
afterAll(() => { process.env.JWT_SECRET = OLD_JWT_SECRET; });

function tokenComercial() {
  return jwt.sign({ permissoes: ['COMERCIAL'] }, process.env.JWT_SECRET);
}

describe('Bloqueio de orçamentos pra COMERCIAL', () => {
  test('GET /api/orcamentos retorna 403 pra COMERCIAL puro', async () => {
    const res = await request(app).get('/api/orcamentos');
    expect(res.status).toBe(403);
  });

  test('GET /api/crm/orcamentos retorna 403 pra COMERCIAL puro', async () => {
    const res = await request(app).get('/api/crm/orcamentos').set('Authorization', `Bearer ${tokenComercial()}`);
    expect(res.status).toBe(403);
  });

  test('GET /api/crm/financeiro retorna 403 pra COMERCIAL puro', async () => {
    const res = await request(app).get('/api/crm/financeiro').set('Authorization', `Bearer ${tokenComercial()}`);
    expect(res.status).toBe(403);
  });

  test('GET /api/crm/comissoes retorna 403 pra COMERCIAL puro', async () => {
    const res = await request(app).get('/api/crm/comissoes').set('Authorization', `Bearer ${tokenComercial()}`);
    expect(res.status).toBe(403);
  });

  test('GET /api/crm/retornos NÃO é bloqueado (fora do escopo de "orçamentos")', async () => {
    const res = await request(app).get('/api/crm/retornos').set('Authorization', `Bearer ${tokenComercial()}`);
    expect(res.status).not.toBe(403);
  });
});
