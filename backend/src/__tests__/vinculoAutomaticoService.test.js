jest.mock('../database/db', () => ({ query: jest.fn(), connect: jest.fn() }));
const db = require('../database/db');

const { encontrarPares, processarPedido } = require('../services/vinculoAutomaticoService');

function item(overrides) {
  return {
    id: 1,
    ambiente: 'Sala',
    largura: '1.5000',
    vinculavel: false,
    recebe_vinculos: false,
    ja_vinculado: false,
    ...overrides,
  };
}

describe('encontrarPares', () => {
  test('1 acessorio + 1 principal, mesmo ambiente/largura -> 1 par', () => {
    const itens = [
      item({ id: 1, vinculavel: true }),
      item({ id: 2, recebe_vinculos: true }),
    ];
    expect(encontrarPares(itens)).toEqual([{ acessorioId: 1, principalId: 2 }]);
  });

  test('larguras diferentes -> nenhum par', () => {
    const itens = [
      item({ id: 1, vinculavel: true, largura: '1.5000' }),
      item({ id: 2, recebe_vinculos: true, largura: '2.0000' }),
    ];
    expect(encontrarPares(itens)).toEqual([]);
  });

  test('ambientes diferentes -> nenhum par', () => {
    const itens = [
      item({ id: 1, vinculavel: true, ambiente: 'Sala' }),
      item({ id: 2, recebe_vinculos: true, ambiente: 'Quarto' }),
    ];
    expect(encontrarPares(itens)).toEqual([]);
  });

  test('2 acessorios + 1 principal, mesma largura -> nenhum par (ambiguo)', () => {
    const itens = [
      item({ id: 1, vinculavel: true }),
      item({ id: 2, vinculavel: true }),
      item({ id: 3, recebe_vinculos: true }),
    ];
    expect(encontrarPares(itens)).toEqual([]);
  });

  test('1 acessorio + 2 principais, mesma largura -> nenhum par (ambiguo)', () => {
    const itens = [
      item({ id: 1, vinculavel: true }),
      item({ id: 2, recebe_vinculos: true }),
      item({ id: 3, recebe_vinculos: true }),
    ];
    expect(encontrarPares(itens)).toEqual([]);
  });

  test('item ja vinculado nao entra como acessorio candidato', () => {
    const itens = [
      item({ id: 1, vinculavel: true, ja_vinculado: true }),
      item({ id: 2, recebe_vinculos: true }),
    ];
    expect(encontrarPares(itens)).toEqual([]);
  });

  test('ambiente nulo -> item ignorado', () => {
    const itens = [
      item({ id: 1, vinculavel: true, ambiente: null }),
      item({ id: 2, recebe_vinculos: true, ambiente: null }),
    ];
    expect(encontrarPares(itens)).toEqual([]);
  });

  test('ambiente vazio -> item ignorado', () => {
    const itens = [
      item({ id: 1, vinculavel: true, ambiente: '' }),
      item({ id: 2, recebe_vinculos: true, ambiente: '' }),
    ];
    expect(encontrarPares(itens)).toEqual([]);
  });

  test('largura nula -> item ignorado', () => {
    const itens = [
      item({ id: 1, vinculavel: true, largura: null }),
      item({ id: 2, recebe_vinculos: true, largura: null }),
    ];
    expect(encontrarPares(itens)).toEqual([]);
  });

  test('multiplos ambientes, cada um com par valido -> 2 pares', () => {
    const itens = [
      item({ id: 1, ambiente: 'Sala',   largura: '1.5000', vinculavel: true }),
      item({ id: 2, ambiente: 'Sala',   largura: '1.5000', recebe_vinculos: true }),
      item({ id: 3, ambiente: 'Quarto', largura: '2.2000', vinculavel: true }),
      item({ id: 4, ambiente: 'Quarto', largura: '2.2000', recebe_vinculos: true }),
    ];
    expect(encontrarPares(itens)).toEqual([
      { acessorioId: 1, principalId: 2 },
      { acessorioId: 3, principalId: 4 },
    ]);
  });
});

describe('processarPedido', () => {
  afterEach(() => jest.clearAllMocks());

  test('cria vinculo, marca sem_vinculo=false e registra auditoria para 1 par', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: 11,
              ambiente: 'Sala',
              largura: '1.5000',
              descricao: 'Trilho Wave',
              vinculavel: true,
              recebe_vinculos: false,
              ja_vinculado: false,
            },
            {
              id: 10,
              ambiente: 'Sala',
              largura: '1.5000',
              descricao: 'Cortina Wave',
              vinculavel: false,
              recebe_vinculos: true,
              ja_vinculado: false,
            },
          ],
        }) // SELECT itens
        .mockResolvedValueOnce(undefined) // INSERT pedido_item_vinculos
        .mockResolvedValueOnce(undefined) // UPDATE pedido_itens sem_vinculo
        .mockResolvedValueOnce(undefined) // INSERT pedido_auditoria
        .mockResolvedValueOnce(undefined), // COMMIT
      release: jest.fn(),
    };
    db.connect.mockResolvedValue(client);

    await processarPedido(1, 10, 99);

    expect(client.query.mock.calls[2][0]).toContain('INSERT INTO pedido_item_vinculos');
    expect(client.query.mock.calls[2][1]).toEqual([11, 10]);

    expect(client.query.mock.calls[3][0]).toContain('UPDATE pedido_itens');
    expect(client.query.mock.calls[3][1]).toEqual([11]);

    expect(client.query.mock.calls[4][0]).toContain('INSERT INTO pedido_auditoria');

    expect(client.query.mock.calls[5][0]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  test('pedido sem itens vinculaveis -> nenhuma escrita alem de BEGIN/SELECT/COMMIT', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: 20,
              ambiente: 'Sala',
              largura: '1.5000',
              descricao: 'Persiana Wave',
              vinculavel: false,
              recebe_vinculos: false,
              ja_vinculado: false,
            },
          ],
        }) // SELECT itens
        .mockResolvedValueOnce(undefined), // COMMIT
      release: jest.fn(),
    };
    db.connect.mockResolvedValue(client);

    await processarPedido(1, 10, 99);

    expect(client.query).toHaveBeenCalledTimes(3);
    expect(client.release).toHaveBeenCalled();
  });

  test('rollback e propaga erro quando a busca de itens falha', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockRejectedValueOnce(new Error('boom')) // SELECT itens falha
        .mockResolvedValueOnce(undefined), // ROLLBACK
      release: jest.fn(),
    };
    db.connect.mockResolvedValue(client);

    await expect(processarPedido(1, 10, 99)).rejects.toThrow('boom');

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
});
