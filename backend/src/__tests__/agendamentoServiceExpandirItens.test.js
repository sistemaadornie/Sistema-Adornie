// backend/src/__tests__/agendamentoServiceExpandirItens.test.js
const svc = require('../services/agendamentoService');

function criarClienteFake() {
  return { query: jest.fn() };
}

describe('expandirItensParaConferencia', () => {
  test('não expande quando a categoria não exige conferência', async () => {
    const client = criarClienteFake();
    client.query.mockResolvedValueOnce({
      rows: [{ id: 5, quantidade: 2, item_pai_id: null, expandido: false, necessita_conferencia: false }],
    });

    const resultado = await svc.expandirItensParaConferencia([{ pedido_item_id: 5, nome: 'Cortina' }], client);

    expect(resultado).toEqual([{ pedido_item_id: 5, nome: 'Cortina' }]);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  test('não expande quando quantidade <= 1', async () => {
    const client = criarClienteFake();
    client.query.mockResolvedValueOnce({
      rows: [{ id: 6, quantidade: 1, item_pai_id: null, expandido: false, necessita_conferencia: true }],
    });

    const resultado = await svc.expandirItensParaConferencia([{ pedido_item_id: 6 }], client);

    expect(resultado).toEqual([{ pedido_item_id: 6 }]);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  test('não expande item que já é filho (item_pai_id preenchido)', async () => {
    const client = criarClienteFake();
    client.query.mockResolvedValueOnce({
      rows: [{ id: 61, quantidade: 1, item_pai_id: 6, expandido: false, necessita_conferencia: true }],
    });

    const resultado = await svc.expandirItensParaConferencia([{ pedido_item_id: 61 }], client);

    expect(resultado).toEqual([{ pedido_item_id: 61 }]);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  test('cria N filhos quando quantidade > 1 e categoria exige conferência', async () => {
    const client = criarClienteFake();
    client.query
      .mockResolvedValueOnce({
        rows: [{ id: 5, quantidade: 2, item_pai_id: null, expandido: false, necessita_conferencia: true }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 101, descricao: 'Persiana Sala' }] })
      .mockResolvedValueOnce({ rows: [{ id: 102, descricao: 'Persiana Sala' }] })
      .mockResolvedValueOnce({ rows: [] }); // UPDATE expandido

    const resultado = await svc.expandirItensParaConferencia([{ pedido_item_id: 5, nome: 'Persiana Sala' }], client);

    expect(resultado).toEqual([
      { pedido_item_id: 101, nome: 'Persiana Sala' },
      { pedido_item_id: 102, nome: 'Persiana Sala' },
    ]);
    expect(client.query).toHaveBeenCalledTimes(4);
    expect(client.query.mock.calls[1][0]).toContain('INSERT INTO pedido_itens');
    expect(client.query.mock.calls[1][1]).toEqual([5, 1, 2]);
    expect(client.query.mock.calls[2][1]).toEqual([5, 2, 2]);
    expect(client.query.mock.calls[3][0]).toContain('UPDATE pedido_itens SET expandido = true');
    expect(client.query.mock.calls[3][1]).toEqual([5]);
  });

  test('reaproveita filhos existentes quando já expandido (idempotente)', async () => {
    const client = criarClienteFake();
    client.query
      .mockResolvedValueOnce({
        rows: [{ id: 5, quantidade: 2, item_pai_id: null, expandido: true, necessita_conferencia: true }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 101, descricao: 'Persiana Sala' }, { id: 102, descricao: 'Persiana Sala' }],
      });

    const resultado = await svc.expandirItensParaConferencia([{ pedido_item_id: 5 }], client);

    expect(resultado).toEqual([
      { pedido_item_id: 101, nome: 'Persiana Sala' },
      { pedido_item_id: 102, nome: 'Persiana Sala' },
    ]);
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  test('ignora item sem pedido_item_id', async () => {
    const client = criarClienteFake();
    const resultado = await svc.expandirItensParaConferencia([{ nome: 'item digitado à mão' }], client);
    expect(resultado).toEqual([{ nome: 'item digitado à mão' }]);
    expect(client.query).not.toHaveBeenCalled();
  });

  test('lista vazia retorna vazio', async () => {
    const client = criarClienteFake();
    const resultado = await svc.expandirItensParaConferencia([], client);
    expect(resultado).toEqual([]);
    expect(client.query).not.toHaveBeenCalled();
  });
});
