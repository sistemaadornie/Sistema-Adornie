const {
  sanitizeName,
  findOrCreateFolder,
  getOrCreateOsFolder,
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
