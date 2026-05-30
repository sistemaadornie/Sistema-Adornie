jest.mock('../database/db', () => ({ query: jest.fn(), connect: jest.fn() }));
const db = require('../database/db');
const svc = require('../services/orcamentoService');

afterEach(() => jest.clearAllMocks());

function makeClient(respostas = []) {
  const client = { query: jest.fn(), release: jest.fn() };
  respostas.forEach(r => client.query.mockResolvedValueOnce(r));
  return client;
}

// ── listar ──────────────────────────────────────────────────────────────────

describe('listar', () => {
  test('retorna lista de orçamentos sem filtros', async () => {
    const fakeRows = [{ id: 1, numero: 'ORC-00001', status: 'novo', cliente_nome: 'Ana' }];
    db.query.mockResolvedValueOnce({ rows: fakeRows });

    const result = await svc.listar(10);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM orcamentos'),
      [10]
    );
    expect(result).toEqual(fakeRows);
  });

  test('filtra por status quando fornecido', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await svc.listar(10, { status: 'novo' });
    expect(db.query.mock.calls[0][1]).toContain('novo');
  });

  test('filtra por consultora_id quando fornecido', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await svc.listar(10, { consultora_id: 5 });
    expect(db.query.mock.calls[0][1]).toContain(5);
  });
});

// ── criar ────────────────────────────────────────────────────────────────────

describe('criar', () => {
  test('cria orçamento com itens em transação', async () => {
    const fakeOrc = { id: 42, numero: 'ORC-00001', status: 'novo' };
    const client = makeClient([
      { rows: [] },                        // BEGIN
      { rows: [{ seq: 1 }] },              // nextval
      { rows: [fakeOrc] },                 // INSERT orcamentos
      { rows: [] },                        // INSERT orcamento_itens (item 1)
      { rows: [] },                        // COMMIT
    ]);
    db.connect.mockResolvedValue(client);

    const dados = {
      cliente_id: 1,
      itens: [{ produto_id: 2, produto_nome: 'Persiana', ambiente: 'Sala', quantidade: 1, preco_unitario: '580,00' }],
    };
    const result = await svc.criar(10, 99, dados);

    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
    expect(result.id).toBe(42);
  });

  test('cria produto rascunho se produto_id ausente mas produto_nome preenchido', async () => {
    const fakeOrc = { id: 43, numero: 'ORC-00002', status: 'novo' };
    const client = makeClient([
      { rows: [] },              // BEGIN
      { rows: [{ seq: 2 }] },    // nextval
      { rows: [fakeOrc] },       // INSERT orcamentos
      { rows: [{ id: 77 }] },    // INSERT produtos (rascunho)
      { rows: [] },              // INSERT orcamento_itens
      { rows: [] },              // COMMIT
    ]);
    db.connect.mockResolvedValue(client);

    const dados = { itens: [{ produto_nome: 'Novo produto', ambiente: 'Quarto', quantidade: 1 }] };
    await svc.criar(10, 99, dados);

    const insertProdutoCall = client.query.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes('INSERT INTO produtos')
    );
    expect(insertProdutoCall).toBeTruthy();
    expect(insertProdutoCall[1]).toContain('Novo produto');
  });

  test('faz rollback se INSERT de item falhar', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [] })           // BEGIN
      .mockResolvedValueOnce({ rows: [{ seq: 1 }] }) // nextval
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })  // INSERT orcamentos
      .mockRejectedValueOnce(new Error("FK violation")); // INSERT itens falha
    db.connect.mockResolvedValue(client);

    await expect(svc.criar(10, 99, { itens: [{ produto_id: 1, quantidade: 1 }] }))
      .rejects.toThrow("FK violation");

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
});

// ── buscar ───────────────────────────────────────────────────────────────────

describe('buscar', () => {
  test('retorna null se orçamento não existe', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const result = await svc.buscar(999, 10);
    expect(result).toBeNull();
  });

  test('retorna orçamento com itens agrupados por ambiente', async () => {
    const fakeOrc = { id: 1, status: 'novo', cliente_nome: 'Ana' };
    db.query
      .mockResolvedValueOnce({ rows: [fakeOrc] })
      .mockResolvedValueOnce({ rows: [
        { id: 1, ambiente: 'Sala',    produto_nome: 'Persiana' },
        { id: 2, ambiente: 'Sala',    produto_nome: 'Cortina'  },
        { id: 3, ambiente: 'Quarto',  produto_nome: 'Persiana' },
      ]})
      .mockResolvedValueOnce({ rows: [] });

    const result = await svc.buscar(1, 10);

    expect(result.ambientes).toHaveLength(2);
    expect(result.ambientes[0].nome).toBe('Sala');
    expect(result.ambientes[0].itens).toHaveLength(2);
    expect(result.ambientes[1].nome).toBe('Quarto');
  });
});

// ── cancelar ─────────────────────────────────────────────────────────────────

describe('cancelar', () => {
  test('cancela orçamento novo com sucesso', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const result = await svc.cancelar(1, 10);
    expect(result.id).toBe(1);
    expect(db.query.mock.calls[0][0]).toContain("status='cancelado'");
  });

  test('lança erro se orçamento não encontrado ou já aprovado', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(svc.cancelar(999, 10)).rejects.toMatchObject({ status: 400 });
  });
});

// ── aprovar ───────────────────────────────────────────────────────────────────

describe('aprovar', () => {
  test('aprova orçamento e cria pedido', async () => {
    const fakeOrc = { id: 1, status: 'novo', cliente_id: 2, arquiteto_id: null, valor_total: 580 };
    const client = makeClient([
      { rows: [] },                           // BEGIN
      { rows: [fakeOrc] },                    // SELECT orcamento FOR UPDATE
      { rows: [] },                           // UPDATE status='aprovado'
      { rows: [{ seq: 1 }] },                 // nextval pedidos_numero_seq
      { rows: [{ id: 55 }] },                 // INSERT pedidos
      { rows: [{ id: 10, largura: 1.8, altura: 2.2, produto_nome: 'P', quantidade: 1 }] }, // SELECT itens
      { rows: [] },                           // INSERT pedido_itens
      { rows: [] },                           // COMMIT
    ]);
    db.connect.mockResolvedValue(client);

    const result = await svc.aprovar(1, 10, 99, { rua: 'Rua A', numero: '1' });

    expect(result).toEqual({ orcamento_id: 1, pedido_id: 55 });
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  test('lança erro se orçamento não é novo', async () => {
    const client = makeClient([
      { rows: [] },
      { rows: [{ id: 1, status: 'aprovado' }] },
    ]);
    db.connect.mockResolvedValue(client);

    await expect(svc.aprovar(1, 10, 99, {})).rejects.toMatchObject({ status: 400 });
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });
});
