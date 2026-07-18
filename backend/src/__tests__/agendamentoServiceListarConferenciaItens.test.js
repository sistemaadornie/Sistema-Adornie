jest.mock('../database/db', () => ({ query: jest.fn() }));
const db = require('../database/db');
const svc = require('../services/agendamentoService');

afterEach(() => jest.clearAllMocks());

describe('listarConferenciaItens', () => {
  test('expõe conferencia_consultoras_preenchida por item', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 5 }] }) // agCheck
      .mockResolvedValueOnce({ rows: [{
        pedido_item_id: 1, descricao: 'Cortina', ambiente: 'Sala', tipo_confeccao: 'cortina',
        status: 'pendente', observacoes: null, dados: null, conferido_em: null, conferido_por_nome: null,
        ordem_servico_id: 9, confeccao_preenchida: false, ficha_preenchida: false,
        conferencia_consultoras_preenchida: true,
      }] });

    const itens = await svc.listarConferenciaItens(5, 10);

    expect(itens[0].conferencia_consultoras_preenchida).toBe(true);
    expect(db.query.mock.calls[1][0]).toContain('dados_conferencia_consultoras');
  });

  test('inclui numero_unidade e total_unidades na query', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 5 }] }) // agCheck
      .mockResolvedValueOnce({ rows: [{
        pedido_item_id: 1, descricao: 'Persiana', ambiente: 'Quarto', tipo_confeccao: 'persiana',
        status: 'pendente', observacoes: null, dados: null, conferido_em: null, conferido_por_nome: null,
        ordem_servico_id: 9, confeccao_preenchida: false, ficha_preenchida: false,
        conferencia_consultoras_preenchida: false,
        numero_unidade: 1, total_unidades: 3,
      }] });

    const itens = await svc.listarConferenciaItens(5, 10);

    expect(itens[0].numero_unidade).toBe(1);
    expect(itens[0].total_unidades).toBe(3);
    expect(db.query.mock.calls[1][0]).toContain('pi.numero_unidade');
    expect(db.query.mock.calls[1][0]).toContain('pi.total_unidades');
  });
});
