jest.mock('../database/db', () => ({ query: jest.fn() }));

const db  = require('../database/db');
const svc = require('../services/clienteService');

beforeEach(() => jest.clearAllMocks());

describe('listar — escopo por consultor', () => {
  test('COMERCIAL puro: filtra por consultor_id', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await svc.listar(10, null, ['COMERCIAL'], 5);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('c.consultor_id');
    expect(params).toContain(5);
  });

  test('OPERADOR_AGENDA: não filtra', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await svc.listar(10, null, ['OPERADOR_AGENDA'], 5);
    const [sql] = db.query.mock.calls[0];
    expect(sql).not.toContain('c.consultor_id =');
  });
});

describe('criar — grava consultor_id de quem criou', () => {
  test('passa criadoPorId pro INSERT', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })                 // INSERT
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })                 // montarCliente: SELECT cliente
      .mockResolvedValueOnce({ rows: [] });                         // montarCliente: SELECT enderecos
    await svc.criar(10, { nome: 'Cliente X' }, 5);
    const insertCall = db.query.mock.calls[0];
    expect(insertCall[0]).toContain('consultor_id');
    expect(insertCall[1]).toContain(5);
  });
});

describe('resolverCliente — grava consultor_id no cliente novo', () => {
  test('extras.criadoPorId vai pro INSERT quando cliente é criado', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })                          // match por nome: nenhum
      .mockResolvedValueOnce({ rows: [{ id: 2 }] });                 // INSERT novo cliente

    const resultado = await svc.resolverCliente(10, 'Cliente Novo', { criadoPorId: 7 });
    expect(resultado.criado).toBe(true);
    const insertCall = db.query.mock.calls[1];
    expect(insertCall[0]).toContain('consultor_id');
    expect(insertCall[1]).toContain(7);
  });
});
