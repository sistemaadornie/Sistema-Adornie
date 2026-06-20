jest.mock('../database/db', () => ({ query: jest.fn() }));
const db = require('../database/db');
const svc = require('../services/ordemServicoService');

afterEach(() => jest.clearAllMocks());

describe('criar', () => {
  test('cria a OS com o tipo da categoria do item', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ tipo_confeccao: 'cortina' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, pedido_item_id: 5, status: 'aberta', tipo: 'cortina' }] });

    const result = await svc.criar({ pedidoItemId: 5, responsavelId: 2 });

    expect(db.query).toHaveBeenNthCalledWith(2,
      expect.stringContaining('INSERT INTO ordem_servico'),
      [5, 2, 'cortina']
    );
    expect(result.tipo).toBe('cortina');
  });

  test('retorna a OS existente em vez de duplicar (idempotente)', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ tipo_confeccao: 'forro' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 9, pedido_item_id: 5, status: 'em_andamento', tipo: 'forro' }] });

    const result = await svc.criar({ pedidoItemId: 5, responsavelId: 2 });

    expect(result.id).toBe(9);
  });

  test('lança erro 400 quando a categoria do item não tem ficha de confecção', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ tipo_confeccao: null }] });

    await expect(svc.criar({ pedidoItemId: 5, responsavelId: 2 })).rejects.toMatchObject({ status: 400 });
  });

  test('lança erro 404 quando o item do pedido não existe', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    await expect(svc.criar({ pedidoItemId: 999, responsavelId: 2 })).rejects.toMatchObject({ status: 404 });
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

  test('lança erro 404 quando OS não existe', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(svc.atualizarStatus(999, 'encerrada')).rejects.toMatchObject({ status: 404 });
  });
});

describe('buscar', () => {
  test('retorna a OS detalhada com dados de confecção', async () => {
    const fakeOs = {
      id: 1, status: 'aberta', pedido_id: 10, pedido_numero_sequencial: 4, cliente_nome: 'Teste Cliente',
      tipo: 'cortina', dados_confeccao: { larguraTrilho: 4.92 }, confeccao_preenchido_em: '2026-06-20T10:00:00.000Z',
    };
    db.query.mockResolvedValueOnce({ rows: [fakeOs] });

    const res = await svc.buscar(1);
    expect(res.pedido_numero).toBe('SIS-00000004');
    expect(res.dados_confeccao).toEqual({ larguraTrilho: 4.92 });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('os.dados_confeccao'), [1]);
  });

  test('retorna null se não existir', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await svc.buscar(999);
    expect(res).toBeNull();
  });
});

describe('salvarDadosTecnicos', () => {
  const validData = {
    largura: '4.20',
    altura_esq: '3.00',
    altura_meio: '3.00',
    altura_dir: '3.00',
    responsavel_conferencia: 'João Conf',
    data_conferencia: '2026-05-26',
    assinatura_tecnico: 'data:image/png;base64,foo'
  };

  test('salva com sucesso quando todos os dados válidos são fornecidos', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, dados_tecnicos: validData, status: 'em_andamento' }] });

    const result = await svc.salvarDadosTecnicos(1, 2, validData);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('dados_tecnicos = $1'),
      [JSON.stringify(validData), 2, 1]
    );
    expect(result.status).toBe('em_andamento');
  });

  test('lança erro se largura técnica for inválida', async () => {
    const data = { ...validData, largura: '0' };
    await expect(svc.salvarDadosTecnicos(1, 2, data)).rejects.toThrow('largura');
  });

  test('lança erro se altura esquerda for inválida', async () => {
    const data = { ...validData, altura_esq: null };
    await expect(svc.salvarDadosTecnicos(1, 2, data)).rejects.toThrow('esquerda');
  });

  test('lança erro se responsável não for preenchido', async () => {
    const data = { ...validData, responsavel_conferencia: '' };
    await expect(svc.salvarDadosTecnicos(1, 2, data)).rejects.toThrow('responsável');
  });

  test('lança erro se assinatura do técnico não for fornecida', async () => {
    const data = { ...validData, assinatura_tecnico: '' };
    await expect(svc.salvarDadosTecnicos(1, 2, data)).rejects.toThrow('Assinatura');
  });
});

