jest.mock('../database/db', () => ({ query: jest.fn() }));
const db = require('../database/db');
const svc = require('../services/ordemServicoService');

afterEach(() => jest.clearAllMocks());

describe('criar', () => {
  test('insere e retorna a OS criada', async () => {
    const fakeOs = { id: 1, pedido_item_id: 5, status: 'aberta', responsavel_id: 2 };
    db.query.mockResolvedValueOnce({ rows: [fakeOs] });

    const result = await svc.criar({ pedidoItemId: 5, responsavelId: 2 });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ordem_servico'),
      [5, 2]
    );
    expect(result).toEqual(fakeOs);
  });
});

describe('listarPorPedido', () => {
  test('retorna lista de OS com total de mídias', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1, status: 'aberta', total_fotos: '2', total_videos: '1' }],
    });
    const rows = await svc.listarPorPedido(10);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('pedido_itens'), [10]);
    expect(rows[0].total_fotos).toBe('2');
  });
});

describe('atualizarStatus', () => {
  test('atualiza status e seta encerrada_em quando status=encerrada', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'encerrada', encerrada_em: new Date() }] });
    const result = await svc.atualizarStatus(1, 'encerrada');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('encerrada_em'),
      expect.arrayContaining(['encerrada', 1])
    );
    expect(result.status).toBe('encerrada');
  });

  test('não seta encerrada_em para outros status', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'em_andamento', encerrada_em: null }] });
    await svc.atualizarStatus(1, 'em_andamento');
    const sql = db.query.mock.calls[0][0];
    expect(sql).not.toContain('encerrada_em = NOW()');
  });
});
