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
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('os.dados_conferencia_consultoras'), [1]);
  });

  test('retorna null se não existir', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await svc.buscar(999);
    expect(res).toBeNull();
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

describe('salvarDadosConfeccao', () => {
  test('salva dados de confecção de cortina quando válidos', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ tipo: 'cortina' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, dados_confeccao: { larguraTrilho: '4,92' }, status: 'em_andamento' }] });

    const dados = { larguraTrilho: '4,92', tipoWave: 'G', espacador: '7,00', abertura: 'SEM ABERTURA', feitaPor: 'POR ALTURA' };
    const result = await svc.salvarDadosConfeccao(1, 2, dados);

    expect(db.query).toHaveBeenNthCalledWith(2,
      expect.stringContaining('dados_confeccao = $1'),
      [JSON.stringify(dados), 2, 1]
    );
    expect(result.status).toBe('em_andamento');
  });

  test('lança erro 400 se largura do trilho for inválida para cortina', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ tipo: 'cortina' }] });
    const dados = { larguraTrilho: '0', tipoWave: 'G', espacador: '7,00', abertura: 'SEM ABERTURA', feitaPor: 'POR ALTURA' };
    await expect(svc.salvarDadosConfeccao(1, 2, dados)).rejects.toThrow('trilho');
  });

  test('salva dados de confecção de forro quando válidos', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ tipo: 'forro' }] })
      .mockResolvedValueOnce({ rows: [{ id: 2, dados_confeccao: { tecidoForro: 'Microfibra branca' }, status: 'em_andamento' }] });

    const dados = { tecidoForro: 'Microfibra branca', larguraForro: '3,00', forroCosturado: 'SEPARADO' };
    const result = await svc.salvarDadosConfeccao(2, 3, dados);

    expect(result.status).toBe('em_andamento');
  });

  test('lança erro 400 se tecido do forro não for informado', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ tipo: 'forro' }] });
    const dados = { tecidoForro: '', larguraForro: '3,00', forroCosturado: 'SEPARADO' };
    await expect(svc.salvarDadosConfeccao(2, 3, dados)).rejects.toThrow('Tecido do forro');
  });

  test('lança erro 404 quando OS não existe', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(svc.salvarDadosConfeccao(999, 2, {})).rejects.toMatchObject({ status: 404 });
  });
});

