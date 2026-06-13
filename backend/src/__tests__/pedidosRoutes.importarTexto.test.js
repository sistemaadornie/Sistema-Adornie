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

const TEXTO = [
  "#\tAmbiente\tReferência\tCor\tProduto\tMedidas\tQtde\tUn\tPreço\tTotal",
  "1\tSala\t\t\tCORTINA WAVE COM BARRA DE 30CM - ACIONAMENTO MOTORIZADO\t2,00x2,50\t1\tM2\t100,00\t100,00",
  "2\tSala\t\t\tFORRO BLACKOUT FRANZIDO - ACIONAMENTO MANUAL\t2,00x2,50\t1\tM2\t100,00\t100,00",
  "3\tQuarto\t\t\tPERSIANA HUNTER DOUGLAS TELA SOLAR 3% - ACIONAMENTO MANUAL\t1,20x1,50\t1\tUN\t100,00\t100,00",
  "4\tQuarto\t\t\tTRILHO PARA CORTINA - 2,50M\t2,50x1,00\t1\tUN\t50,00\t50,00",
].join("\n");

describe('POST /api/pedidos/importar-texto — detecção de modelo/acionamento', () => {
  test('detecta modelo de cortina + acionamento motorizado', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        { id: 1, nome_lower: 'cortinas' },
        { id: 2, nome_lower: 'forros' },
        { id: 3, nome_lower: 'persianas' },
        { id: 4, nome_lower: 'trilhos e varões' },
      ],
    });

    const res = await request(app).post('/api/pedidos/importar-texto').send({ texto: TEXTO });

    expect(res.status).toBe(200);
    const [cortina, forro, persiana, trilho] = res.body.extraido.itens;

    expect(cortina.categoria_id).toBe(1);
    expect(cortina.modelo).toBe('Cortina Wave');
    expect(cortina.especificacoes).toEqual({ acionamento: 'motorizado' });

    expect(forro.categoria_id).toBe(2);
    expect(forro.modelo).toBe('Forro Franzido Blackout');
    expect(forro.especificacoes).toEqual({ acionamento: 'manual' });

    expect(persiana.categoria_id).toBe(3);
    expect(persiana.modelo).toBeNull();
    expect(persiana.especificacoes).toEqual({ acionamento: 'manual' });

    expect(trilho.categoria_id).toBe(4);
    expect(trilho.modelo).toBeNull();
    expect(trilho.especificacoes).toBeNull();
  });
});
