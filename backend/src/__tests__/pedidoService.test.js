jest.mock('../database/db', () => ({ query: jest.fn(), connect: jest.fn() }));
const db = require('../database/db');
const svc = require('../services/pedidoService');
jest.mock('../services/vinculoAutomaticoService');
const vinculoAutoSvc = require('../services/vinculoAutomaticoService');

afterEach(() => jest.clearAllMocks());

describe('buscar (montarPedido)', () => {
  test('inclui vinculos nos itens', async () => {
    const pedidoRow = {
      id: 1, empresa_id: 10, status: 'pendente',
      numero_origem: null, numero_sequencial: 1,
      cliente_nome: 'Ana', cliente_telefone: null,
      consultor_nome: null, arquiteto_nome: null,
      tem_anexo_pdf: false,
    };
    const itensRows = [
      { id: 10, pedido_id: 1, descricao: 'Cortina Wave', ordem: 0, os_id: null, os_status: null },
      { id: 11, pedido_id: 1, descricao: 'Trilho Wave',  ordem: 1, os_id: null, os_status: null },
    ];
    const vinculosRows = [
      { item_id: 11, item_vinculado_id: 10, tipo_vinculo: 'acessorio' },
    ];

    db.query
      .mockResolvedValueOnce({ rows: [pedidoRow] })   // SELECT pedidos
      .mockResolvedValueOnce({ rows: itensRows })      // SELECT pedido_itens
      .mockResolvedValueOnce({ rows: [] })             // SELECT pedido_pagamentos
      .mockResolvedValueOnce({ rows: vinculosRows });  // SELECT pedido_item_vinculos

    const result = await svc.buscar(1, 10);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('pedido_item_vinculos'),
      [[10, 11]]
    );
    expect(result.itens).toHaveLength(2);
    expect(result.itens[0].vinculos).toEqual([]);
    expect(result.itens[1].vinculos).toEqual([
      { item_vinculado_id: 10, tipo_vinculo: 'acessorio' },
    ]);
  });

  test('retorna vinculos vazio quando nao ha vinculos', async () => {
    const pedidoRow = {
      id: 2, empresa_id: 10, status: 'pendente',
      numero_origem: null, numero_sequencial: 2,
      cliente_nome: null, cliente_telefone: null,
      consultor_nome: null, arquiteto_nome: null,
      tem_anexo_pdf: false,
    };
    db.query
      .mockResolvedValueOnce({ rows: [pedidoRow] })
      .mockResolvedValueOnce({ rows: [{ id: 20, pedido_id: 2, descricao: 'Persiana', ordem: 0, os_id: null, os_status: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await svc.buscar(2, 10);

    expect(result.itens[0].vinculos).toEqual([]);
  });

  test('filtra apenas itens-pai (item_pai_id IS NULL)', async () => {
    const pedidoRow = {
      id: 3, empresa_id: 10, status: 'pendente',
      numero_origem: null, numero_sequencial: 3,
      cliente_nome: null, cliente_telefone: null,
      consultor_nome: null, arquiteto_nome: null,
      tem_anexo_pdf: false,
    };
    db.query
      .mockResolvedValueOnce({ rows: [pedidoRow] }) // SELECT pedidos
      .mockResolvedValueOnce({ rows: [] })          // SELECT pedido_itens
      .mockResolvedValueOnce({ rows: [] });         // SELECT pedido_pagamentos
      // (sem itens, montarPedido nao chega a consultar pedido_item_vinculos)

    await svc.buscar(3, 10);

    expect(db.query.mock.calls[1][0]).toContain('item_pai_id IS NULL');
  });
});

describe('atualizar — _salvarItens não deleta itens filhos (expandidos)', () => {
  test('exclui filhos da query de itens existentes, mesmo que não venham no payload', async () => {
    const pedidoAntes = {
      id: 7, empresa_id: 10, status: 'pendente', itens: [], pagamentos: [],
    };
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 7, empresa_id: 10, status: 'pendente' }] }) // montarPedido: pedidos
      .mockResolvedValueOnce({ rows: [] }) // montarPedido: itens
      .mockResolvedValueOnce({ rows: [] }); // montarPedido: pagamentos

    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 7 }] }) // UPDATE pedidos
      .mockResolvedValueOnce({ rows: [{ id: 40 }] }) // _salvarItens: SELECT existingIds (só pais)
      .mockResolvedValueOnce({ rows: [] }) // _salvarItens: UPDATE item 40
      .mockResolvedValueOnce({ rows: [] }) // _salvarPagamentos: DELETE
      .mockResolvedValueOnce({ rows: [] }); // _verificarEtapa1 ou próxima query
    db.connect.mockResolvedValueOnce(client);

    await svc.atualizar(7, 10, { itens: [{ id: 40, descricao: 'Persiana Sala', quantidade: 2 }] }, 1)
      .catch(() => {}); // tolera erro em passos posteriores não mockados neste teste focado

    const selectExisting = client.query.mock.calls.find((c) => c[0].includes('SELECT id FROM pedido_itens'));
    expect(selectExisting[0]).toContain('item_pai_id IS NULL');
  });
});

