jest.mock('../services/ordemServicoService');
jest.mock('../middlewares/authMiddleware', () => (req, _res, next) => {
  req.user = { id: 1, empresa_id: 1 };
  next();
});

const request  = require('supertest');
const express  = require('express');
const router   = require('../routes/ordemServicoRoutes');
const svc      = require('../services/ordemServicoService');

const app = express();
app.use(express.json());
app.use('/api/os', router);
app.use('/api', router);

describe('POST /api/os', () => {
  test('201 ao criar OS com dados válidos', async () => {
    svc.criar.mockResolvedValueOnce({ id: 1, status: 'aberta' });
    const res = await request(app).post('/api/os').send({ pedido_item_id: 5, responsavel_id: 2 });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('aberta');
  });

  test('400 sem pedido_item_id', async () => {
    const res = await request(app).post('/api/os').send({});
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/os/:id/status', () => {
  test('200 ao atualizar para status válido', async () => {
    svc.atualizarStatus.mockResolvedValueOnce({ id: 1, status: 'em_andamento' });
    const res = await request(app).patch('/api/os/1/status').send({ status: 'em_andamento' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('em_andamento');
  });

  test('400 para status inválido', async () => {
    const res = await request(app).patch('/api/os/1/status').send({ status: 'desconhecido' });
    expect(res.status).toBe(400);
  });

  test('404 quando OS não encontrada', async () => {
    const err = Object.assign(new Error('OS não encontrada'), { status: 404 });
    svc.atualizarStatus.mockRejectedValueOnce(err);
    const res = await request(app).patch('/api/os/999/status').send({ status: 'encerrada' });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/pedidos/:pedidoId/os', () => {
  test('200 e lista de OS', async () => {
    svc.listarPorPedido.mockResolvedValueOnce([{ id: 1, status: 'aberta' }]);
    const res = await request(app).get('/api/pedidos/10/os');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe('PUT /api/os/:id/confeccao', () => {
  test('200 ao salvar dados de confecção', async () => {
    svc.salvarDadosConfeccao.mockResolvedValueOnce({ id: 1, dados_confeccao: { larguraTrilho: 4.92 } });
    const res = await request(app).put('/api/os/1/confeccao').send({ larguraTrilho: 4.92 });
    expect(res.status).toBe(200);
    expect(res.body.dados_confeccao).toEqual({ larguraTrilho: 4.92 });
  });

  test('400 quando o serviço rejeita os dados', async () => {
    const err = Object.assign(new Error('Largura do trilho é obrigatória e deve ser maior que zero.'), { status: 400 });
    svc.salvarDadosConfeccao.mockRejectedValueOnce(err);
    const res = await request(app).put('/api/os/1/confeccao').send({});
    expect(res.status).toBe(400);
  });

  test('400 para id inválido', async () => {
    const res = await request(app).put('/api/os/abc/confeccao').send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/os/tecidos/largura', () => {
  test('200 com a largura encontrada', async () => {
    svc.buscarLarguraTecidoConhecida.mockResolvedValueOnce('3,30');
    const res = await request(app).get('/api/os/tecidos/largura').query({ nome: 'ADO016' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ largura: '3,30' });
    expect(svc.buscarLarguraTecidoConhecida).toHaveBeenCalledWith('ADO016', 1);
  });

  test('200 com largura null quando não encontra', async () => {
    svc.buscarLarguraTecidoConhecida.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/os/tecidos/largura').query({ nome: 'DESCONHECIDO' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ largura: null });
  });
});

describe('GET /api/os/:id/itens-ambiente', () => {
  test('200 com lista de itens do mesmo ambiente', async () => {
    svc.listarItensMesmoAmbiente.mockResolvedValueOnce([
      { id: 8, descricao: 'Cortina Blackout', cor: 'Branca', categoria_nome: 'Cortina' },
    ]);
    const res = await request(app).get('/api/os/2/itens-ambiente');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(svc.listarItensMesmoAmbiente).toHaveBeenCalledWith(2, 1);
  });

  test('400 para id inválido', async () => {
    const res = await request(app).get('/api/os/abc/itens-ambiente');
    expect(res.status).toBe(400);
  });
});
