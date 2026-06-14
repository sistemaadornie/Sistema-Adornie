jest.mock('../database/db', () => ({ query: jest.fn() }));
const db = require('../database/db');
const svc = require('../services/categoriaService');

afterEach(() => jest.clearAllMocks());

describe('listar', () => {
  test('inclui vinculavel, recebe_vinculos e necessita_conferencia na query e no retorno', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1, nome: 'Trilhos', cor: '#000', ordem: 0, vinculavel: true, recebe_vinculos: false, necessita_conferencia: true }],
    });
    const result = await svc.listar(10);
    expect(db.query.mock.calls[0][0]).toContain('vinculavel');
    expect(db.query.mock.calls[0][0]).toContain('recebe_vinculos');
    expect(db.query.mock.calls[0][0]).toContain('necessita_conferencia');
    expect(result[0].vinculavel).toBe(true);
    expect(result[0].recebe_vinculos).toBe(false);
    expect(result[0].necessita_conferencia).toBe(true);
  });
});

describe('criar', () => {
  test('insere vinculavel, recebe_vinculos e necessita_conferencia com default false quando nao informados', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1, nome: 'Cortinas', cor: '#C9A96E', ordem: 0, vinculavel: false, recebe_vinculos: false, necessita_conferencia: false }],
    });
    await svc.criar(10, { nome: 'Cortinas' });
    expect(db.query.mock.calls[0][1]).toEqual([10, 'Cortinas', '#C9A96E', 0, false, false, false]);
  });

  test('insere vinculavel, recebe_vinculos e necessita_conferencia quando informados', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 2, nome: 'Trilhos', cor: '#C9A96E', ordem: 0, vinculavel: true, recebe_vinculos: false, necessita_conferencia: true }],
    });
    await svc.criar(10, { nome: 'Trilhos', vinculavel: true, recebe_vinculos: false, necessita_conferencia: true });
    expect(db.query.mock.calls[0][1]).toEqual([10, 'Trilhos', '#C9A96E', 0, true, false, true]);
  });
});

describe('atualizar', () => {
  test('atualiza vinculavel, recebe_vinculos e necessita_conferencia', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1, nome: 'Cortinas', cor: '#C9A96E', ordem: 0, vinculavel: false, recebe_vinculos: true, necessita_conferencia: true }],
    });
    await svc.atualizar(1, 10, { nome: 'Cortinas', vinculavel: false, recebe_vinculos: true, necessita_conferencia: true });
    expect(db.query.mock.calls[0][1]).toEqual(['Cortinas', '#C9A96E', 0, false, true, true, 1, 10]);
  });
});