describe('_verificarEtapa1', () => {
  function makeFakeClient(respostas = []) {
    const client = { query: jest.fn() };
    respostas.forEach(r => client.query.mockResolvedValueOnce(r));
    return client;
  }

  test('retorna false quando nao ha anexo PDF', async () => {
    const client = makeFakeClient([
      { rows: [] }, // pedido_anexos
      { rows: [{ id: 1, categoria_id: 5, sem_vinculo: false, vinculavel: false }] }, // pedido_itens
    ]);
    const result = await svc._verificarEtapa1(client, 1);
    expect(result).toBe(false);
  });

  test('retorna false quando pedido nao tem itens', async () => {
    const client = makeFakeClient([
      { rows: [{}] }, // pedido_anexos
      { rows: [] },   // pedido_itens
    ]);
    const result = await svc._verificarEtapa1(client, 1);
    expect(result).toBe(false);
  });

  test('retorna false quando algum item nao tem categoria', async () => {
    const client = makeFakeClient([
      { rows: [{}] },
      { rows: [{ id: 1, categoria_id: null, sem_vinculo: false, vinculavel: false }] },
    ]);
    const result = await svc._verificarEtapa1(client, 1);
    expect(result).toBe(false);
  });

  test('retorna true quando nenhum item e de categoria vinculavel', async () => {
    const client = makeFakeClient([
      { rows: [{}] },
      { rows: [{ id: 1, categoria_id: 5, sem_vinculo: false, vinculavel: false }] },
    ]);
    const result = await svc._verificarEtapa1(client, 1);
    expect(result).toBe(true);
  });

  test('retorna false quando item vinculavel nao tem vinculo nem sem_vinculo', async () => {
    const client = makeFakeClient([
      { rows: [{}] },
      { rows: [{ id: 1, categoria_id: 5, sem_vinculo: false, vinculavel: true }] },
      { rows: [] }, // pedido_item_vinculos
    ]);
    const result = await svc._verificarEtapa1(client, 1);
    expect(result).toBe(false);
  });

  test('retorna true quando item vinculavel tem vinculo', async () => {
    const client = makeFakeClient([
      { rows: [{}] },
      { rows: [{ id: 1, categoria_id: 5, sem_vinculo: false, vinculavel: true }] },
      { rows: [{ item_id: 1 }] },
    ]);
    const result = await svc._verificarEtapa1(client, 1);
    expect(result).toBe(true);
  });

  test('retorna true quando item vinculavel esta marcado sem_vinculo', async () => {
    const client = makeFakeClient([
      { rows: [{}] },
      { rows: [{ id: 1, categoria_id: 5, sem_vinculo: true, vinculavel: true }] },
      { rows: [] },
    ]);
    const result = await svc._verificarEtapa1(client, 1);
    expect(result).toBe(true);
  });
});

// helper para criar cliente de transação mockado
function makeClient(respostas = []) {
  const client = { query: jest.fn(), release: jest.fn() };
  respostas.forEach(r => client.query.mockResolvedValueOnce(r));
  // resposta padrão para qualquer chamada extra
  client.query.mockResolvedValue({ rows: [] });
  return client;
}