describe('salvarDadosConferenciaConsultoras', () => {
  test('salva dados de conferência consultoras de cortina quando válidos', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ tipo: 'cortina' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, dados_conferencia_consultoras: { larguraTrilho: '4,92' }, status: 'em_andamento' }] });

    const dados = { larguraTrilho: '4,92', tipoWave: 'G', espacador: '7,00', abertura: 'SEM ABERTURA', feitaPor: 'POR ALTURA' };
    const result = await svc.salvarDadosConferenciaConsultoras(1, 2, dados);

    expect(db.query).toHaveBeenNthCalledWith(2,
      expect.stringContaining('dados_conferencia_consultoras = $1'),
      [JSON.stringify(dados), 2, 1]
    );
    expect(result.status).toBe('em_andamento');
  });

  test('lança erro 400 se largura do trilho for inválida para cortina', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ tipo: 'cortina' }] });
    const dados = { larguraTrilho: '0', tipoWave: 'G', espacador: '7,00', abertura: 'SEM ABERTURA', feitaPor: 'POR ALTURA' };
    await expect(svc.salvarDadosConferenciaConsultoras(1, 2, dados)).rejects.toThrow('trilho');
  });

  test('salva dados de conferência consultoras de forro quando válidos', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ tipo: 'forro' }] })
      .mockResolvedValueOnce({ rows: [{ id: 2, dados_conferencia_consultoras: { tecidoForro: 'Microfibra branca' }, status: 'em_andamento' }] });

    const dados = { tecidoForro: 'Microfibra branca', larguraForro: '3,00', forroCosturado: 'SEPARADO' };
    const result = await svc.salvarDadosConferenciaConsultoras(2, 3, dados);

    expect(result.status).toBe('em_andamento');
  });

  test('lança erro 404 quando OS não existe', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(svc.salvarDadosConferenciaConsultoras(999, 2, {})).rejects.toMatchObject({ status: 404 });
  });

  test('salva ficha de persiana (manual) e sincroniza pedido_itens em transação', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ tipo: 'persiana', pedido_item_id: 7 }] }) // SELECT
      .mockResolvedValueOnce({ rows: [] })                                          // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 3, dados_conferencia_consultoras: { modelo: 'Rolo / Rollo', tubo: '38mm' }, status: 'em_andamento' }] }) // UPDATE ordem_servico
      .mockResolvedValueOnce({ rows: [] })                                          // UPDATE pedido_itens
      .mockResolvedValueOnce({ rows: [] });                                         // COMMIT

    const dados = { modelo: 'Rolo / Rollo', tubo: '38mm', bando: null, acionamento: 'manual', tecido: 'Drumis', largMax: '', modeloControle: '', modeloMotor: '', acessorios: [], qtdMotor: '', ordem: '' };
    const result = await svc.salvarDadosConferenciaConsultoras(3, 1, dados);

    expect(result.status).toBe('em_andamento');
    expect(db.query).toHaveBeenCalledTimes(5);
    expect(db.query).toHaveBeenNthCalledWith(2, 'BEGIN');
    expect(db.query).toHaveBeenNthCalledWith(4,
      expect.stringContaining('UPDATE pedido_itens'),
      ['Rolo / Rollo', JSON.stringify({ tubo: '38mm', bando: null }), 7]
    );
    expect(db.query).toHaveBeenNthCalledWith(5, 'COMMIT');
  });

  test('salva ficha de persiana (motorizado com qtdMotor)', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ tipo: 'persiana', pedido_item_id: 8 }] }) // SELECT
      .mockResolvedValueOnce({ rows: [] })                                          // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 4, dados_conferencia_consultoras: { modelo: 'Meliade', tubo: '30mm', acionamento: 'motorizado', qtdMotor: '2' }, status: 'em_andamento' }] }) // UPDATE ordem_servico
      .mockResolvedValueOnce({ rows: [] })                                          // UPDATE pedido_itens
      .mockResolvedValueOnce({ rows: [] });                                         // COMMIT

    const dados = { modelo: 'Meliade', tubo: '30mm', bando: '', acionamento: 'motorizado', qtdMotor: '2', tecido: '', largMax: '', modeloControle: '', modeloMotor: '', acessorios: [], ordem: '' };
    const result = await svc.salvarDadosConferenciaConsultoras(4, 1, dados);

    expect(result.status).toBe('em_andamento');
    expect(db.query).toHaveBeenCalledTimes(5);
    expect(db.query).toHaveBeenNthCalledWith(2, 'BEGIN');
    expect(db.query).toHaveBeenNthCalledWith(5, 'COMMIT');
  });

  test('lança erro 500 quando persiana não tem pedido_item_id', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ tipo: 'persiana', pedido_item_id: null }] });

    const dados = { modelo: 'Rolo / Rollo', tubo: '38mm', bando: null, acionamento: 'manual', tecido: '', largMax: '', modeloControle: '', modeloMotor: '', acessorios: [], qtdMotor: '', ordem: '' };
    await expect(
      svc.salvarDadosConferenciaConsultoras(7, 1, dados)
    ).rejects.toMatchObject({ status: 500, message: expect.stringContaining('pedido_item_id') });
  });

  test('executa ROLLBACK quando UPDATE pedido_itens falha na persiana', async () => {
    const dbError = new Error('DB error');
    db.query
      .mockResolvedValueOnce({ rows: [{ tipo: 'persiana', pedido_item_id: 7 }] }) // SELECT
      .mockResolvedValueOnce({ rows: [] })                                          // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 3, status: 'em_andamento' }] })       // UPDATE ordem_servico
      .mockRejectedValueOnce(dbError)                                               // UPDATE pedido_itens — falha
      .mockResolvedValueOnce({ rows: [] });                                         // ROLLBACK

    const dados = { modelo: 'Rolo / Rollo', tubo: '38mm', bando: null, acionamento: 'manual', tecido: '', largMax: '', modeloControle: '', modeloMotor: '', acessorios: [], qtdMotor: '', ordem: '' };
    await expect(svc.salvarDadosConferenciaConsultoras(3, 1, dados)).rejects.toThrow('DB error');

    expect(db.query).toHaveBeenNthCalledWith(5, 'ROLLBACK');
  });

  test('lança 400 quando modelo ou tubo faltando para persiana', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ tipo: 'persiana', pedido_item_id: 9 }] });

    await expect(
      svc.salvarDadosConferenciaConsultoras(5, 1, { modelo: '', tubo: '', acionamento: 'manual' })
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('tubo') });
  });

  test('lança 400 quando motorizada sem qtdMotor para persiana', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ tipo: 'persiana', pedido_item_id: 10 }] });

    await expect(
      svc.salvarDadosConferenciaConsultoras(6, 1, { modelo: 'Meliade', tubo: '30mm', acionamento: 'motorizado', qtdMotor: '' })
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('motor') });
  });
});

