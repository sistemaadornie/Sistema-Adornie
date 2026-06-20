jest.mock('../database/db', () => ({ query: jest.fn() }));
jest.mock('../config/cloudinary', () => ({ uploader: { upload_stream: jest.fn() } }));
jest.mock('streamifier', () => ({ createReadStream: jest.fn(() => ({ pipe: jest.fn() })) }));

const db = require('../database/db');
const cloudinary = require('../config/cloudinary');
const svc = require('../services/agendamentoService');

afterEach(() => jest.clearAllMocks());

function mockUploadOk(url) {
  cloudinary.uploader.upload_stream.mockImplementation((_opts, cb) => {
    cb(null, { secure_url: url });
    return {};
  });
}

describe('adicionarFotoItem', () => {
  test('404 quando o item não pertence ao agendamento/empresa', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(
      svc.adicionarFotoItem(3, 999, 10, 1, [{ buffer: Buffer.from('x'), originalname: 'a.jpg' }])
    ).rejects.toMatchObject({ status: 404 });
  });

  test('400 quando não há arquivos', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 5 }] });
    await expect(
      svc.adicionarFotoItem(3, 5, 10, 1, [])
    ).rejects.toMatchObject({ status: 400 });
  });

  test('sobe a foto e insere em agendamento_item_fotos', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 5 }] }) // existe
      .mockResolvedValueOnce({ rows: [{ id: 1, url: 'https://cdn/foto1.jpg' }] }); // insert
    mockUploadOk('https://cdn/foto1.jpg');

    const fotos = await svc.adicionarFotoItem(3, 5, 10, 1, [{ buffer: Buffer.from('x'), originalname: 'a.jpg' }]);

    expect(fotos).toEqual([{ id: 1, url: 'https://cdn/foto1.jpg' }]);
    expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
      expect.objectContaining({ folder: 'operon/empresas/10/agendamentos/3/itens/5' }),
      expect.any(Function)
    );
    expect(db.query.mock.calls[1][0]).toContain('INSERT INTO agendamento_item_fotos');
  });
});

describe('buscar — itens_raw com pedido_item_id e fotos', () => {
  test('agrupa as fotos por item', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1, titulo: 'T', tipo: 'Instalação' }] }) // ag
      .mockResolvedValueOnce({ rows: [] }) // equipe
      .mockResolvedValueOnce({ rows: [
        { id: 10, nome: 'Cortina sala', pedido_item_id: 50 },
        { id: 11, nome: 'Persiana quarto', pedido_item_id: null },
      ] }) // itens
      .mockResolvedValueOnce({ rows: [
        { id: 1, agendamento_item_id: 10, url: 'https://cdn/foto1.jpg' },
      ] }) // fotos por item
      .mockResolvedValueOnce({ rows: [] }); // anexos

    const ag = await svc.buscar(1, 10);

    expect(ag.itens).toEqual(['Cortina sala', 'Persiana quarto']);
    expect(ag.itens_raw).toEqual([
      { id: 10, nome: 'Cortina sala', pedido_item_id: 50, fotos: [{ id: 1, url: 'https://cdn/foto1.jpg' }] },
      { id: 11, nome: 'Persiana quarto', pedido_item_id: null, fotos: [] },
    ]);
  });
});
