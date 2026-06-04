jest.mock('../database/db', () => ({ query: jest.fn(), connect: jest.fn() }));
const db = require('../database/db');
const svc = require('../services/pedidoService');

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
});

// helper para criar cliente de transação mockado
function makeClient(respostas = []) {
  const client = { query: jest.fn(), release: jest.fn() };
  respostas.forEach(r => client.query.mockResolvedValueOnce(r));
  // resposta padrão para qualquer chamada extra
  client.query.mockResolvedValue({ rows: [] });
  return client;
}

describe('criar (salva vinculos)', () => {
  test('insere em pedido_item_vinculos quando item_vinculado_idx esta definido', async () => {
    const fakeId = 99;
    // Sem cliente_id no payload → a validação de cliente é pulada (sem db.query extra)
    // db.query usado apenas por montarPedido após commit (itens retornado é vazio → sem 4ª chamada)
    db.query
      .mockResolvedValueOnce({ rows: [{ id: fakeId, empresa_id: 10, status: 'pendente', numero_origem: null, numero_sequencial: 1, cliente_nome: null, cliente_telefone: null, consultor_nome: null, arquiteto_nome: null, tem_anexo_pdf: false }] })
      .mockResolvedValueOnce({ rows: [] })   // SELECT pedido_itens (vazio)
      .mockResolvedValueOnce({ rows: [] });  // SELECT pedido_pagamentos

    const client = makeClient([
      { rows: [] },                           // BEGIN
      { rows: [{ seq: 1 }] },                // nextval
      { rows: [{ id: fakeId }] },            // INSERT pedidos
      { rows: [] },                           // SELECT existing ids
      { rows: [{ id: 10 }] },               // INSERT item 0 (cortina)
      { rows: [{ id: 11 }] },               // INSERT item 1 (trilho)
      { rows: [] },                           // DELETE pedido_item_vinculos
      { rows: [] },                           // INSERT vínculo trilho→cortina
      { rows: [] },                           // DELETE pagamentos
      { rows: [] },                           // COMMIT
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

    // Verifica INSERT em pedido_item_vinculos
    const insertVinculoCall = client.query.mock.calls.find(
      call => typeof call[0] === 'string' && call[0].includes('INSERT INTO pedido_item_vinculos')
    );
    expect(insertVinculoCall).toBeDefined();
    expect(insertVinculoCall[1]).toEqual([11, 10, 'acessorio']);
  });
});
