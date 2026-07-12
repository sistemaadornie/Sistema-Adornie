jest.mock('../database/db', () => ({ query: jest.fn() }));

const jwt = require('jsonwebtoken');
const authMiddleware = require('../middlewares/authMiddleware');

const OLD_ENV = process.env.JWT_SECRET;
beforeAll(() => { process.env.JWT_SECRET = 'segredo-de-teste'; });
afterAll(() => { process.env.JWT_SECRET = OLD_ENV; });

function mockReqRes(token) {
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  return { req, res, next };
}

describe('authMiddleware — claim app', () => {
  test('propaga app="pwa" de um token novo', async () => {
    const token = jwt.sign(
      { id: 1, permissoes: ['INSTALADOR'], app: 'pwa', status: 'aprovado' },
      process.env.JWT_SECRET
    );
    const { req, res, next } = mockReqRes(token);
    await authMiddleware(req, res, next);
    expect(req.user.app).toBe('pwa');
    expect(next).toHaveBeenCalled();
  });

  test('propaga app="web" de um token novo', async () => {
    const token = jwt.sign(
      { id: 1, permissoes: ['COMERCIAL'], app: 'web', status: 'aprovado' },
      process.env.JWT_SECRET
    );
    const { req, res, next } = mockReqRes(token);
    await authMiddleware(req, res, next);
    expect(req.user.app).toBe('web');
  });

  test('token legado sem claim app resulta em req.user.app null', async () => {
    const token = jwt.sign(
      { id: 1, permissoes: ['COMERCIAL'], status: 'aprovado' },
      process.env.JWT_SECRET
    );
    const { req, res, next } = mockReqRes(token);
    await authMiddleware(req, res, next);
    expect(req.user.app).toBeNull();
  });
});