describe('criar (nao mexe em pedido_item_vinculos)', () => {
  test('item_vinculado_idx legado nao gera DELETE/INSERT em pedido_item_vinculos', async () => {
    const fakeId = 99;
    db.query
      .mockResolvedValueOnce({ rows: [{ id: fakeId, empresa_id: 10, status: 'pendente', numero_origem: null, numero_sequencial: 1, cliente_nome: null, cliente_telefone: null, consultor_nome: null, arquiteto_nome: null, tem_anexo_pdf: false }] })
      .mockResolvedValueOnce({ rows: [] })   // SELECT pedido_itens (vazio)
      .mockResolvedValueOnce({ rows: [] });  // SELECT pedido_pagamentos

    const client = makeClient([
      { rows: [] },              // BEGIN
      { rows: [{ seq: 1 }] },    // nextval
      { rows: [{ id: fakeId }] }, // INSERT pedidos
      { rows: [] },              // SELECT existing ids
      { rows: [{ id: 10 }] },    // INSERT item 0 (cortina)
      { rows: [{ id: 11 }] },    // INSERT item 1 (trilho)
      { rows: [] },              // DELETE pagamentos
      { rows: [] },              // COMMIT
    ]);
    db.connect.mockResolvedValue(client);

    const dados = {
      status: 'pendente',
      itens: [
        { descricao: 'Cortina Wave', quantidade: 1, item_vinculado_idx: null },
        { descricao: 'Trilho Wave',  quantidade: 1, item_vinculado_idx: 0 },
      ],
      pagamentos: [],
    };

    await svc.criar(10, 99, dados);

    const vinculoCall = client.query.mock.calls.find(
      call => typeof call[0] === 'string' && call[0].includes('pedido_item_vinculos')
    );
    expect(vinculoCall).toBeUndefined();
  });
});

describe('importar', () => {
  afterEach(() => jest.clearAllMocks());

  function mockCriarPedidoNovo() {
    const pedidoRow = {
      id: 50, empresa_id: 10, status: 'pendente',
      numero_origem: null, numero_sequencial: 5,
      cliente_nome: null, cliente_telefone: null,
      consultor_nome: null, arquiteto_nome: null,
      tem_anexo_pdf: false,
    };

    db.query
      .mockResolvedValueOnce({ rows: [pedidoRow] }) // montarPedido: SELECT pedidos
      .mockResolvedValueOnce({ rows: [] })          // montarPedido: SELECT pedido_itens
      .mockResolvedValueOnce({ rows: [] })          // montarPedido: SELECT pedido_pagamentos
      .mockResolvedValueOnce({ rows: [] });         // INSERT pedido_auditoria (importacao)

    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [] })           // BEGIN
      .mockResolvedValueOnce({ rows: [{ seq: 5 }] }) // nextval
      .mockResolvedValueOnce({ rows: [{ id: 50 }] }) // INSERT pedidos
      .mockResolvedValueOnce({ rows: [] })           // SELECT existing item ids
      .mockResolvedValueOnce({ rows: [] })           // DELETE pedido_pagamentos
      .mockResolvedValueOnce({ rows: [] });          // COMMIT
    db.connect.mockResolvedValue(client);
  }

  test('chama vinculoAutomaticoService.processarPedido apos criar pedido novo', async () => {
    mockCriarPedidoNovo();
    vinculoAutoSvc.processarPedido.mockResolvedValue();

    const pedido = await svc.importar(10, 99, { status: 'pendente', itens: [], pagamentos: [] });

    expect(pedido.id).toBe(50);
    expect(vinculoAutoSvc.processarPedido).toHaveBeenCalledWith(50, 10, 99);
  });

  test('nao falha a importacao quando processarPedido rejeita', async () => {
    mockCriarPedidoNovo();
    vinculoAutoSvc.processarPedido.mockRejectedValue(new Error('boom'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const pedido = await svc.importar(10, 99, { status: 'pendente', itens: [], pagamentos: [] });

    expect(pedido.id).toBe(50);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  test('resolve arquiteto_id pelo nome do escritorio quando nao acha pelo nome da pessoa', async () => {
    const pedidoRow = {
      id: 51, empresa_id: 10, status: 'pendente',
      numero_origem: null, numero_sequencial: 6,
      cliente_nome: null, cliente_telefone: null,
      consultor_nome: null, arquiteto_nome: 'Fulana da Silva', arquiteto_id: 42,
      tem_anexo_pdf: false,
    };

    db.query
      .mockResolvedValueOnce({ rows: [] })            // arquiteto por nome: nao encontrado
      .mockResolvedValueOnce({ rows: [{ id: 42 }] })  // arquiteto por escritorio: encontrado
      .mockResolvedValueOnce({ rows: [pedidoRow] })   // montarPedido: SELECT pedidos
      .mockResolvedValueOnce({ rows: [] })            // montarPedido: SELECT pedido_itens
      .mockResolvedValueOnce({ rows: [] })            // montarPedido: SELECT pedido_pagamentos
      .mockResolvedValueOnce({ rows: [] });           // INSERT pedido_auditoria (importacao)

    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [] })           // BEGIN
      .mockResolvedValueOnce({ rows: [{ seq: 6 }] }) // nextval
      .mockResolvedValueOnce({ rows: [{ id: 51 }] }) // INSERT pedidos
      .mockResolvedValueOnce({ rows: [] })           // SELECT existing item ids
      .mockResolvedValueOnce({ rows: [] })           // DELETE pedido_pagamentos
      .mockResolvedValueOnce({ rows: [] });          // COMMIT
    db.connect.mockResolvedValue(client);
    vinculoAutoSvc.processarPedido.mockResolvedValue();

    const pedido = await svc.importar(10, 99, {
      status: 'pendente', itens: [], pagamentos: [],
      arquiteto_nome: 'Estudio Exemplo',
    });

    expect(pedido.arquiteto_id).toBe(42);
  });
});

