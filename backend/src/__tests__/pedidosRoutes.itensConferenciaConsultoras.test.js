jest.mock('../database/db', () => ({ query: jest.fn() }));
jest.mock('../middlewares/authMiddleware', () => (req, _res, next) => {
  req.user = { id: 1, empresa_id: 10 };
  next();
});

const request = require('supertest');
const express = require('express');
const router  = require('../routes/pedidosRoutes');
const db      = require('../database/db');

const app = express();
app.use(express.json());
app.use('/api/pedidos', router);

afterEach(() => jest.clearAllMocks());

describe('GET /api/pedidos/:id/itens-conferencia-consultoras', () => {
  test('404 quando o pedido nao pertence a empresa', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/pedidos/1/itens-conferencia-consultoras');
    expect(res.status).toBe(404);
  });

  test('200 retorna itens preenchidos e pendentes, com rotulo de produto simplificado', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // pedCheck
      .mockResolvedValueOnce({
        rows: [
          { pedido_item_id: 11, ordem: 0, ambiente: 'Sala', descricao: 'Cortina Wave Motorizada Linho', medidas: '3,16x2,88', largura: '3.16', altura: '2.88', modelo: 'Cortina Wave', acionamento: 'motorizado', tipo_confeccao: 'cortina', ordem_servico_id: 5, preenchida: true },
          { pedido_item_id: 12, ordem: 1, ambiente: 'Quarto', descricao: 'Persiana Rolo Manual Screen', medidas: '2,00x1,50', largura: '2.00', altura: '1.50', modelo: null, acionamento: 'manual', tipo_confeccao: 'persiana', ordem_servico_id: null, preenchida: false },
          { pedido_item_id: 13, ordem: 2, ambiente: 'Escritório', descricao: 'Forro Franzido Blackout', medidas: '1,50x2,00', largura: '1.50', altura: '2.00', modelo: 'Forro Franzido Blackout', acionamento: null, tipo_confeccao: 'forro', ordem_servico_id: null, preenchida: false },
        ],
      });

    const res = await request(app).get('/api/pedidos/1/itens-conferencia-consultoras');

    expect(res.status).toBe(200);
    expect(res.body.itens).toEqual([
      { pedido_item_id: 11, ordem: 0, ambiente: 'Sala', descricao: 'Cortina Wave Motorizada Linho', medidas: '3,16x2,88', largura: '3.16', altura: '2.88', ordem_servico_id: 5, preenchida: true, produto: 'Cortina Wave Motorizada' },
      { pedido_item_id: 12, ordem: 1, ambiente: 'Quarto', descricao: 'Persiana Rolo Manual Screen', medidas: '2,00x1,50', largura: '2.00', altura: '1.50', ordem_servico_id: null, preenchida: false, produto: 'Persiana Manual' },
      { pedido_item_id: 13, ordem: 2, ambiente: 'Escritório', descricao: 'Forro Franzido Blackout', medidas: '1,50x2,00', largura: '1.50', altura: '2.00', ordem_servico_id: null, preenchida: false, produto: 'Forro Franzido Blackout' },
    ]);
    expect(db.query.mock.calls[1][0]).toContain('necessita_conferencia');
    expect(db.query.mock.calls[1][0]).not.toContain('dados_conferencia_consultoras IS NULL');
  });

  test('200 usa a descricao completa quando nao ha tipo_confeccao/modelo detectados', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          { pedido_item_id: 14, ordem: 0, ambiente: 'Sala', descricao: 'Item avulso sem categoria de confeccao', medidas: null, modelo: null, acionamento: null, tipo_confeccao: null, ordem_servico_id: null, preenchida: false },
        ],
      });

    const res = await request(app).get('/api/pedidos/1/itens-conferencia-consultoras');

    expect(res.status).toBe(200);
    expect(res.body.itens[0].produto).toBe('Item avulso sem categoria de confeccao');
  });

  test('200 retorna lista vazia quando nao ha itens que precisem de conferencia', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/pedidos/1/itens-conferencia-consultoras');

    expect(res.status).toBe(200);
    expect(res.body.itens).toEqual([]);
  });
});
