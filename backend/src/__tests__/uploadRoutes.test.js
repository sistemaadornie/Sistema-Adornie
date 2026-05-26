jest.mock('../services/uploadSessionService');
jest.mock('../services/googleDriveService');
jest.mock('../database/db', () => ({ query: jest.fn() }));
jest.mock('../middlewares/authMiddleware', () => (req, _res, next) => {
  req.user = { id: 7, empresa_id: 1 };
  next();
});

const request    = require('supertest');
const express    = require('express');
const router     = require('../routes/uploadRoutes');
const uploadSvc  = require('../services/uploadSessionService');
const driveSvc   = require('../services/googleDriveService');
const db         = require('../database/db');

const app = express();
app.use(express.json());
app.use('/api', router);

const fakePedido = { id: 1, numero_sequencial: 42, data_pedido: '2026-05-24', empresa_id: 1, empresa_nome: 'Adornies' };
const fakeItem   = { id: 5, descricao: 'Cortinas Sala', ordem: 1 };

describe('POST /api/midias/iniciar', () => {
  const body = {
    pedido_id: 1, pedido_item_id: 5, nome_arquivo: 'foto.jpg',
    tamanho_bytes: 500000, mime_type: 'image/jpeg', tipo: 'foto', hash_md5: 'abc123',
  };

  test('400 sem campos obrigatórios', async () => {
    const res = await request(app).post('/api/midias/iniciar').send({});
    expect(res.status).toBe(400);
  });

  test('200 com duplicata: retorna midia_id sem criar sessão', async () => {
    uploadSvc.verificarDuplicata.mockResolvedValueOnce({ id: 99, drive_url: 'https://drive.google.com/x' });
    const res = await request(app).post('/api/midias/iniciar').send(body);
    expect(res.status).toBe(200);
    expect(res.body.duplicata).toBe(true);
    expect(res.body.midia_id).toBe(99);
  });

  test('200 criando sessão nova', async () => {
    uploadSvc.verificarDuplicata.mockResolvedValueOnce(null);
    db.query
      .mockResolvedValueOnce({ rows: [fakePedido] })
      .mockResolvedValueOnce({ rows: [fakeItem] });
    driveSvc.getOrCreateOsFolder.mockResolvedValueOnce('folder-id');
    driveSvc.initiateResumableUpload.mockResolvedValueOnce('https://drive.example/upload/uuid');
    uploadSvc.criarSessao.mockResolvedValueOnce({ id: 'sess-uuid' });

    const res = await request(app).post('/api/midias/iniciar').send(body);
    expect(res.status).toBe(200);
    expect(res.body.upload_session_id).toBe('sess-uuid');
    expect(res.body.chunk_size).toBe(5 * 1024 * 1024);
  });
});

describe('GET /api/midias/:id/status', () => {
  test('404 quando sessão não existe', async () => {
    uploadSvc.buscarStatus.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/midias/uuid-nao-existe/status');
    expect(res.status).toBe(404);
  });

  test('200 com sessão existente', async () => {
    uploadSvc.buscarStatus.mockResolvedValueOnce({ id: 'uuid-1', status: 'pendente', bytes_confirmados: 0 });
    const res = await request(app).get('/api/midias/uuid-1/status');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pendente');
  });
});

describe('POST /api/midias/:id/confirmar', () => {
  test('400 sem drive_file_id', async () => {
    const res = await request(app).post('/api/midias/uuid-1/confirmar').send({ drive_url: 'x' });
    expect(res.status).toBe(400);
  });

  test('201 ao confirmar com sucesso', async () => {
    uploadSvc.confirmar.mockResolvedValueOnce({ midia_id: 42 });
    const res = await request(app)
      .post('/api/midias/uuid-1/confirmar')
      .send({ drive_file_id: 'file-id', drive_url: 'https://drive.google.com/x' });
    expect(res.status).toBe(201);
    expect(res.body.midia_id).toBe(42);
  });
});

describe('GET /api/pedidos/:id/midias', () => {
  test('200 com lista de mídias', async () => {
    uploadSvc.listarPorPedido.mockResolvedValueOnce([{ id: 1, tipo: 'foto' }]);
    const res = await request(app).get('/api/pedidos/10/midias');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe('GET /api/os/:id/midias', () => {
  test('200 com lista de mídias da OS', async () => {
    uploadSvc.listarPorOs.mockResolvedValueOnce([{ id: 1, tipo: 'video' }]);
    const res = await request(app).get('/api/os/3/midias');
    expect(res.status).toBe(200);
    expect(res.body[0].tipo).toBe('video');
  });
});
