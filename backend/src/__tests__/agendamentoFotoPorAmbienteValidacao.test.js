jest.mock('../database/db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../services/pushService', () => ({ enviarPush: jest.fn().mockResolvedValue(undefined) }));
const db = require('../database/db');
const svc = require('../services/agendamentoService');

afterEach(() => jest.clearAllMocks());

const AG_CONFERENCIA = {
  id: 1, titulo: 'Conferência X', cliente: 'Cliente Y', tipo: 'Conferência',
  criado_por: 7, status_anterior: 'agendado',
};

describe('alterarStatus — exige foto de cada ambiente ao iniciar Conferência', () => {
  test('andamento bloqueado com 400 quando falta foto de algum ambiente', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [AG_CONFERENCIA] })                       // busca inicial
      .mockResolvedValueOnce({ rows: [{ ambiente: 'LIVING' }, { ambiente: 'SUITE MASTER' }] }); // ambientes do agendamento

    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'andamento', null, [], ['LIVING'])
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('SUITE MASTER') });
    expect(db.connect).not.toHaveBeenCalled();
  });

  test('andamento permitido quando todos os ambientes têm foto', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [AG_CONFERENCIA] })
      .mockResolvedValueOnce({ rows: [{ ambiente: 'LIVING' }, { ambiente: 'SUITE MASTER' }] });
    db.connect.mockRejectedValueOnce(new Error('SENTINEL_PASSOU_DA_VALIDACAO'));

    // `files` vazio propositalmente: a validação de cobertura usa só `nomes`,
    // e sem arquivos o upload no Cloudinary é pulado antes de chegar no sentinel.
    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'andamento', null, [], ['LIVING', 'SUITE MASTER'])
    ).rejects.toThrow('SENTINEL_PASSOU_DA_VALIDACAO');
  });

  test('Instalação não é afetada pela nova regra de ambiente', async () => {
    const AG_INSTALACAO = { ...AG_CONFERENCIA, tipo: 'Instalação' };
    db.query.mockResolvedValueOnce({ rows: [AG_INSTALACAO] });
    db.connect.mockRejectedValueOnce(new Error('SENTINEL_PASSOU_DA_VALIDACAO'));

    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'andamento', null, [], [])
    ).rejects.toThrow('SENTINEL_PASSOU_DA_VALIDACAO');
  });

  test('concluido não é afetado pela nova regra de ambiente (só se aplica a andamento)', async () => {
    const AG = { ...AG_CONFERENCIA };
    db.query
      .mockResolvedValueOnce({ rows: [AG] })
      .mockResolvedValueOnce({ rows: [{ pendentes: '0', total: '0' }] }); // checagem de conferência já existente
    db.connect.mockRejectedValueOnce(new Error('SENTINEL_PASSOU_DA_VALIDACAO'));

    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'concluido', null, [], [])
    ).rejects.toThrow('SENTINEL_PASSOU_DA_VALIDACAO');
  });
});
