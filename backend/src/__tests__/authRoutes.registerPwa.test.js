// authRoutes.js executa queries de migração no top-level ao ser importado (CREATE TABLE IF NOT EXISTS etc.).
// Um default resolvido evita que esses `.catch()` quebrem o require do módulo; os testes sobrescrevem
// as chamadas relevantes com mockResolvedValueOnce, que têm prioridade sobre este default.
jest.mock('../database/db', () => ({ query: jest.fn(() => Promise.resolve({ rows: [] })) }));
jest.mock('bcryptjs', () => ({ compare: jest.fn(), hash: jest.fn().mockResolvedValue('hash-fake') }));
jest.mock('../middlewares/authMiddleware', () => (req, _res, next) => {
  req.user = { id: 99, empresa_id: 10, permissoes: ['GESTOR_USUARIOS'] };
  next();
});

const request = require('supertest');
const express = require('express');
const db      = require('../database/db');
const router  = require('../routes/authRoutes');

const app = express();
app.use(express.json());
app.use('/api/auth', router);

beforeEach(() => jest.clearAllMocks());

describe('POST /api/auth/register com origem=pwa', () => {
  test('grava cadastro_origem="pwa"', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })                                   // email não existe
      .mockResolvedValueOnce({ rows: [] })                                   // cpf não existe
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })                          // empresa válida
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })                          // setor válido
      .mockResolvedValueOnce({ rows: [{ id: 5, email: 'i@x.com', nome_completo: 'Fulano', status: 'pendente', empresa_id: 1, setor_id: 1, cadastro_origem: 'pwa' }] });

    const res = await request(app).post('/api/auth/register').send({
      email: 'i@x.com', senha: '12345678', nome_completo: 'Fulano', cpf: '11122233344',
      setor_id: 1, empresa_id: 1, origem: 'pwa',
    });

    expect(res.status).toBe(201);
    const insertCall = db.query.mock.calls[4];
    expect(insertCall[0]).toContain('cadastro_origem');
    expect(insertCall[1]).toContain('pwa');
  });
});

describe('PUT /api/auth/admin/aprovar/:id', () => {
  test('atribui INSTALADOR quando cadastro_origem=pwa', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 5, cadastro_origem: 'pwa' }] })  // UPDATE status
      .mockResolvedValueOnce({ rows: [] });                                  // INSERT usuario_permissoes

    const res = await request(app).put('/api/auth/admin/aprovar/5');
    expect(res.status).toBe(200);
    const insertPermCall = db.query.mock.calls[1];
    expect(insertPermCall[0]).toContain('usuario_permissoes');
    expect(insertPermCall[0]).toContain('INSTALADOR');
  });

  test('não insere permissão quando cadastro_origem=web', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 6, cadastro_origem: 'web' }] });

    const res = await request(app).put('/api/auth/admin/aprovar/6');
    expect(res.status).toBe(200);
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});