jest.mock('../services/regiaoGeoService', () => ({
  registrarRegiaoSeNecessaria: jest.fn().mockResolvedValue(undefined),
}));
const regiaoGeoSvc = require('../services/regiaoGeoService');

describe('registrarRegiaoSeNecessaria e chamado ao salvar pedido', () => {
  test('criar: chama registrarRegiaoSeNecessaria com bairro/cidade/estado do pedido', async () => {
    const fakeId = 77;
    db.query
      .mockResolvedValueOnce({ rows: [{ id: fakeId, empresa_id: 10, status: 'pendente', numero_origem: null, numero_sequencial: 1, cliente_nome: null, cliente_telefone: null, consultor_nome: null, arquiteto_nome: null, tem_anexo_pdf: false }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const client = makeClient([
      { rows: [] },               // BEGIN
      { rows: [{ seq: 1 }] },     // nextval
      { rows: [{ id: fakeId }] }, // INSERT pedidos
      { rows: [] },               // SELECT existing ids
      { rows: [] },               // DELETE pagamentos
      { rows: [] },               // COMMIT
    ]);
    db.connect.mockResolvedValue(client);
    regiaoGeoSvc.registrarRegiaoSeNecessaria.mockResolvedValue();

    await svc.criar(10, 99, {
      status: 'pendente', bairro: 'Batel', cidade: 'Curitiba', estado: 'PR',
      itens: [], pagamentos: [],
    });

    expect(regiaoGeoSvc.registrarRegiaoSeNecessaria).toHaveBeenCalledWith({
      empresaId: 10, bairro: 'Batel', cidade: 'Curitiba', estado: 'PR',
    });
  });

  test('criar: erro em registrarRegiaoSeNecessaria nao derruba a criacao do pedido', async () => {
    const fakeId = 78;
    db.query
      .mockResolvedValueOnce({ rows: [{ id: fakeId, empresa_id: 10, status: 'pendente', numero_origem: null, numero_sequencial: 1, cliente_nome: null, cliente_telefone: null, consultor_nome: null, arquiteto_nome: null, tem_anexo_pdf: false }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const client = makeClient([
      { rows: [] }, { rows: [{ seq: 1 }] }, { rows: [{ id: fakeId }] },
      { rows: [] }, { rows: [] }, { rows: [] },
    ]);
    db.connect.mockResolvedValue(client);
    regiaoGeoSvc.registrarRegiaoSeNecessaria.mockRejectedValue(new Error('geocod falhou'));

    const pedido = await svc.criar(10, 99, { status: 'pendente', itens: [], pagamentos: [] });

    expect(pedido.id).toBe(fakeId);
  });
});
