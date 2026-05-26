const https = require('https');

jest.mock('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: jest.fn().mockImplementation(() => ({
        getClient: jest.fn().mockResolvedValue({
          getAccessToken: jest.fn().mockResolvedValue({ token: 'test-token' }),
        }),
      })),
    },
    drive: jest.fn(),
  },
}));

const {
  sanitizeName,
  findOrCreateFolder,
  getOrCreateOsFolder,
  initiateResumableUpload,
} = require('../services/googleDriveService');

describe('sanitizeName', () => {
  test('remove acentos', () => {
    expect(sanitizeName('Cortinão')).toBe('Cortinao');
  });
  test('substitui espaços por hífen', () => {
    expect(sanitizeName('Sala de Estar')).toBe('Sala-de-Estar');
  });
  test('remove caracteres especiais', () => {
    expect(sanitizeName('Cortinas / Sala (2024)')).toBe('Cortinas-Sala-2024');
  });
  test('trunca a 100 caracteres', () => {
    expect(sanitizeName('a'.repeat(120))).toHaveLength(100);
  });
});

describe('findOrCreateFolder', () => {
  test('retorna id existente quando pasta já existe', async () => {
    const drive = {
      files: {
        list: jest.fn().mockResolvedValue({ data: { files: [{ id: 'folder-123' }] } }),
        create: jest.fn(),
      },
    };
    const id = await findOrCreateFolder(drive, 'MinhaP', 'parent-id');
    expect(id).toBe('folder-123');
    expect(drive.files.create).not.toHaveBeenCalled();
  });

  test('cria pasta quando não existe e retorna novo id', async () => {
    const drive = {
      files: {
        list: jest.fn().mockResolvedValue({ data: { files: [] } }),
        create: jest.fn().mockResolvedValue({ data: { id: 'novo-folder-456' } }),
      },
    };
    const id = await findOrCreateFolder(drive, 'MinhaP', 'parent-id');
    expect(id).toBe('novo-folder-456');
    expect(drive.files.create).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          name: 'MinhaP',
          mimeType: 'application/vnd.google-apps.folder',
          parents: ['parent-id'],
        }),
      })
    );
  });
});

describe('initiateResumableUpload', () => {
  let reqMock;

  beforeEach(() => {
    process.env.GOOGLE_SA_KEY_JSON = JSON.stringify({ type: 'service_account' });
    reqMock = { on: jest.fn(), write: jest.fn(), end: jest.fn() };
  });

  afterEach(() => {
    delete process.env.GOOGLE_SA_KEY_JSON;
    jest.restoreAllMocks();
  });

  test('retorna uploadUri quando Drive responde 200 com location', async () => {
    jest.spyOn(https, 'request').mockImplementation((_opts, cb) => {
      cb({ statusCode: 200, headers: { location: 'https://upload.googleapis.com/upload?uploadId=xyz' }, resume: jest.fn() });
      return reqMock;
    });

    const uri = await initiateResumableUpload({
      folderId: 'folder-1',
      fileName: 'foto.jpg',
      mimeType: 'image/jpeg',
      fileSize: 2048,
    });
    expect(uri).toBe('https://upload.googleapis.com/upload?uploadId=xyz');
  });

  test('rejeita quando Drive responde com erro', async () => {
    jest.spyOn(https, 'request').mockImplementation((_opts, cb) => {
      const resMock = {
        statusCode: 403,
        headers: {},
        on: jest.fn((event, handler) => {
          if (event === 'data') handler('Forbidden');
          if (event === 'end') handler();
        }),
      };
      cb(resMock);
      return reqMock;
    });

    await expect(
      initiateResumableUpload({
        folderId: 'folder-1',
        fileName: 'foto.jpg',
        mimeType: 'image/jpeg',
        fileSize: 2048,
      })
    ).rejects.toThrow('Drive API 403');
  });
});
