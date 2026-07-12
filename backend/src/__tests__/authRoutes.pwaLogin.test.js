// authRoutes.js executa queries de migração no top-level ao ser importado (CREATE TABLE IF NOT EXISTS etc.).
// Um default resolvido evita que esses `.catch()` quebrem o require do módulo; os testes sobrescrevem
// as chamadas relevantes com mockResolvedValueOnce, que têm prioridade sobre este default.
jest.mock('../database/db', () => ({ query: jest.fn(() => Promise.resolve({ rows: [] })) }));
jest.mock('bcryptjs', () => ({ compare: jest.fn(), hash: jest.fn() }));

const request = require('supertest');
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../database/db');
const router  = require('../routes/authRoutes');

const app = express();
app.use(express.json());
app.use('/api/auth', router);

const BASE = {
  id: 1, senha: 'hash', nome_completo: 'Fulano', status: 'aprovado',
  empresa_id: 10, setor_id: 3, foto_url: null, setor_nome: 'Instalação', empresa_nome: 'Adornie',
};

// JWT_SECRET não é carregado automaticamente no ambiente de teste (sem dotenv) — mesmo padrão
// usado em authMiddleware.test.js e authRoutes.login.test.js.
const OLD_JWT_SECRET = process.env.JWT_SECRET;
beforeAll(() => { process.env.JWT_SECRET = 'segredo-de-teste'; });
afterAll(() => { process.env.JWT_SECRET = OLD_JWT_SECRET; });

beforeEach(() => jest.clearAllMocks());

describe('POST /api/auth/pwa/login', () => {
  test('200 para INSTALADOR', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ ...BASE, email: 'inst@x.com' }] })
      .mockResolvedValueOnce({ rows: [{ codigo: 'INSTALADOR' }] })
      .mockResolvedValueOnce({ rows: [] });
    bcrypt.compare.mockResolvedValueOnce(true);

    const res = await request(app).post('/api/auth/pwa/login').send({ email: 'inst@x.com', senha: '12345678' });
    expect(res.status).toBe(200);
    expect(res.body.user.permissoes).toEqual(['INSTALADOR']);
  });

  test('200 para ADMIN_MASTER', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ ...BASE, email: 'admin@x.com' }] })
      .mockResolvedValueOnce({ rows: [{ codigo: 'ADMIN_MASTER' }] })
      .mockResolvedValueOnce({ rows: [] });
    bcrypt.compare.mockResolvedValueOnce(true);

    const res = await request(app).post('/api/auth/pwa/login').send({ email: 'admin@x.com', senha: '12345678' });
    expect(res.status).toBe(200);
  });

  test('403 para COMERCIAL', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ ...BASE, email: 'com@x.com' }] })
      .mockResolvedValueOnce({ rows: [{ codigo: 'COMERCIAL' }] });
    bcrypt.compare.mockResolvedValueOnce(true);

    const res = await request(app).post('/api/auth/pwa/login').send({ email: 'com@x.com', senha: '12345678' });
    expect(res.status).toBe(403);
  });

  test('403 para OPERADOR_AGENDA', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ ...BASE, email: 'op@x.com' }] })
      .mockResolvedValueOnce({ rows: [{ codigo: 'OPERADOR_AGENDA' }] });
    bcrypt.compare.mockResolvedValueOnce(true);

    const res = await request(app).post('/api/auth/pwa/login').send({ email: 'op@x.com', senha: '12345678' });
    expect(res.status).toBe(403);
  });

  test('400 com credenciais erradas', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/api/auth/pwa/login').send({ email: 'x@x.com', senha: '12345678' });
    expect(res.status).toBe(400);
  });
});

// Regressão: POST /refresh reemitia o access token sem o claim `app`, o que fazia uma
// sessão do PWA (app: "pwa") virar um token sem `app` (=> null em authMiddleware) após
// um refresh, escapando do bloqueio de bloquearAppPWA nas rotas exclusivas do site.
describe('POST /api/auth/refresh preserva o claim app da sessão PWA', () => {
  test('access token reemitido mantém app: "pwa" após refresh de uma sessão logada via /pwa/login', async () => {
    // 1) Login PWA — sequência real de queries de autenticarCredenciais + assinarToken + emitirRefreshToken:
    //    SELECT usuario, SELECT permissoes, INSERT refresh_tokens.
    db.query
      .mockResolvedValueOnce({ rows: [{ ...BASE, email: 'inst@x.com' }] })
      .mockResolvedValueOnce({ rows: [{ codigo: 'INSTALADOR' }] })
      .mockResolvedValueOnce({ rows: [] });
    bcrypt.compare.mockResolvedValueOnce(true);

    const loginRes = await request(app)
      .post('/api/auth/pwa/login')
      .send({ email: 'inst@x.com', senha: '12345678' });

    expect(loginRes.status).toBe(200);
    const decodedLoginToken = jwt.decode(loginRes.body.token);
    expect(decodedLoginToken.app).toBe('pwa');
    const { refreshToken } = loginRes.body;
    expect(refreshToken).toBeTruthy();

    // 2) Refresh — sequência real do handler /refresh:
    //    SELECT rt.* + rt.app JOIN usuarios, SELECT permissoes, UPDATE refresh_tokens (rotação).
    // Antes da correção, `rt.app` não era selecionado (coluna nem existia em refresh_tokens) e o
    // JWT reemitido nunca incluía `app`, então este decoded.app teria vindo `undefined`.
    db.query
      .mockResolvedValueOnce({
        rows: [{
          usuario_id:    BASE.id,
          expires_at:    new Date(Date.now() + 60_000).toISOString(),
          token_hash:    'hash-fake',
          app:           'pwa',
          email:         'inst@x.com',
          nome_completo: BASE.nome_completo,
          foto_url:      BASE.foto_url,
          status:        BASE.status,
          empresa_id:    BASE.empresa_id,
          setor_id:      BASE.setor_id,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ codigo: 'INSTALADOR' }] })
      .mockResolvedValueOnce({ rows: [] });

    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(refreshRes.status).toBe(200);
    const decodedRefreshedToken = jwt.decode(refreshRes.body.token);
    expect(decodedRefreshedToken.app).toBe('pwa');
  });
});
