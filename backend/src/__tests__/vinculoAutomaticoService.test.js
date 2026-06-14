const { encontrarPares } = require('../services/vinculoAutomaticoService');

function item(overrides) {
  return {
    id: 1,
    ambiente: 'Sala',
    largura: '1.5000',
    vinculavel: false,
    recebe_vinculos: false,
    ja_vinculado: false,
    ...overrides,
  };
}

describe('encontrarPares', () => {
  test('1 acessorio + 1 principal, mesmo ambiente/largura -> 1 par', () => {
    const itens = [
      item({ id: 1, vinculavel: true }),
      item({ id: 2, recebe_vinculos: true }),
    ];
    expect(encontrarPares(itens)).toEqual([{ acessorioId: 1, principalId: 2 }]);
  });

  test('larguras diferentes -> nenhum par', () => {
    const itens = [
      item({ id: 1, vinculavel: true, largura: '1.5000' }),
      item({ id: 2, recebe_vinculos: true, largura: '2.0000' }),
    ];
    expect(encontrarPares(itens)).toEqual([]);
  });

  test('ambientes diferentes -> nenhum par', () => {
    const itens = [
      item({ id: 1, vinculavel: true, ambiente: 'Sala' }),
      item({ id: 2, recebe_vinculos: true, ambiente: 'Quarto' }),
    ];
    expect(encontrarPares(itens)).toEqual([]);
  });

  test('2 acessorios + 1 principal, mesma largura -> nenhum par (ambiguo)', () => {
    const itens = [
      item({ id: 1, vinculavel: true }),
      item({ id: 2, vinculavel: true }),
      item({ id: 3, recebe_vinculos: true }),
    ];
    expect(encontrarPares(itens)).toEqual([]);
  });

  test('1 acessorio + 2 principais, mesma largura -> nenhum par (ambiguo)', () => {
    const itens = [
      item({ id: 1, vinculavel: true }),
      item({ id: 2, recebe_vinculos: true }),
      item({ id: 3, recebe_vinculos: true }),
    ];
    expect(encontrarPares(itens)).toEqual([]);
  });

  test('item ja vinculado nao entra como acessorio candidato', () => {
    const itens = [
      item({ id: 1, vinculavel: true, ja_vinculado: true }),
      item({ id: 2, recebe_vinculos: true }),
    ];
    expect(encontrarPares(itens)).toEqual([]);
  });

  test('ambiente nulo -> item ignorado', () => {
    const itens = [
      item({ id: 1, vinculavel: true, ambiente: null }),
      item({ id: 2, recebe_vinculos: true, ambiente: null }),
    ];
    expect(encontrarPares(itens)).toEqual([]);
  });

  test('ambiente vazio -> item ignorado', () => {
    const itens = [
      item({ id: 1, vinculavel: true, ambiente: '' }),
      item({ id: 2, recebe_vinculos: true, ambiente: '' }),
    ];
    expect(encontrarPares(itens)).toEqual([]);
  });

  test('largura nula -> item ignorado', () => {
    const itens = [
      item({ id: 1, vinculavel: true, largura: null }),
      item({ id: 2, recebe_vinculos: true, largura: null }),
    ];
    expect(encontrarPares(itens)).toEqual([]);
  });

  test('multiplos ambientes, cada um com par valido -> 2 pares', () => {
    const itens = [
      item({ id: 1, ambiente: 'Sala',   largura: '1.5000', vinculavel: true }),
      item({ id: 2, ambiente: 'Sala',   largura: '1.5000', recebe_vinculos: true }),
      item({ id: 3, ambiente: 'Quarto', largura: '2.2000', vinculavel: true }),
      item({ id: 4, ambiente: 'Quarto', largura: '2.2000', recebe_vinculos: true }),
    ];
    expect(encontrarPares(itens)).toEqual([
      { acessorioId: 1, principalId: 2 },
      { acessorioId: 3, principalId: 4 },
    ]);
  });
});
