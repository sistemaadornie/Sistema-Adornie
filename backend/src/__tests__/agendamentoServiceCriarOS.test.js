const svc = require('../services/agendamentoService');

function criarClienteFake() {
  return { query: jest.fn() };
}

describe('criarOSSeNaoExistir', () => {
  test('cria OS com o tipo da categoria quando a categoria tem tipo_confeccao', async () => {
    const client = criarClienteFake();
    client.query
      .mockResolvedValueOnce({ rows: [{ tipo_confeccao: 'cortina' }] }) // categoria
      .mockResolvedValueOnce({ rows: [] }) // já existe? não
      .mockResolvedValueOnce({ rows: [] }); // insert

    await svc.criarOSSeNaoExistir([{ pedido_item_id: 5 }], client);

    expect(client.query).toHaveBeenNthCalledWith(3,
      expect.stringContaining('INSERT INTO ordem_servico'),
      [5, 'cortina']
    );
  });

  test('não cria OS quando a categoria não tem tipo_confeccao', async () => {
    const client = criarClienteFake();
    client.query.mockResolvedValueOnce({ rows: [{ tipo_confeccao: null }] });

    await svc.criarOSSeNaoExistir([{ pedido_item_id: 6 }], client);

    expect(client.query).toHaveBeenCalledTimes(1);
  });

  test('não duplica quando a OS já existe', async () => {
    const client = criarClienteFake();
    client.query
      .mockResolvedValueOnce({ rows: [{ tipo_confeccao: 'forro' }] })
      .mockResolvedValueOnce({ rows: [{ id: 99 }] });

    await svc.criarOSSeNaoExistir([{ pedido_item_id: 7 }], client);

    expect(client.query).toHaveBeenCalledTimes(2);
  });

  test('ignora item sem pedido_item_id', async () => {
    const client = criarClienteFake();
    await svc.criarOSSeNaoExistir([{ nome: 'item digitado à mão' }], client);
    expect(client.query).not.toHaveBeenCalled();
  });

  test('ignora lista vazia', async () => {
    const client = criarClienteFake();
    await svc.criarOSSeNaoExistir([], client);
    expect(client.query).not.toHaveBeenCalled();
  });
});
