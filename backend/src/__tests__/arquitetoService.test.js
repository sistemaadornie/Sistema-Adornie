jest.mock('../database/db', () => ({ query: jest.fn() }));
const db = require('../database/db');
const svc = require('../services/arquitetoService');

afterEach(() => jest.resetAllMocks());

describe('importar — registros PJ viram escritorios, nao arquitetos', () => {
  test('linha PJ cria um escritorio e nao cria arquiteto', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // _carregarExistentes: arquitetos
      .mockResolvedValueOnce({ rows: [] }) // _carregarEscritoriosExistentes
      .mockResolvedValueOnce({ rows: [{ id: 10 }] }); // INSERT escritorios

    const registros = [{
      tipo_pessoa: 'PJ',
      nome: 'Estudio Exemplo',
      cpf_cnpj: '11.222.333/0001-44',
      telefone: '(41) 99999-0000',
      email: 'contato@estudioexemplo.com',
    }];

    const resultado = await svc.importar(1, registros);

    expect(resultado.escritorios_criados).toBe(1);
    expect(resultado.importados).toBe(0);
    const insertCall = db.query.mock.calls.find((c) => c[0].includes('INSERT INTO escritorios'));
    expect(insertCall).toBeTruthy();
    expect(insertCall[1]).toContain('Estudio Exemplo');
  });

  test('linha PF resolve escritorio existente pelo CNPJ e cria o arquiteto com escritorio_id', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // _carregarExistentes: arquitetos
      .mockResolvedValueOnce({ rows: [{ id: 5, nome: 'Estudio Exemplo', cnpj: '11222333000144', telefone: null, email: null, rua: null, numero: null, complemento: null, bairro: null, cidade: null, estado: null, cep: null, comprou_optin: null, chave_pix: null }] }) // _carregarEscritoriosExistentes
      .mockResolvedValueOnce({ rows: [] }) // UPDATE escritorios (existente, sem dado novo -> na verdade nao deve nem rodar se nada mudou; ver Step 3)
      .mockResolvedValueOnce({ rows: [{ id: 99 }] }); // INSERT arquitetos

    const registros = [{
      tipo_pessoa: 'PF',
      nome: 'Fulana da Silva',
      cpf_cnpj: '111.222.333-44',
      escritorio_cpf_cnpj: '11.222.333/0001-44',
      escritorio_nome: 'Estudio Exemplo',
      consultor_id: 7,
    }];

    const resultado = await svc.importar(1, registros);

    expect(resultado.importados).toBe(1);
    const insertArq = db.query.mock.calls.find((c) => c[0].includes('INSERT INTO arquitetos'));
    expect(insertArq).toBeTruthy();
    expect(insertArq[1]).toContain(5); // escritorio_id resolvido
    expect(insertArq[1]).toContain(7); // consultor_id
  });

  test('linha PF sem escritorio correspondente cria um escritorio novo automaticamente', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // arquitetos existentes
      .mockResolvedValueOnce({ rows: [] }) // escritorios existentes (nenhum)
      .mockResolvedValueOnce({ rows: [{ id: 20 }] }) // INSERT escritorios (criado a partir dos campos escritorio_*)
      .mockResolvedValueOnce({ rows: [{ id: 100 }] }); // INSERT arquitetos

    const registros = [{
      tipo_pessoa: 'PF',
      nome: 'Beltrano',
      cpf_cnpj: '555.666.777-88',
      escritorio_cpf_cnpj: '99.888.777/0001-66',
      escritorio_nome: 'Escritorio Novo',
    }];

    const resultado = await svc.importar(1, registros);

    expect(resultado.escritorios_criados).toBe(1);
    expect(resultado.importados).toBe(1);
  });
});
