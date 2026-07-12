// authRoutes.js executa queries de migração no top-level ao ser importado (CREATE TABLE IF NOT EXISTS etc.).
// Um default resolvido evita que esses `.catch()` quebrem o require do módulo; os testes sobrescrevem
// as chamadas relevantes com mockResolvedValueOnce, que têm prioridade sobre este default.
jest.mock('../database/db', () => ({ query: jest.fn(() => Promise.resolve({ rows: [] })) }));
jest.mock('bcryptjs', () => ({ compare: jest.fn(), hash: jest.fn() }));

const request = require('supertest');
const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../database/db');
const router  = require('../routes/authRoutes');

const app = express();
app.use(express.json());
app.use('/api/auth', router);

const USUARIO_COMERCIAL = {
  id: 1, email: 'consultora@x.com', senha: 'hash', nome_completo: 'Consultora X',
  status: 'aprovado', empresa_id: 10, setor_id: 3, foto_url: null,
  setor_nome: 'Comercial', empresa_nome: 'Adornie',
};
const USUARIO_INSTALADOR = { ...USUARIO_COMERCIAL, id: 2, email: 'instalador@x.com' };

// JWT_SECRET não é carregado automaticamente no ambiente de teste (sem dotenv) — mesmo padrão
// usado em authMiddleware.test.js.
const OLD_JWT_SECRET = process.env.JWT_SECRET;
beforeAll(() => { process.env.JWT_SECRET = 'segredo-de-teste'; });
afterAll(() => { process.env.JWT_SECRET = OLD_JWT_SECRET; });

beforeEach(() => jest.clearAllMocks());

describe('POST /api/auth/login', () => {
  test('200 e permite login de COMERCIAL', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [USUARIO_COMERCIAL] })          // SELECT usuario
      .mockResolvedValueOnce({ rows: [{ codigo: 'COMERCIAL' }] })    // SELECT permissoes
      .mockResolvedValueOnce({ rows: [] });                          // INSERT refresh_tokens
    bcrypt.compare.mockResolvedValueOnce(true);

    const res = await request(app).post('/api/auth/login').send({ email: 'consultora@x.com', senha: '12345678' });
    expect(res.status).toBe(200);
    expect(res.body.user.permissoes).toEqual(['COMERCIAL']);
  });

  test('403 para usuário só com INSTALADOR', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [USUARIO_INSTALADOR] })
      .mockResolvedValueOnce({ rows: [{ codigo: 'INSTALADOR' }] });
    bcrypt.compare.mockResolvedValueOnce(true);

    const res = await request(app).post('/api/auth/login').send({ email: 'instalador@x.com', senha: '12345678' });
    expect(res.status).toBe(403);
  });

  test('200 para ADMIN_MASTER + INSTALADOR combinados (defensivo)', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [USUARIO_INSTALADOR] })
      .mockResolvedValueOnce({ rows: [{ codigo: 'INSTALADOR' }, { codigo: 'ADMIN_MASTER' }] })
      .mockResolvedValueOnce({ rows: [] });
    bcrypt.compare.mockResolvedValueOnce(true);

    const res = await request(app).post('/api/auth/login').send({ email: 'instalador@x.com', senha: '12345678' });
    expect(res.status).toBe(200);
  });
});
