// db.js exports a pg Pool directly. For non-transaction functions the pool exposes
// pool.query directly; for confirmar we mock pool.connect() returning a fake client.
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockClient = { query: mockClientQuery, release: mockClientRelease };

jest.mock('../database/db', () => {
  const mockPoolQuery = jest.fn();
  const mock = { query: mockPoolQuery, connect: jest.fn() };
  return mock;
});

const db  = require('../database/db');
const svc = require('../services/uploadSessionService');

afterEach(() => {
  jest.clearAllMocks();
  // reset client-level mocks too
  mockClientQuery.mockReset();
  mockClientRelease.mockReset();
});

describe('verificarDuplicata', () => {
  test('retorna null quando não há duplicata', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const result = await svc.verificarDuplicata(1, 'abc123');
    expect(result).toBeNull();
  });

  test('retorna a mídia existente quando hash já existe no pedido', async () => {
    const existente = { id: 5, drive_file_id: 'gdrive-abc' };
    db.query.mockResolvedValueOnce({ rows: [existente] });
    const result = await svc.verificarDuplicata(1, 'abc123');
    expect(result).toEqual(existente);
  });
});

describe('criarSessao', () => {
  test('insere sessão e retorna id UUID', async () => {
    const fakeSession = { id: 'uuid-1234', status: 'pendente' };
    db.query.mockResolvedValueOnce({ rows: [fakeSession] });

    const result = await svc.criarSessao({
      pedidoId: 1, pedidoItemId: 2, osId: 3,
      nomeArquivo: 'foto.jpg', tamanhoBytes: 500000,
      mimeType: 'image/jpeg', tipo: 'foto',
      hashMd5: 'abc123', iniciadoPor: 7,
      driveUploadUri: 'https://drive.example/upload/uuid',
      driveFolderId: 'folder-id-xyz',
    });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO upload_sessions'),
      expect.arrayContaining(['foto.jpg', 'image/jpeg', 'abc123'])
    );
    expect(result.id).toBe('uuid-1234');
  });
});

describe('buscarStatus', () => {
  test('retorna sessão quando pertence ao usuário', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 'uuid-1', status: 'pendente', bytes_confirmados: 0 }],
    });
    const result = await svc.buscarStatus('uuid-1', 7);
    expect(result).not.toBeNull();
  });

  test('retorna null quando sessão não encontrada', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const result = await svc.buscarStatus('uuid-x', 7);
    expect(result).toBeNull();
  });
});

describe('confirmar', () => {
  test('insere em pedido_midias e atualiza sessão', async () => {
    const fakeSession = {
      id: 'uuid-1', pedido_id: 1, pedido_item_id: 2, ordem_servico_id: 3,
      nome_arquivo: 'foto.jpg', tamanho_bytes: 500000, tipo: 'foto',
      iniciado_por: 7, drive_folder_id: 'folder-xyz', hash_md5: 'abc',
    };
    db.connect.mockResolvedValueOnce(mockClient);
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })              // BEGIN
      .mockResolvedValueOnce({ rows: [fakeSession] })   // SELECT sessão
      .mockResolvedValueOnce({ rows: [{ id: 55 }] })    // INSERT pedido_midias
      .mockResolvedValueOnce({ rows: [] })              // UPDATE sessão
      .mockResolvedValueOnce({ rows: [] });             // COMMIT

    const result = await svc.confirmar('uuid-1', {
      driveFileId: 'file-111',
      driveUrl: 'https://drive.google.com/file/d/file-111',
      duracaoSegundos: null,
    });

    expect(mockClientQuery).toHaveBeenCalledTimes(5);
    expect(mockClientRelease).toHaveBeenCalledTimes(1);
    expect(result.midia_id).toBe(55);
  });

  test('lança erro 404 quando sessão não existe', async () => {
    db.connect.mockResolvedValueOnce(mockClient);
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })   // BEGIN
      .mockResolvedValueOnce({ rows: [] })   // SELECT returns empty
      .mockResolvedValueOnce({ rows: [] })   // ROLLBACK (inside if-block)
      .mockResolvedValueOnce({ rows: [] });  // ROLLBACK (catch block)

    await expect(
      svc.confirmar('uuid-nao-existe', { driveFileId: 'x', driveUrl: 'y', duracaoSegundos: null })
    ).rejects.toMatchObject({ status: 404 });

    expect(mockClientRelease).toHaveBeenCalledTimes(1);
  });
});
