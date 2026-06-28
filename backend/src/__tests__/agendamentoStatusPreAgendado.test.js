jest.mock('../database/db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../services/pushService', () => ({ enviarPush: jest.fn().mockResolvedValue(undefined) }));
const db = require('../database/db');
const svc = require('../services/agendamentoService');

afterEach(() => jest.clearAllMocks());

const AG_PRE_AGENDADO = {
  id: 1, titulo: 'Instalação X', cliente: 'Cliente Y', tipo: 'Instalação',
  criado_por: 7, status_anterior: 'pre_agendado',
};

describe('alterarStatus — bloqueio de transição a partir de pre_agendado', () => {
  test('pre_agendado -> andamento é rejeitado com 400', async () => {
    db.query.mockResolvedValueOnce({ rows: [AG_PRE_AGENDADO] }); // busca inicial
    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'andamento', null, [], [])
    ).rejects.toMatchObject({ status: 400 });
    expect(db.connect).not.toHaveBeenCalled();
  });

  test('pre_agendado -> concluido é rejeitado com 400', async () => {
    db.query.mockResolvedValueOnce({ rows: [AG_PRE_AGENDADO] });
    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'concluido', null, [], [])
    ).rejects.toMatchObject({ status: 400 });
    expect(db.connect).not.toHaveBeenCalled();
  });

  test('pre_agendado -> nao_concluido é rejeitado com 400', async () => {
    db.query.mockResolvedValueOnce({ rows: [AG_PRE_AGENDADO] });
    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'nao_concluido', null, [], [])
    ).rejects.toMatchObject({ status: 400 });
    expect(db.connect).not.toHaveBeenCalled();
  });

  test('pre_agendado -> agendado continua permitido (passa da validação)', async () => {
    db.query.mockResolvedValueOnce({ rows: [AG_PRE_AGENDADO] }); // busca inicial
    db.connect.mockRejectedValueOnce(new Error('SENTINEL_PASSOU_DA_VALIDACAO'));
    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'agendado', null, [], [])
    ).rejects.toThrow('SENTINEL_PASSOU_DA_VALIDACAO');
  });

  test('pre_agendado -> cancelado continua permitido (passa da validação)', async () => {
    db.query.mockResolvedValueOnce({ rows: [AG_PRE_AGENDADO] }); // busca inicial
    db.connect.mockRejectedValueOnce(new Error('SENTINEL_PASSOU_DA_VALIDACAO'));
    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'cancelado', null, [], [])
    ).rejects.toThrow('SENTINEL_PASSOU_DA_VALIDACAO');
  });

  test('andamento -> nao_concluido (status atual não é pre_agendado) continua permitido', async () => {
    const AG_ANDAMENTO = { ...AG_PRE_AGENDADO, status_anterior: 'andamento' };
    db.query
      .mockResolvedValueOnce({ rows: [AG_ANDAMENTO] }) // busca inicial
      .mockResolvedValueOnce({ rows: [] }); // validação de foto por item (nenhum pendente)
    db.connect.mockRejectedValueOnce(new Error('SENTINEL_PASSOU_DA_VALIDACAO'));
    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'nao_concluido', null, [], [])
    ).rejects.toThrow('SENTINEL_PASSOU_DA_VALIDACAO');
  });
});
