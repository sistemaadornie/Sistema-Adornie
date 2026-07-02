const { labelProdutoConferencia } = require('../utils/produtoLabel');

describe('labelProdutoConferencia', () => {
  test('persiana ignora o modelo e usa apenas "Persiana"', () => {
    expect(labelProdutoConferencia('persiana', 'Screen', 'motorizado')).toBe('Persiana Motorizada');
    expect(labelProdutoConferencia('persiana', null, 'manual')).toBe('Persiana Manual');
  });

  test('cortina usa o modelo detectado quando disponivel', () => {
    expect(labelProdutoConferencia('cortina', 'Cortina Wave', 'motorizado')).toBe('Cortina Wave Motorizada');
    expect(labelProdutoConferencia('cortina', 'Cortina Franzida', 'manual')).toBe('Cortina Franzida Manual');
  });

  test('cortina sem modelo cai para "Cortina"', () => {
    expect(labelProdutoConferencia('cortina', null, 'manual')).toBe('Cortina Manual');
  });

  test('forro usa o modelo quando disponivel e nao exige acionamento', () => {
    expect(labelProdutoConferencia('forro', 'Forro Franzido Blackout', null)).toBe('Forro Franzido Blackout');
    expect(labelProdutoConferencia('forro', null, null)).toBe('Forro');
  });

  test('retorna null quando nao ha tipo_confeccao', () => {
    expect(labelProdutoConferencia(null, null, null)).toBeNull();
  });
});
