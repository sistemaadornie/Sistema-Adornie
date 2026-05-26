const { google } = require('googleapis');
const https = require('https');

function sanitizeName(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/gu, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .substring(0, 100);
}

function _getDrive() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SA_KEY_JSON),
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

const _pendingFolders = new Map();

async function findOrCreateFolder(drive, name, parentId) {
  const key = `${parentId}/${name}`;
  const pending = _pendingFolders.get(key);
  if (pending) return pending;

  const promise = (async () => {
    const safe = name.replace(/'/g, "\\'");
    const res = await drive.files.list({
      q: `name = '${safe}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id)',
      spaces: 'drive',
    });
    if (res.data.files.length > 0) return res.data.files[0].id;

    const folder = await drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      },
      fields: 'id',
    });
    return folder.data.id;
  })();

  _pendingFolders.set(key, promise);
  try {
    return await promise;
  } finally {
    _pendingFolders.delete(key);
  }
}

async function getOrCreateOsFolder({ empresa, pedido, item }) {
  const drive = _getDrive();
  const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

  const seq = String(item.ordem || item.id).padStart(2, '0');
  const empresaNome = sanitizeName(empresa.nome) + '_' + empresa.id;
  const pedidoNome  = 'P' + String(pedido.numero_sequencial || pedido.id).padStart(4, '0') +
                      '_' + (pedido.data_pedido || '').toString().slice(0, 10);
  const itemNome    = seq + '_' + sanitizeName(item.descricao || 'item') + '_' + item.id;

  const empresaId = await findOrCreateFolder(drive, empresaNome, rootId);
  const pedidoId  = await findOrCreateFolder(drive, pedidoNome, empresaId);
  const itemId    = await findOrCreateFolder(drive, itemNome, pedidoId);

  return itemId;
}

async function initiateResumableUpload({ folderId, fileName, mimeType, fileSize }) {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SA_KEY_JSON),
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();

  const body = JSON.stringify({ name: fileName, parents: [folderId] });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.googleapis.com',
      path: '/upload/drive/v3/files?uploadType=resumable',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(fileSize),
      },
    };
    const req = https.request(options, (res) => {
      if (res.statusCode === 200 && res.headers['location']) {
        res.resume();
        return resolve(res.headers['location']);
      }
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => reject(new Error(`Drive API ${res.statusCode}: ${data}`)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = {
  sanitizeName,
  findOrCreateFolder,
  getOrCreateOsFolder,
  initiateResumableUpload,
};
