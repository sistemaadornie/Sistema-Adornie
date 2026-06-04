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
