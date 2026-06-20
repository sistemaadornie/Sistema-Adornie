jest.mock('../services/agendamentoService');
jest.mock('../middlewares/authMiddleware', () => (req, _res, next) => {
  req.user = { id: 1, empresa_id: 10 };
  next();
});

const request = require('supertest');
const express = require('express');
const router  = require('../routes/agendamentosRoutes');
const svc     = require('../services/agendamentoService');

const app = express();
app.use(express.json());
app.use('/api/agendamentos', router);

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0, 0, 0, 0]);

afterEach(() => jest.clearAllMocks());

describe('POST /api/agendamentos/:id/itens/:itemId/fotos', () => {
  test('201 com fotos enviadas', async () => {
    svc.adicionarFotoItem.mockResolvedValueOnce([{ id: 1, url: 'https://cdn/foto1.jpg' }]);
    const res = await request(app)
      .post('/api/agendamentos/3/itens/5/fotos')
      .attach('arquivos', PNG_BYTES, 'foto.png');
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true, fotos: [{ id: 1, url: 'https://cdn/foto1.jpg' }] });
    expect(svc.adicionarFotoItem).toHaveBeenCalledWith('3', '5', 10, 1, expect.any(Array));
  });

  test('404 quando o item não existe', async () => {
    const err = new Error('Item de agendamento não encontrado.');
    err.status = 404;
    svc.adicionarFotoItem.mockRejectedValueOnce(err);
    const res = await request(app)
      .post('/api/agendamentos/3/itens/999/fotos')
      .attach('arquivos', PNG_BYTES, 'foto.png');
    expect(res.status).toBe(404);
  });

  test('400 quando o arquivo tem conteúdo inválido (magic bytes)', async () => {
    const res = await request(app)
      .post('/api/agendamentos/3/itens/5/fotos')
      .attach('arquivos', Buffer.from('nao e uma imagem'), 'foto.png');
    expect(res.status).toBe(400);
    expect(svc.adicionarFotoItem).not.toHaveBeenCalled();
  });
});
