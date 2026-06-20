jest.mock('../database/db', () => ({ query: jest.fn(), connect: jest.fn() }));
const db = require('../database/db');
const svc = require('../services/agendamentoService');

afterEach(() => jest.clearAllMocks());

const AG_INSTALACAO = {
  id: 1, titulo: 'Instalação X', cliente: 'Cliente Y', tipo: 'Instalação',
  criado_por: 7, status_anterior: 'andamento',
};

describe('alterarStatus — exige foto por item em Instalação/Retorno-Finalização', () => {
  test('concluido bloqueado com 400 quando falta foto em algum item', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [AG_INSTALACAO] })           // busca inicial
      .mockResolvedValueOnce({ rows: [{ nome: 'Cortina sala' }] }); // itens sem foto
    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'concluido', null, [], [])
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('Cortina sala') });
    expect(db.connect).not.toHaveBeenCalled();
  });

  test('nao_concluido também é bloqueado quando falta foto em algum item', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [AG_INSTALACAO] })
      .mockResolvedValueOnce({ rows: [{ nome: 'Persiana quarto' }] });
    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'nao_concluido', null, [], [])
    ).rejects.toMatchObject({ status: 400 });
  });

  test('concluido permitido quando todos os itens têm foto', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [AG_INSTALACAO] })
      .mockResolvedValueOnce({ rows: [] }); // nenhum item pendente
    db.connect.mockRejectedValueOnce(new Error('SENTINEL_PASSOU_DA_VALIDACAO'));
    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'concluido', null, [], [])
    ).rejects.toThrow('SENTINEL_PASSOU_DA_VALIDACAO');
  });

  test('Retorno/Finalização segue a mesma regra', async () => {
    const AG_RETORNO = { ...AG_INSTALACAO, tipo: 'Retorno/Finalização' };
    db.query
      .mockResolvedValueOnce({ rows: [AG_RETORNO] })
      .mockResolvedValueOnce({ rows: [{ nome: 'Trilho sala' }] });
    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'concluido', null, [], [])
    ).rejects.toMatchObject({ status: 400 });
  });

  test('Conferência não é afetada pela nova regra (mantém comportamento atual)', async () => {
    const AG_CONFERENCIA = { ...AG_INSTALACAO, tipo: 'Conferência' };
    db.query
      .mockResolvedValueOnce({ rows: [AG_CONFERENCIA] })             // busca inicial
      .mockResolvedValueOnce({ rows: [{ pendentes: '0', total: '0' }] }); // checagem de conferência já existente
    db.connect.mockRejectedValueOnce(new Error('SENTINEL_PASSOU_DA_VALIDACAO'));
    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'concluido', null, [], [])
    ).rejects.toThrow('SENTINEL_PASSOU_DA_VALIDACAO');
  });

  test('Manutenção não exige foto por item', async () => {
    const AG_MANUTENCAO = { ...AG_INSTALACAO, tipo: 'Manutenção' };
    db.query.mockResolvedValueOnce({ rows: [AG_MANUTENCAO] });
    db.connect.mockRejectedValueOnce(new Error('SENTINEL_PASSOU_DA_VALIDACAO'));
    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'concluido', null, [], [])
    ).rejects.toThrow('SENTINEL_PASSOU_DA_VALIDACAO');
  });

  test('andamento não é afetado (sem checagem de foto por item)', async () => {
    db.query.mockResolvedValueOnce({ rows: [AG_INSTALACAO] });
    db.connect.mockRejectedValueOnce(new Error('SENTINEL_PASSOU_DA_VALIDACAO'));
    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'andamento', null, [], [])
    ).rejects.toThrow('SENTINEL_PASSOU_DA_VALIDACAO');
  });
});
