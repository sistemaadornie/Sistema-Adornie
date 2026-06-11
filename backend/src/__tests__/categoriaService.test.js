jest.mock('../database/db', () => ({ query: jest.fn() }));
const db = require('../database/db');
const svc = require('../services/categoriaService');

afterEach(() => jest.clearAllMocks());

describe('listar', () => {
  test('inclui vinculavel e recebe_vinculos na query e no retorno', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1, nome: 'Trilhos', cor: '#000', ordem: 0, vinculavel: true, recebe_vinculos: false }],
    });
    const result = await svc.listar(10);
    expect(db.query.mock.calls[0][0]).toContain('vinculavel');
    expect(db.query.mock.calls[0][0]).toContain('recebe_vinculos');
    expect(result[0].vinculavel).toBe(true);
    expect(result[0].recebe_vinculos).toBe(false);
  });
});

describe('criar', () => {
  test('insere vinculavel e recebe_vinculos com default false quando nao informados', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1, nome: 'Cortinas', cor: '#C9A96E', ordem: 0, vinculavel: false, recebe_vinculos: false }],
    });
    await svc.criar(10, { nome: 'Cortinas' });
    expect(db.query.mock.calls[0][1]).toEqual([10, 'Cortinas', '#C9A96E', 0, false, false]);
  });

  test('insere vinculavel e recebe_vinculos quando informados', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 2, nome: 'Trilhos', cor: '#C9A96E', ordem: 0, vinculavel: true, recebe_vinculos: false }],
    });
    await svc.criar(10, { nome: 'Trilhos', vinculavel: true, recebe_vinculos: false });
    expect(db.query.mock.calls[0][1]).toEqual([10, 'Trilhos', '#C9A96E', 0, true, false]);
  });
});

describe('atualizar', () => {
  test('atualiza vinculavel e recebe_vinculos', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1, nome: 'Cortinas', cor: '#C9A96E', ordem: 0, vinculavel: false, recebe_vinculos: true }],
    });
    await svc.atualizar(1, 10, { nome: 'Cortinas', vinculavel: false, recebe_vinculos: true });
    expect(db.query.mock.calls[0][1]).toEqual(['Cortinas', '#C9A96E', 0, false, true, 1, 10]);
  });
});
