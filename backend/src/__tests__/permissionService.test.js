const { podeAcessarPWA, isInstaladorPuro } = require('../services/permissionService');

describe('podeAcessarPWA', () => {
  test('true para ADMIN_MASTER', () => {
    expect(podeAcessarPWA(['ADMIN_MASTER'])).toBe(true);
  });

  test('true para INSTALADOR', () => {
    expect(podeAcessarPWA(['INSTALADOR'])).toBe(true);
  });

  test('true para ADMIN_MASTER + INSTALADOR juntos', () => {
    expect(podeAcessarPWA(['ADMIN_MASTER', 'INSTALADOR'])).toBe(true);
  });

  test('false para COMERCIAL', () => {
    expect(podeAcessarPWA(['COMERCIAL'])).toBe(false);
  });

  test('false para OPERADOR_AGENDA', () => {
    expect(podeAcessarPWA(['OPERADOR_AGENDA'])).toBe(false);
  });

  test('false para GESTOR_USUARIOS', () => {
    expect(podeAcessarPWA(['GESTOR_USUARIOS'])).toBe(false);
  });

  test('false para array vazio ou undefined', () => {
    expect(podeAcessarPWA([])).toBe(false);
    expect(podeAcessarPWA(undefined)).toBe(false);
  });
});

describe('isInstaladorPuro (regressão)', () => {
  test('true só com INSTALADOR', () => {
    expect(isInstaladorPuro(['INSTALADOR'])).toBe(true);
  });

  test('false com INSTALADOR + ADMIN_MASTER', () => {
    expect(isInstaladorPuro(['INSTALADOR', 'ADMIN_MASTER'])).toBe(false);
  });
});
