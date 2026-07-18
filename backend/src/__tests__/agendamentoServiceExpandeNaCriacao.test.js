jest.mock('../database/db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../services/clienteService', () => ({ resolverCliente: jest.fn() }));
jest.mock('../utils/geocoding', () => ({
  geocodificarAgendamento: jest.fn().mockResolvedValue(null),
  geocodificarLote: jest.fn(),
  avaliarEndereco: jest.fn(),
}));
const db = require('../database/db');
const { resolverCliente } = require('../services/clienteService');
const svc = require('../services/agendamentoService');

function mockClientPersianaX2(agendamentoId) {
  const client = {
    query: jest.fn(async (sql, params) => {
      if (sql.includes('INSERT INTO agendamentos')) return { rows: [{ id: agendamentoId }] };
      if (sql.includes('SELECT pi.id, pi.quantidade, pi.item_pai_id, pi.expandido')) {
        return { rows: [{ id: params[0], quantidade: 2, item_pai_id: null, expandido: false, necessita_conferencia: true }] };
      }
      if (sql.includes('INSERT INTO pedido_itens')) {
        return { rows: [{ id: 200 + params[1], descricao: 'Persiana Sala' }] };
      }
      if (sql.includes('UPDATE pedido_itens SET expandido')) return { rows: [] };
      if (sql.includes('INSERT INTO agendamento_itens')) return { rows: [] };
      if (sql.includes('SELECT cat.tipo_confeccao')) return { rows: [{ tipo_confeccao: 'persiana' }] };
      if (sql.includes('SELECT id FROM ordem_servico')) return { rows: [] };
      if (sql.includes('INSERT INTO ordem_servico')) return { rows: [] };
      return { rows: [] };
    }),
    release: jest.fn(),
  };
  return client;
}

beforeEach(() => {
  db.query.mockImplementation(async () => ({ rows: [{ id: 1 }] }));
  resolverCliente.mockResolvedValue({ id: 3, criado: false });
});
afterEach(() => jest.clearAllMocks());

describe('criar — expande itens de Conferência com quantidade > 1', () => {
  test('agendamento_itens recebe os ids dos filhos, não o item original', async () => {
    const client = mockClientPersianaX2(900);
    db.connect.mockResolvedValueOnce(client);

    await svc.criar(10, 1, {
      titulo: 'Conferência', cliente: 'Cliente Y', tipo: 'Conferência', data: '2026-08-01',
      itens: [{ pedido_item_id: 5, nome: 'Persiana Sala' }],
    });

    const insertsItens = client.query.mock.calls.filter((c) => c[0].includes('INSERT INTO agendamento_itens'));
    expect(insertsItens).toHaveLength(2);
    expect(insertsItens.map((c) => c[1][2])).toEqual([201, 202]);
  });
});

describe('atualizar — expande itens de Conferência com quantidade > 1', () => {
  test('agendamento_itens recebe os ids dos filhos, não o item original', async () => {
    const client = mockClientPersianaX2(900);
    db.connect.mockResolvedValueOnce(client);

    await svc.atualizar(900, 10, 1, 'Admin', {
      titulo: 'Conferência', cliente: 'Cliente Y', tipo: 'Conferência', data: '2026-08-01',
      itens: [{ pedido_item_id: 5, nome: 'Persiana Sala' }],
    });

    const insertsItens = client.query.mock.calls.filter((c) => c[0].includes('INSERT INTO agendamento_itens'));
    expect(insertsItens).toHaveLength(2);
    expect(insertsItens.map((c) => c[1][2])).toEqual([201, 202]);
  });
});
