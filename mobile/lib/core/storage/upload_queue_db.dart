import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart' as p;
import 'upload_queue_item.dart';

class UploadQueueDb {
  static Database? _db;

  static Future<Database> get _database async {
    _db ??= await _init();
    return _db!;
  }

  static Future<Database> _init() async {
    final dir = await getDatabasesPath();
    return openDatabase(
      p.join(dir, 'upload_queue.db'),
      version: 1,
      onCreate: (db, _) => db.execute('''
        CREATE TABLE upload_queue (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          local_path       TEXT    NOT NULL,
          pedido_id        INTEGER NOT NULL,
          pedido_item_id   INTEGER NOT NULL,
          os_id            INTEGER,
          tipo             TEXT    NOT NULL,
          mime_type        TEXT    NOT NULL,
          tamanho_bytes    INTEGER NOT NULL,
          hash_md5         TEXT,
          status           TEXT    NOT NULL DEFAULT 'pendente',
          upload_session_id TEXT,
          drive_upload_uri  TEXT,
          bytes_confirmados INTEGER NOT NULL DEFAULT 0,
          tentativas       INTEGER NOT NULL DEFAULT 0,
          erro_mensagem    TEXT,
          criado_em        TEXT    NOT NULL,
          atualizado_em    TEXT    NOT NULL
        )
      '''),
    );
  }

  static Future<int> insert(UploadQueueItem item) async {
    final db = await _database;
    return db.insert('upload_queue', item.toMap());
  }

  /// Retorna o próximo item pendente ou interrompido (FIFO).
  static Future<UploadQueueItem?> getNext() async {
    final db = await _database;
    final rows = await db.query(
      'upload_queue',
      where: "status IN ('pendente', 'interrompido')",
      orderBy: 'criado_em ASC',
      limit: 1,
    );
    return rows.isEmpty ? null : UploadQueueItem.fromMap(rows.first);
  }

  static Future<List<UploadQueueItem>> getAll() async {
    final db = await _database;
    final rows = await db.query('upload_queue', orderBy: 'criado_em DESC');
    return rows.map(UploadQueueItem.fromMap).toList();
  }

  static Future<void> updateStatus(
    int id,
    String status, {
    String? sessionId,
    String? uploadUri,
    String? erro,
  }) async {
    final db = await _database;
    await db.update(
      'upload_queue',
      {
        'status': status,
        if (sessionId != null) 'upload_session_id': sessionId,
        if (uploadUri != null) 'drive_upload_uri': uploadUri,
        if (erro != null) 'erro_mensagem': erro,
        'atualizado_em': DateTime.now().toIso8601String(),
      },
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  static Future<void> updateHash(int id, String hash) async {
    final db = await _database;
    await db.update(
      'upload_queue',
      {'hash_md5': hash, 'atualizado_em': DateTime.now().toIso8601String()},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  static Future<void> updateBytes(int id, int bytes) async {
    final db = await _database;
    await db.update(
      'upload_queue',
      {
        'bytes_confirmados': bytes,
        'atualizado_em': DateTime.now().toIso8601String(),
      },
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  static Future<void> incrementTentativas(int id) async {
    final db = await _database;
    await db.rawUpdate(
      'UPDATE upload_queue SET tentativas = tentativas + 1, atualizado_em = ? WHERE id = ?',
      [DateTime.now().toIso8601String(), id],
    );
  }

  /// Para testes — apaga todos os registros.
  static Future<void> clear() async {
    final db = await _database;
    await db.delete('upload_queue');
  }
}
