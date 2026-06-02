jest.mock('../database/db', () => ({ query: jest.fn() }));
const db = require('../database/db');
const svc = require('../services/prazosService');

afterEach(() => jest.clearAllMocks());

describe('adicionarDiasUteis', () => {
  test('0 dias retorna a própria data', () => {
    const base = new Date('2026-06-08T12:00:00'); // segunda
    expect(svc.adicionarDiasUteis(base, 0).getTime()).toBe(base.getTime());
  });

  test('1 dia útil a partir de sexta cai na segunda (pula fim de semana)', () => {
    const sexta = new Date('2026-06-05T12:00:00');
    expect(svc.adicionarDiasUteis(sexta, 1).getDay()).toBe(1); // segunda
  });

  test('nunca retorna sábado nem domingo', () => {
    const base = new Date('2026-06-08T12:00:00');
    for (let n = 1; n <= 10; n++) {
      const d = svc.adicionarDiasUteis(base, n).getDay();
      expect(d).not.toBe(0);
      expect(d).not.toBe(6);
    }
  });
});

describe('calcularDiferencaDiasUteis', () => {
  test('uma semana (segunda a segunda) = 5 dias úteis', () => {
    // De 2026-06-08 (seg) a 2026-06-15 (seg): conta ter-9, qua-10, qui-11, sex-12, seg-15 = 5
    // (sáb-13 e dom-14 são pulados)
    expect(svc.calcularDiferencaDiasUteis('2026-06-08', '2026-06-15')).toBe(5);
  });

  test('data fim <= início retorna 0', () => {
    expect(svc.calcularDiferencaDiasUteis('2026-06-15', '2026-06-08')).toBe(0);
  });
});

describe('validarPrazoInstalacao', () => {
  test('sem itens passa direto (valido)', async () => {
    const r = await svc.validarPrazoInstalacao(1, '2026-06-10', []);
    expect(r).toEqual({ valido: true });
    expect(db.query).not.toHaveBeenCalled();
  });

  test('data muito futura é válida mesmo com prazos padrão', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ item_id: 1, item_descricao: 'X', categoria_id: 7, categoria_nome: 'Cortinas' }] })
      .mockResolvedValueOnce({ rows: [] }); // sem prazos cadastrados → usa defaults
    const r = await svc.validarPrazoInstalacao(1, '2999-12-31', [1]);
    expect(r.valido).toBe(true);
  });

  test('data de hoje viola o prazo padrão (15 dias úteis)', async () => {
    const hoje = new Date().toISOString().slice(0, 10);
    db.query
      .mockResolvedValueOnce({ rows: [{ item_id: 1, item_descricao: 'X', categoria_id: 7, categoria_nome: 'Cortinas' }] })
      .mockResolvedValueOnce({ rows: [] });
    const r = await svc.validarPrazoInstalacao(1, hoje, [1]);
    expect(r.valido).toBe(false);
    expect(r.detalhes).toBeDefined();
    expect(r.detalhes.dias_uteis_faltantes).toBeGreaterThan(0);
  });
});
