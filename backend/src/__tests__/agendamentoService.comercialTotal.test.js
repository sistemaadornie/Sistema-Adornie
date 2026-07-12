jest.mock('../database/db', () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));

const db = require('../database/db');
const svc = require('../services/agendamentoService');

beforeEach(() => jest.clearAllMocks());

describe('listar — COMERCIAL vê tudo', () => {
  test('não adiciona filtro de criado_por/equipe para permissoes COMERCIAL', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await svc.listar(10, 5, ['COMERCIAL'], {});
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).not.toContain('a.criado_por=$');
    expect(params).not.toContain(5);
  });
});
