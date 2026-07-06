jest.mock('../database/db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../services/pushService', () => ({ enviarPush: jest.fn().mockResolvedValue(undefined) }));
const db = require('../database/db');
const svc = require('../services/agendamentoService');

afterEach(() => jest.clearAllMocks());

const AG_CONFERENCIA = {
  id: 1, titulo: 'Conferência X', cliente: 'Cliente Y', tipo: 'Conferência',
  criado_por: 7, status_anterior: 'andamento',
};

describe('alterarStatus — Conferência só conclui com tudo preenchido, só "não conclui" com algo pendente', () => {
  test('concluido bloqueado com 400 quando falta ficha em algum item', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [AG_CONFERENCIA] })
      .mockResolvedValueOnce({ rows: [{ pendentes: '2', total: '5' }] });

    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'concluido', null, [], [])
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('pendente') });
    expect(db.connect).not.toHaveBeenCalled();
  });

  test('concluido permitido quando todos os itens têm ficha', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [AG_CONFERENCIA] })
      .mockResolvedValueOnce({ rows: [{ pendentes: '0', total: '5' }] });
    db.connect.mockRejectedValueOnce(new Error('SENTINEL_PASSOU_DA_VALIDACAO'));

    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'concluido', null, [], [])
    ).rejects.toThrow('SENTINEL_PASSOU_DA_VALIDACAO');
  });

  test('nao_concluido bloqueado com 400 quando todos os itens já têm ficha preenchida', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [AG_CONFERENCIA] })
      .mockResolvedValueOnce({ rows: [{ pendentes: '0', total: '5' }] });

    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'nao_concluido', null, [], [])
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('conclua') });
    expect(db.connect).not.toHaveBeenCalled();
  });

  test('nao_concluido permitido quando falta ficha em algum item', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [AG_CONFERENCIA] })
      .mockResolvedValueOnce({ rows: [{ pendentes: '1', total: '5' }] });
    db.connect.mockRejectedValueOnce(new Error('SENTINEL_PASSOU_DA_VALIDACAO'));

    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'nao_concluido', null, [], [])
    ).rejects.toThrow('SENTINEL_PASSOU_DA_VALIDACAO');
  });

  test('Instalação não é afetada pela regra de conclusão da Conferência', async () => {
    const AG_INSTALACAO = { ...AG_CONFERENCIA, tipo: 'Instalação' };
    db.query
      .mockResolvedValueOnce({ rows: [AG_INSTALACAO] })
      .mockResolvedValueOnce({ rows: [] }); // pendentesFoto (regra de foto por item)
    db.connect.mockRejectedValueOnce(new Error('SENTINEL_PASSOU_DA_VALIDACAO'));

    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'nao_concluido', null, [], [])
    ).rejects.toThrow('SENTINEL_PASSOU_DA_VALIDACAO');
  });
});