describe('salvarDadosTecnicos', () => {
  const validData = {
    largura: '4.20', altura_esq: '3.00', altura_meio: '3.00', altura_dir: '3.00',
    responsavel_conferencia: 'João Conf', data_conferencia: '2026-05-26',
    assinatura_tecnico: 'data:image/png;base64,foo'
  };

  test('salva com sucesso quando ficha de confecção já está preenchida e atendimento está em andamento', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ dados_conferencia_consultoras: { larguraTrilho: 4.92 }, pedido_item_id: 10 }] })
      .mockResolvedValueOnce({ rows: [{ status: 'andamento' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, dados_tecnicos: validData, status: 'em_andamento' }] });

    const result = await svc.salvarDadosTecnicos(1, 2, validData);
    expect(db.query).toHaveBeenNthCalledWith(3,
      expect.stringContaining('dados_tecnicos = $1'),
      [JSON.stringify(validData), 2, 1]
    );
    expect(result.status).toBe('em_andamento');
  });

  test('lança erro 400 quando a ficha de confecção ainda não foi preenchida', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ dados_conferencia_consultoras: null, pedido_item_id: 10 }] });
    await expect(svc.salvarDadosTecnicos(1, 2, validData)).rejects.toMatchObject({ status: 400 });
  });

  test('lança erro 404 quando OS não existe', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(svc.salvarDadosTecnicos(999, 2, validData)).rejects.toMatchObject({ status: 404 });
  });

  test('lança erro 400 quando não há agendamento de conferência ativo para o item', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ dados_conferencia_consultoras: { larguraTrilho: 4.92 }, pedido_item_id: 10 }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(svc.salvarDadosTecnicos(1, 2, validData)).rejects.toMatchObject({ status: 400, message: expect.stringContaining('iniciado') });
  });

  test('lança erro 400 quando o atendimento de conferência ainda não foi iniciado (status agendado)', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ dados_conferencia_consultoras: { larguraTrilho: 4.92 }, pedido_item_id: 10 }] })
      .mockResolvedValueOnce({ rows: [{ status: 'agendado' }] });
    await expect(svc.salvarDadosTecnicos(1, 2, validData)).rejects.toMatchObject({ status: 400, message: expect.stringContaining('iniciado') });
  });

  test('lança erro se largura técnica for inválida', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ dados_conferencia_consultoras: { larguraTrilho: 4.92 }, pedido_item_id: 10 }] })
      .mockResolvedValueOnce({ rows: [{ status: 'andamento' }] });
    const data = { ...validData, largura: '0' };
    await expect(svc.salvarDadosTecnicos(1, 2, data)).rejects.toThrow('largura');
  });

  test('lança erro se altura esquerda for inválida', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ dados_conferencia_consultoras: { larguraTrilho: 4.92 }, pedido_item_id: 10 }] })
      .mockResolvedValueOnce({ rows: [{ status: 'andamento' }] });
    const data = { ...validData, altura_esq: null };
    await expect(svc.salvarDadosTecnicos(1, 2, data)).rejects.toThrow('esquerda');
  });

  test('lança erro se responsável não for preenchido', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ dados_conferencia_consultoras: { larguraTrilho: 4.92 }, pedido_item_id: 10 }] })
      .mockResolvedValueOnce({ rows: [{ status: 'andamento' }] });
    const data = { ...validData, responsavel_conferencia: '' };
    await expect(svc.salvarDadosTecnicos(1, 2, data)).rejects.toThrow('responsável');
  });

  test('lança erro se assinatura do técnico não for fornecida', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ dados_conferencia_consultoras: { larguraTrilho: 4.92 }, pedido_item_id: 10 }] })
      .mockResolvedValueOnce({ rows: [{ status: 'andamento' }] });
    const data = { ...validData, assinatura_tecnico: '' };
    await expect(svc.salvarDadosTecnicos(1, 2, data)).rejects.toThrow('Assinatura');
  });
});

describe('buscarLarguraTecidoConhecida', () => {
  test('retorna a largura salva quando o nome bate ignorando maiúsculas/espaços', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ largura: '3,30' }] });

    const result = await svc.buscarLarguraTecidoConhecida('  ado016 ', 1);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("lower(trim(os.dados_confeccao->>'nomeTecido'))"),
      [1, 'ado016']
    );
    expect(result).toBe('3,30');
  });

  test('retorna null quando não encontra nenhum registro', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const result = await svc.buscarLarguraTecidoConhecida('ADO999', 1);

    expect(result).toBeNull();
  });

  test('retorna null sem consultar o banco quando o nome é vazio ou só espaços', async () => {
    const result = await svc.buscarLarguraTecidoConhecida('   ', 1);

    expect(result).toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('listarItensMesmoAmbiente', () => {
  test('retorna itens do mesmo pedido e ambiente, excluindo o próprio item', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 8, descricao: 'Cortina Blackout', cor: 'Branca', categoria_nome: 'Cortina' }],
    });

    const rows = await svc.listarItensMesmoAmbiente(2, 1);

    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('pi2.id <> pi.id'), [2, 1]);
    expect(rows).toEqual([{ id: 8, descricao: 'Cortina Blackout', cor: 'Branca', categoria_nome: 'Cortina' }]);
  });

  test('retorna lista vazia quando não há outros itens no ambiente', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const rows = await svc.listarItensMesmoAmbiente(2, 1);
    expect(rows).toEqual([]);
  });
});

