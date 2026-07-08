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

  test('duas linhas PJ com mesmo nome e sem CNPJ reaproveitam o mesmo escritorio (dedup por nome)', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // _carregarExistentes: arquitetos
      .mockResolvedValueOnce({ rows: [] }) // _carregarEscritoriosExistentes (nenhum existente)
      .mockResolvedValueOnce({ rows: [{ id: 30 }] }); // INSERT escritorios (apenas a primeira linha deve inserir)

    const registros = [
      { tipo_pessoa: 'PJ', nome: 'Estudio Sem Cnpj' },
      { tipo_pessoa: 'PJ', nome: 'Estudio Sem Cnpj' },
    ];

    const resultado = await svc.importar(1, registros);

    expect(resultado.escritorios_criados).toBe(1);
    const insertCalls = db.query.mock.calls.filter((c) => c[0].includes('INSERT INTO escritorios'));
    expect(insertCalls.length).toBe(1);
  });
});

describe('criar/atualizar — perfil_checklist (Checklist de Perfil do Arquiteto)', () => {
  test('criar grava perfil_checklist serializado como JSON', async () => {
    const perfil = { tem_filhos: 'sim', hobbies: 'Vinho, viagem', produtos_especifica: ['cortinas_persianas'] };
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 55 }] }) // INSERT arquitetos
      .mockResolvedValueOnce({ rows: [{ id: 55, nome: 'Fulano', perfil_checklist: perfil }] }); // buscar()

    await svc.criar(1, { nome: 'Fulano', perfil_checklist: perfil });

    const insertCall = db.query.mock.calls.find((c) => c[0].includes('INSERT INTO arquitetos'));
    expect(insertCall[1]).toContain(JSON.stringify(perfil));
  });

  test('criar sem perfil_checklist grava null', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 56 }] })
      .mockResolvedValueOnce({ rows: [{ id: 56, nome: 'Fulano' }] });

    await svc.criar(1, { nome: 'Fulano' });

    const insertCall = db.query.mock.calls.find((c) => c[0].includes('INSERT INTO arquitetos'));
    expect(insertCall[1][insertCall[1].length - 1]).toBeNull();
  });

  test('atualizar grava perfil_checklist serializado como JSON', async () => {
    const perfil = { maior_trauma: 'atraso' };
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 55 }] }) // UPDATE arquitetos
      .mockResolvedValueOnce({ rows: [{ id: 55, nome: 'Fulano', perfil_checklist: perfil }] }); // buscar()

    await svc.atualizar(55, 1, { nome: 'Fulano', perfil_checklist: perfil });

    const updateCall = db.query.mock.calls.find((c) => c[0].includes('UPDATE arquitetos'));
    expect(updateCall[1]).toContain(JSON.stringify(perfil));
  });
});

describe('importar — atualizacao de arquiteto existente mantem consultor_id em dia', () => {
  test('reimportacao com novo consultor_id atualiza o arquiteto existente', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{
          id: 42, nome: 'Fulana da Silva', telefone: null, outro_telefone: null, email: null,
          escritorio: null, escritorio_id: null, cau: null, tipo_pessoa: 'PF',
          cpf_cnpj: '111.222.333-44', observacoes: null, consultor_id: 7, data_nascimento: null,
          rua: null, numero: null, complemento: null, bairro: null, cidade: null, estado: null,
          cep: null, comprou_optin: null, chave_pix: null,
        }],
      }) // _carregarExistentes: arquitetos (ja existe, consultor_id atual = 7)
      .mockResolvedValueOnce({ rows: [] }) // _carregarEscritoriosExistentes
      .mockResolvedValueOnce({ rows: [] }); // UPDATE arquitetos

    const registros = [{
      tipo_pessoa: 'PF',
      nome: 'Fulana da Silva',
      cpf_cnpj: '111.222.333-44',
      consultor_id: 9, // novo responsavel
    }];

    const resultado = await svc.importar(1, registros);

    expect(resultado.atualizados).toBe(1);
    const updateCall = db.query.mock.calls.find((c) => c[0].includes('UPDATE arquitetos'));
    expect(updateCall).toBeTruthy();
    expect(updateCall[1]).toContain(9);
  });
});
