# Google Drive Upload — Mobile Flutter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar no app Flutter (operon_mobile) o fluxo completo de captura de mídias em campo, fila offline-first com SQLite, upload em chunks direto ao Google Drive e telas de status com badges.

**Architecture:** O app salva cada mídia localmente no SQLite antes de qualquer tentativa de envio (offline-first). Um `UploadQueueProcessor` acorda quando a conectividade volta, calcula MD5, chama `POST /api/midias/iniciar` para obter o `drive_upload_uri`, envia os chunks direto ao Drive com `PUT` e `Content-Range`, e confirma no backend com `POST /api/midias/:id/confirmar`. Sessões interrompidas são retomadas a partir de `bytes_confirmados`. A UI exibe badges ⏳/📤/✅/❌ por item na fila.

**Tech Stack:** Flutter 3.19+, Dart 3.3+, sqflite (SQLite local), connectivity_plus (detecção de rede), crypto (MD5), flutter_riverpod (estado), dio (API backend), dart:io HttpClient (chunk upload raw para Drive), image_picker (câmera/galeria)

**Spec:** `docs/superpowers/specs/2026-05-24-google-drive-upload-design.md`

**Base:** App Flutter existente em `mobile/` com Riverpod, Dio, Go Router, image_picker já instalado.

---

## Mapa de Arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `mobile/pubspec.yaml` | Modificar | Adicionar sqflite, path, connectivity_plus, crypto |
| `mobile/lib/core/constants/api_constants.dart` | Modificar | Adicionar endpoints de midias/OS |
| `mobile/lib/core/storage/upload_queue_item.dart` | Criar | Model da fila local (SQLite row) |
| `mobile/lib/core/storage/upload_queue_db.dart` | Criar | Wrapper SQLite: init, insert, getPending, updateStatus, updateBytes |
| `mobile/lib/core/upload/md5_helper.dart` | Criar | Calcula MD5 de um File em stream |
| `mobile/lib/core/upload/drive_chunk_uploader.dart` | Criar | PUT chunks ao Drive com Content-Range, backoff, session expiry |
| `mobile/lib/core/upload/midias_api_service.dart` | Criar | Calls ao backend: iniciar, buscarStatus, confirmar, listarOrdens |
| `mobile/lib/core/upload/upload_queue_processor.dart` | Criar | Orquestra fases 1-5: hash → iniciar → chunks → confirmar → retomar |
| `mobile/lib/features/midias/models/os_model.dart` | Criar | Model de OrdemServico |
| `mobile/lib/features/midias/models/midia_queue_model.dart` | Criar | Model de item da fila para UI (com status badge) |
| `mobile/lib/features/midias/providers/midias_provider.dart` | Criar | Riverpod providers: ordens, queue, processor |
| `mobile/lib/features/midias/screens/os_list_screen.dart` | Criar | Tela: lista OS de um pedido com contagem de mídias |
| `mobile/lib/features/midias/screens/midia_upload_screen.dart` | Criar | Tela: câmera/galeria + fila de upload com badges |
| `mobile/test/core/storage/upload_queue_item_test.dart` | Criar | Testes unitários do model |
| `mobile/test/core/upload/drive_chunk_uploader_test.dart` | Criar | Testes unitários do uploader (mocking HttpClient) |

---

## Task 1: Adicionar dependências e constantes de API

**Files:**
- Modify: `mobile/pubspec.yaml`
- Modify: `mobile/lib/core/constants/api_constants.dart`

- [ ] **Passo 1: Adicionar pacotes ao pubspec.yaml**

Abrir `mobile/pubspec.yaml`. No bloco `dependencies:`, adicionar após `image_picker`:

```yaml
  # Upload de mídias offline-first
  sqflite: ^2.4.1
  path: ^1.9.0
  connectivity_plus: ^6.1.4
  crypto: ^3.0.6
```

- [ ] **Passo 2: Instalar pacotes**

```bash
cd mobile && flutter pub get
```

Esperado: saída sem erros, `pubspec.lock` atualizado.

- [ ] **Passo 3: Adicionar constantes de API em `mobile/lib/core/constants/api_constants.dart`**

Adicionar ao final da classe `ApiConstants`, antes do `}` de fechamento:

```dart
  // Mídias / Upload
  static const String midiasIniciar   = '/midias/iniciar';
  static String midiasStatus(String id)   => '/midias/$id/status';
  static String midiasConfirmar(String id) => '/midias/$id/confirmar';
  static String pedidoMidias(int id)   => '/pedidos/$id/midias';
  static String pedidoOs(int id)       => '/pedidos/$id/os';
  static String osMidias(int id)       => '/os/$id/midias';
  static const String ordens          = '/os';
  static String ordemStatus(int id)   => '/os/$id/status';
```

- [ ] **Passo 4: Verificar que o app compila**

```bash
cd mobile && flutter build apk --debug 2>&1 | tail -5
```

Esperado: `Built build/app/outputs/flutter-apk/app-debug.apk` ou similar sem erros de compilação.

- [ ] **Passo 5: Commitar**

```bash
cd mobile && git add pubspec.yaml pubspec.lock lib/core/constants/api_constants.dart
git commit -m "chore: adiciona sqflite, connectivity_plus, crypto ao mobile"
```

---

## Task 2: UploadQueueItem model + testes unitários

**Files:**
- Create: `mobile/lib/core/storage/upload_queue_item.dart`
- Create: `mobile/test/core/storage/upload_queue_item_test.dart`

- [ ] **Passo 1: Criar o arquivo de teste primeiro**

Criar `mobile/test/core/storage/upload_queue_item_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:operon_mobile/core/storage/upload_queue_item.dart';

void main() {
  final now = '2026-05-24T10:00:00.000';

  UploadQueueItem makeItem({String status = 'pendente'}) => UploadQueueItem(
    localPath: '/tmp/foto.jpg',
    pedidoId: 1,
    pedidoItemId: 5,
    tipo: 'foto',
    mimeType: 'image/jpeg',
    tamanhoBytes: 1024,
    status: status,
    criadoEm: now,
    atualizadoEm: now,
  );

  group('UploadQueueItem.toMap', () {
    test('serializa campos obrigatórios', () {
      final map = makeItem().toMap();
      expect(map['pedido_id'], 1);
      expect(map['tipo'], 'foto');
      expect(map['status'], 'pendente');
      expect(map['bytes_confirmados'], 0);
      expect(map['tentativas'], 0);
      expect(map.containsKey('id'), isFalse); // id nulo não inclui
    });

    test('serializa campos opcionais quando presentes', () {
      final item = makeItem().copyWith(osId: 3, hashMd5: 'abc123');
      final map = item.toMap();
      expect(map['os_id'], 3);
      expect(map['hash_md5'], 'abc123');
    });
  });

  group('UploadQueueItem.fromMap', () {
    test('desserializa todos os campos', () {
      final map = {
        'id': 1,
        'local_path': '/tmp/foto.jpg',
        'pedido_id': 1,
        'pedido_item_id': 5,
        'os_id': null,
        'tipo': 'foto',
        'mime_type': 'image/jpeg',
        'tamanho_bytes': 1024,
        'hash_md5': null,
        'status': 'pendente',
        'upload_session_id': null,
        'drive_upload_uri': null,
        'bytes_confirmados': 0,
        'tentativas': 0,
        'erro_mensagem': null,
        'criado_em': now,
        'atualizado_em': now,
      };
      final item = UploadQueueItem.fromMap(map);
      expect(item.id, 1);
      expect(item.pedidoId, 1);
      expect(item.status, 'pendente');
      expect(item.bytesConfirmados, 0);
    });
  });

  group('copyWith', () {
    test('cria cópia com status atualizado', () {
      final item = makeItem().copyWith(status: 'enviando', uploadSessionId: 'sess-uuid');
      expect(item.status, 'enviando');
      expect(item.uploadSessionId, 'sess-uuid');
      expect(item.pedidoId, 1); // inalterado
    });
  });
}
```

- [ ] **Passo 2: Rodar testes para confirmar que falham**

```bash
cd mobile && flutter test test/core/storage/upload_queue_item_test.dart
```

Esperado: `Error: Cannot find package 'operon_mobile/core/storage/upload_queue_item.dart'`

- [ ] **Passo 3: Criar `mobile/lib/core/storage/upload_queue_item.dart`**

```dart
class UploadQueueItem {
  final int? id;
  final String localPath;
  final int pedidoId;
  final int pedidoItemId;
  final int? osId;
  final String tipo; // foto | video
  final String mimeType;
  final int tamanhoBytes;
  final String? hashMd5;
  final String status; // pendente | enviando | enviado | erro | interrompido
  final String? uploadSessionId;
  final String? driveUploadUri;
  final int bytesConfirmados;
  final int tentativas;
  final String? erroMensagem;
  final String criadoEm;
  final String atualizadoEm;

  const UploadQueueItem({
    this.id,
    required this.localPath,
    required this.pedidoId,
    required this.pedidoItemId,
    this.osId,
    required this.tipo,
    required this.mimeType,
    required this.tamanhoBytes,
    this.hashMd5,
    this.status = 'pendente',
    this.uploadSessionId,
    this.driveUploadUri,
    this.bytesConfirmados = 0,
    this.tentativas = 0,
    this.erroMensagem,
    required this.criadoEm,
    required this.atualizadoEm,
  });

  factory UploadQueueItem.fromMap(Map<String, dynamic> m) => UploadQueueItem(
        id: m['id'] as int?,
        localPath: m['local_path'] as String,
        pedidoId: m['pedido_id'] as int,
        pedidoItemId: m['pedido_item_id'] as int,
        osId: m['os_id'] as int?,
        tipo: m['tipo'] as String,
        mimeType: m['mime_type'] as String,
        tamanhoBytes: m['tamanho_bytes'] as int,
        hashMd5: m['hash_md5'] as String?,
        status: m['status'] as String,
        uploadSessionId: m['upload_session_id'] as String?,
        driveUploadUri: m['drive_upload_uri'] as String?,
        bytesConfirmados: m['bytes_confirmados'] as int,
        tentativas: m['tentativas'] as int,
        erroMensagem: m['erro_mensagem'] as String?,
        criadoEm: m['criado_em'] as String,
        atualizadoEm: m['atualizado_em'] as String,
      );

  Map<String, dynamic> toMap() => {
        if (id != null) 'id': id,
        'local_path': localPath,
        'pedido_id': pedidoId,
        'pedido_item_id': pedidoItemId,
        if (osId != null) 'os_id': osId,
        'tipo': tipo,
        'mime_type': mimeType,
        'tamanho_bytes': tamanhoBytes,
        if (hashMd5 != null) 'hash_md5': hashMd5,
        'status': status,
        if (uploadSessionId != null) 'upload_session_id': uploadSessionId,
        if (driveUploadUri != null) 'drive_upload_uri': driveUploadUri,
        'bytes_confirmados': bytesConfirmados,
        'tentativas': tentativas,
        if (erroMensagem != null) 'erro_mensagem': erroMensagem,
        'criado_em': criadoEm,
        'atualizado_em': atualizadoEm,
      };

  UploadQueueItem copyWith({
    int? id,
    String? localPath,
    int? pedidoId,
    int? pedidoItemId,
    int? osId,
    String? tipo,
    String? mimeType,
    int? tamanhoBytes,
    String? hashMd5,
    String? status,
    String? uploadSessionId,
    String? driveUploadUri,
    int? bytesConfirmados,
    int? tentativas,
    String? erroMensagem,
    String? criadoEm,
    String? atualizadoEm,
  }) =>
      UploadQueueItem(
        id: id ?? this.id,
        localPath: localPath ?? this.localPath,
        pedidoId: pedidoId ?? this.pedidoId,
        pedidoItemId: pedidoItemId ?? this.pedidoItemId,
        osId: osId ?? this.osId,
        tipo: tipo ?? this.tipo,
        mimeType: mimeType ?? this.mimeType,
        tamanhoBytes: tamanhoBytes ?? this.tamanhoBytes,
        hashMd5: hashMd5 ?? this.hashMd5,
        status: status ?? this.status,
        uploadSessionId: uploadSessionId ?? this.uploadSessionId,
        driveUploadUri: driveUploadUri ?? this.driveUploadUri,
        bytesConfirmados: bytesConfirmados ?? this.bytesConfirmados,
        tentativas: tentativas ?? this.tentativas,
        erroMensagem: erroMensagem ?? this.erroMensagem,
        criadoEm: criadoEm ?? this.criadoEm,
        atualizadoEm: atualizadoEm ?? this.atualizadoEm,
      );
}
```

- [ ] **Passo 4: Rodar testes e verificar que passam**

```bash
cd mobile && flutter test test/core/storage/upload_queue_item_test.dart
```

Esperado: `All tests passed!` (5 testes)

- [ ] **Passo 5: Commitar**

```bash
cd mobile && git add lib/core/storage/upload_queue_item.dart test/core/storage/upload_queue_item_test.dart
git commit -m "feat: UploadQueueItem model com serialização e copyWith"
```

---

## Task 3: UploadQueueDb — SQLite local

**Files:**
- Create: `mobile/lib/core/storage/upload_queue_db.dart`

- [ ] **Passo 1: Criar `mobile/lib/core/storage/upload_queue_db.dart`**

```dart
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
```

- [ ] **Passo 2: Verificar que compila**

```bash
cd mobile && flutter build apk --debug 2>&1 | tail -5
```

Esperado: sem erros de compilação.

- [ ] **Passo 3: Commitar**

```bash
cd mobile && git add lib/core/storage/upload_queue_db.dart
git commit -m "feat: UploadQueueDb — SQLite wrapper para fila offline"
```

---

## Task 4: MD5 helper + MidiasApiService

**Files:**
- Create: `mobile/lib/core/upload/md5_helper.dart`
- Create: `mobile/lib/core/upload/midias_api_service.dart`

- [ ] **Passo 1: Criar `mobile/lib/core/upload/md5_helper.dart`**

```dart
import 'dart:io';
import 'package:crypto/crypto.dart';

/// Calcula hash MD5 de um arquivo em stream (sem carregar tudo em memória).
Future<String> computeMd5(File file) async {
  final stream = file.openRead();
  final digest = await md5.bind(stream).first;
  return digest.toString();
}
```

- [ ] **Passo 2: Criar `mobile/lib/core/upload/midias_api_service.dart`**

```dart
import '../../core/api/api_client.dart';
import '../constants/api_constants.dart';

class MidiasApiService {
  final ApiClient _client;

  MidiasApiService(this._client);

  /// Fase 2: inicia sessão resumível. Retorna {upload_session_id, drive_upload_uri, chunk_size}
  /// ou {duplicata: true, midia_id} quando arquivo já existe.
  Future<Map<String, dynamic>> iniciarUpload({
    required int pedidoId,
    required int pedidoItemId,
    int? osId,
    required String nomeArquivo,
    required int tamanhoBytes,
    required String mimeType,
    required String tipo,
    String? hashMd5,
  }) async {
    final response = await _client.dio.post(ApiConstants.midiasIniciar, data: {
      'pedido_id': pedidoId,
      'pedido_item_id': pedidoItemId,
      if (osId != null) 'ordem_servico_id': osId,
      'nome_arquivo': nomeArquivo,
      'tamanho_bytes': tamanhoBytes,
      'mime_type': mimeType,
      'tipo': tipo,
      if (hashMd5 != null) 'hash_md5': hashMd5,
    });
    return response.data as Map<String, dynamic>;
  }

  /// Fase 5: verifica estado da sessão no backend para retomada.
  Future<Map<String, dynamic>> buscarStatus(String sessionId) async {
    final response = await _client.dio.get(ApiConstants.midiasStatus(sessionId));
    return response.data as Map<String, dynamic>;
  }

  /// Fase 4: confirma upload concluído e persiste em pedido_midias.
  Future<Map<String, dynamic>> confirmar(
    String sessionId, {
    required String driveFileId,
    required String driveUrl,
    int? duracaoSegundos,
  }) async {
    final response = await _client.dio.post(
      ApiConstants.midiasConfirmar(sessionId),
      data: {
        'drive_file_id': driveFileId,
        'drive_url': driveUrl,
        if (duracaoSegundos != null) 'duracao_segundos': duracaoSegundos,
      },
    );
    return response.data as Map<String, dynamic>;
  }

  /// Lista ordens de serviço de um pedido com contagem de mídias.
  Future<List<Map<String, dynamic>>> listarOrdens(int pedidoId) async {
    final response = await _client.dio.get(ApiConstants.pedidoOs(pedidoId));
    return (response.data as List).cast<Map<String, dynamic>>();
  }

  /// Lista mídias de um pedido com filtros opcionais.
  Future<List<Map<String, dynamic>>> listarMidias(
    int pedidoId, {
    int? itemId,
    int? osId,
    String? tipo,
  }) async {
    final response = await _client.dio.get(
      ApiConstants.pedidoMidias(pedidoId),
      queryParameters: {
        if (itemId != null) 'item_id': itemId,
        if (osId != null) 'os_id': osId,
        if (tipo != null) 'tipo': tipo,
      },
    );
    return (response.data as List).cast<Map<String, dynamic>>();
  }
}
```

- [ ] **Passo 3: Verificar que compila**

```bash
cd mobile && flutter build apk --debug 2>&1 | tail -5
```

Esperado: sem erros.

- [ ] **Passo 4: Commitar**

```bash
cd mobile && git add lib/core/upload/md5_helper.dart lib/core/upload/midias_api_service.dart
git commit -m "feat: MD5 helper e MidiasApiService"
```

---

## Task 5: DriveChunkUploader + testes

**Files:**
- Create: `mobile/lib/core/upload/drive_chunk_uploader.dart`
- Create: `mobile/test/core/upload/drive_chunk_uploader_test.dart`

- [ ] **Passo 1: Criar o arquivo de teste primeiro**

Criar `mobile/test/core/upload/drive_chunk_uploader_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:operon_mobile/core/upload/drive_chunk_uploader.dart';

void main() {
  group('contentRangeHeader', () {
    test('formato correto para chunk intermediário', () {
      final header = contentRangeHeader(start: 0, end: 5242879, total: 10000000);
      expect(header, 'bytes 0-5242879/10000000');
    });

    test('formato correto para último chunk', () {
      final header = contentRangeHeader(start: 5242880, end: 9999999, total: 10000000);
      expect(header, 'bytes 5242880-9999999/10000000');
    });
  });

  group('backoffDelay', () {
    test('aumenta exponencialmente', () {
      expect(backoffDelay(0).inSeconds, 1);
      expect(backoffDelay(1).inSeconds, 2);
      expect(backoffDelay(2).inSeconds, 4);
      expect(backoffDelay(3).inSeconds, 8);
    });

    test('limita em 60 segundos', () {
      expect(backoffDelay(10).inSeconds, 60);
    });
  });
}
```

- [ ] **Passo 2: Rodar teste para confirmar que falha**

```bash
cd mobile && flutter test test/core/upload/drive_chunk_uploader_test.dart
```

Esperado: `Error: Cannot find package 'operon_mobile/core/upload/drive_chunk_uploader.dart'`

- [ ] **Passo 3: Criar `mobile/lib/core/upload/drive_chunk_uploader.dart`**

```dart
import 'dart:convert';
import 'dart:io';
import 'dart:math';

const int kChunkSize = 5 * 1024 * 1024; // 5 MB

/// Formata o header Content-Range para PUT ao Drive.
String contentRangeHeader({required int start, required int end, required int total}) =>
    'bytes $start-$end/$total';

/// Delay de backoff exponencial, máximo 60s.
Duration backoffDelay(int retry) =>
    Duration(seconds: min(pow(2, retry).toInt(), 60));

/// Resultado de um upload completo.
typedef DriveUploadResult = ({String fileId, String webViewLink});

/// Exceção: sessão Drive expirou (HTTP 404 no uploadUri).
class DriveSessionExpiredException implements Exception {
  const DriveSessionExpiredException();
  @override
  String toString() => 'DriveSessionExpiredException: uploadUri expirou';
}

/// Exceção: erro irrecuperável no upload.
class DriveUploadException implements Exception {
  final String message;
  const DriveUploadException(this.message);
  @override
  String toString() => 'DriveUploadException: $message';
}

/// Envia um arquivo ao Drive em chunks de [kChunkSize] bytes.
/// Suporta retomada a partir de [startByte].
/// Chama [onProgress] com o total de bytes confirmados após cada chunk.
Future<DriveUploadResult> uploadToDrive({
  required String uploadUri,
  required File file,
  required String mimeType,
  int startByte = 0,
  void Function(int bytesConfirmados)? onProgress,
}) async {
  final fileSize = await file.length();
  int offset = startByte;
  final client = HttpClient();

  try {
    while (offset < fileSize) {
      final end = min(offset + kChunkSize, fileSize) - 1;
      final chunkLen = end - offset + 1;

      final bytes = await _readChunk(file, offset, chunkLen);

      final result = await _sendChunk(
        client: client,
        uri: uploadUri,
        mimeType: mimeType,
        bytes: bytes,
        start: offset,
        end: end,
        total: fileSize,
      );

      if (result != null) return result;

      offset = end + 1;
      onProgress?.call(offset);
    }
  } finally {
    client.close();
  }

  throw const DriveUploadException('Upload loop terminou sem resposta 200/201 do Drive');
}

Future<List<int>> _readChunk(File file, int offset, int length) async {
  final raf = await file.open();
  try {
    await raf.setPosition(offset);
    return await raf.read(length);
  } finally {
    await raf.close();
  }
}

/// Retorna [DriveUploadResult] se o upload concluiu (200/201), null se 308 (continua).
/// Lança [DriveSessionExpiredException] se 404, [DriveUploadException] para outros erros.
Future<DriveUploadResult?> _sendChunk({
  required HttpClient client,
  required String uri,
  required String mimeType,
  required List<int> bytes,
  required int start,
  required int end,
  required int total,
  int retry = 0,
}) async {
  try {
    final request = await client.putUrl(Uri.parse(uri));
    request.headers
      ..set('Content-Type', mimeType)
      ..set('Content-Range', contentRangeHeader(start: start, end: end, total: total))
      ..set('Content-Length', bytes.length.toString());
    request.add(bytes);
    final response = await request.close();

    if (response.statusCode == 308) {
      await response.drain<void>();
      return null; // continua
    }

    if (response.statusCode == 200 || response.statusCode == 201) {
      final body = await response.transform(utf8.decoder).join();
      final json = jsonDecode(body) as Map<String, dynamic>;
      return (
        fileId: json['id'] as String,
        webViewLink: (json['webViewLink'] ?? json['webContentLink'] ?? '') as String,
      );
    }

    if (response.statusCode == 404) {
      await response.drain<void>();
      throw const DriveSessionExpiredException();
    }

    final body = await response.transform(utf8.decoder).join();

    if (response.statusCode >= 500 && retry < 4) {
      await Future<void>.delayed(backoffDelay(retry));
      return _sendChunk(
        client: client, uri: uri, mimeType: mimeType, bytes: bytes,
        start: start, end: end, total: total, retry: retry + 1,
      );
    }

    throw DriveUploadException('HTTP ${response.statusCode}: $body');
  } on SocketException {
    if (retry < 4) {
      await Future<void>.delayed(backoffDelay(retry));
      return _sendChunk(
        client: client, uri: uri, mimeType: mimeType, bytes: bytes,
        start: start, end: end, total: total, retry: retry + 1,
      );
    }
    rethrow;
  }
}
```

- [ ] **Passo 4: Rodar testes e verificar que passam**

```bash
cd mobile && flutter test test/core/upload/drive_chunk_uploader_test.dart
```

Esperado: `All tests passed!` (4 testes)

- [ ] **Passo 5: Commitar**

```bash
cd mobile && git add lib/core/upload/drive_chunk_uploader.dart test/core/upload/drive_chunk_uploader_test.dart
git commit -m "feat: DriveChunkUploader com backoff exponencial e session expiry"
```

---

## Task 6: UploadQueueProcessor — orquestrador das 5 fases

**Files:**
- Create: `mobile/lib/core/upload/upload_queue_processor.dart`

- [ ] **Passo 1: Criar `mobile/lib/core/upload/upload_queue_processor.dart`**

```dart
import 'dart:io';
import 'package:connectivity_plus/connectivity_plus.dart';
import '../storage/upload_queue_db.dart';
import '../storage/upload_queue_item.dart';
import 'drive_chunk_uploader.dart';
import 'md5_helper.dart';
import 'midias_api_service.dart';

class UploadQueueProcessor {
  final MidiasApiService _api;
  bool _running = false;

  UploadQueueProcessor(this._api);

  /// Inicia listener de conectividade. Chame uma vez ao iniciar o app.
  void startListening() {
    Connectivity().onConnectivityChanged.listen((results) {
      final connected = results.any((r) =>
          r == ConnectivityResult.mobile ||
          r == ConnectivityResult.wifi ||
          r == ConnectivityResult.ethernet);
      if (connected && !_running) {
        processQueue();
      }
    });
  }

  /// Processa todos os itens pendentes/interrompidos em sequência.
  Future<void> processQueue() async {
    if (_running) return;
    _running = true;
    try {
      while (true) {
        final item = await UploadQueueDb.getNext();
        if (item == null) break;
        await _processItem(item);
      }
    } finally {
      _running = false;
    }
  }

  Future<void> _processItem(UploadQueueItem item) async {
    try {
      // Verificar se arquivo local existe
      final file = File(item.localPath);
      if (!file.existsSync()) {
        await UploadQueueDb.updateStatus(
          item.id!, 'erro', erro: 'Arquivo local não encontrado: ${item.localPath}');
        return;
      }

      // Fase 1: calcular MD5 se ainda não calculado
      final hash = item.hashMd5 ?? await computeMd5(file);
      if (item.hashMd5 == null) {
        await UploadQueueDb.updateHash(item.id!, hash);
      }

      String sessionId;
      String uploadUri;
      int startByte = 0;

      // Fase 5: retomar sessão existente
      if (item.uploadSessionId != null && item.driveUploadUri != null) {
        final statusData = await _api.buscarStatus(item.uploadSessionId!);
        final expiresAt = DateTime.parse(statusData['expira_em'] as String);

        if (expiresAt.isBefore(DateTime.now())) {
          // Sessão expirada — recomeçar do zero
          await UploadQueueDb.updateStatus(item.id!, 'pendente');
          return;
        }

        sessionId = item.uploadSessionId!;
        uploadUri = item.driveUploadUri!;
        startByte = item.bytesConfirmados;
      } else {
        // Fase 2: criar nova sessão no backend
        final nomeArquivo = file.path.split(Platform.pathSeparator).last;
        final initData = await _api.iniciarUpload(
          pedidoId: item.pedidoId,
          pedidoItemId: item.pedidoItemId,
          osId: item.osId,
          nomeArquivo: nomeArquivo,
          tamanhoBytes: item.tamanhoBytes,
          mimeType: item.mimeType,
          tipo: item.tipo,
          hashMd5: hash,
        );

        // Deduplicação: arquivo já existe no Drive
        if (initData['duplicata'] == true) {
          await UploadQueueDb.updateStatus(item.id!, 'enviado');
          return;
        }

        sessionId = initData['upload_session_id'] as String;
        uploadUri = initData['drive_upload_uri'] as String;

        await UploadQueueDb.updateStatus(
          item.id!, 'enviando',
          sessionId: sessionId,
          uploadUri: uploadUri,
        );
      }

      // Fase 3: enviar chunks direto ao Drive
      final result = await uploadToDrive(
        uploadUri: uploadUri,
        file: file,
        mimeType: item.mimeType,
        startByte: startByte,
        onProgress: (bytes) => UploadQueueDb.updateBytes(item.id!, bytes),
      );

      // Fase 4: confirmar no backend
      await _api.confirmar(
        sessionId,
        driveFileId: result.fileId,
        driveUrl: result.webViewLink,
      );

      await UploadQueueDb.updateStatus(item.id!, 'enviado');
    } on DriveSessionExpiredException {
      // Sessão expirou durante o upload — resetar para pendente
      await UploadQueueDb.updateStatus(item.id!, 'pendente');
    } catch (e) {
      await UploadQueueDb.incrementTentativas(item.id!);
      await UploadQueueDb.updateStatus(item.id!, 'erro', erro: e.toString());
    }
  }
}
```

- [ ] **Passo 2: Verificar que compila**

```bash
cd mobile && flutter build apk --debug 2>&1 | tail -5
```

Esperado: sem erros.

- [ ] **Passo 3: Commitar**

```bash
cd mobile && git add lib/core/upload/upload_queue_processor.dart
git commit -m "feat: UploadQueueProcessor — orquestra as 5 fases de upload"
```

---

## Task 7: OsModel, providers Riverpod e inicialização

**Files:**
- Create: `mobile/lib/features/midias/models/os_model.dart`
- Create: `mobile/lib/features/midias/providers/midias_provider.dart`
- Modify: `mobile/lib/app.dart` (ou onde o ProviderScope é criado — adicionar inicialização do processor)

- [ ] **Passo 1: Criar `mobile/lib/features/midias/models/os_model.dart`**

```dart
class OsModel {
  final int id;
  final int pedidoItemId;
  final String itemDescricao;
  final String status; // aberta | em_andamento | aguardando_aprovacao | encerrada
  final String? responsavelNome;
  final String abertaEm;
  final String? encerradaEm;
  final int totalFotos;
  final int totalVideos;

  const OsModel({
    required this.id,
    required this.pedidoItemId,
    required this.itemDescricao,
    required this.status,
    this.responsavelNome,
    required this.abertaEm,
    this.encerradaEm,
    this.totalFotos = 0,
    this.totalVideos = 0,
  });

  factory OsModel.fromJson(Map<String, dynamic> j) => OsModel(
        id: j['id'] as int,
        pedidoItemId: j['pedido_item_id'] as int? ?? 0,
        itemDescricao: j['item_descricao'] as String? ?? '',
        status: j['status'] as String,
        responsavelNome: j['responsavel_nome'] as String?,
        abertaEm: j['aberta_em'] as String? ?? '',
        encerradaEm: j['encerrada_em'] as String?,
        totalFotos: int.tryParse(j['total_fotos']?.toString() ?? '0') ?? 0,
        totalVideos: int.tryParse(j['total_videos']?.toString() ?? '0') ?? 0,
      );

  int get totalMidias => totalFotos + totalVideos;
}
```

- [ ] **Passo 2: Criar `mobile/lib/features/midias/providers/midias_provider.dart`**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';
import '../../../core/auth/auth_provider.dart';
import '../../../core/storage/upload_queue_db.dart';
import '../../../core/storage/upload_queue_item.dart';
import '../../../core/upload/midias_api_service.dart';
import '../../../core/upload/upload_queue_processor.dart';
import '../models/os_model.dart';

// ── Providers de infraestrutura ──────────────────────────────────────────────

final midiasApiProvider = Provider<MidiasApiService>((ref) {
  final client = ref.watch(apiClientProvider);
  return MidiasApiService(client);
});

final processorProvider = Provider<UploadQueueProcessor>((ref) {
  final api = ref.watch(midiasApiProvider);
  return UploadQueueProcessor(api);
});

// ── Ordens de serviço de um pedido ──────────────────────────────────────────

class OrdensState {
  final List<OsModel> items;
  final bool isLoading;
  final String? error;

  const OrdensState({this.items = const [], this.isLoading = false, this.error});

  OrdensState copyWith({List<OsModel>? items, bool? isLoading, String? error}) =>
      OrdensState(
        items: items ?? this.items,
        isLoading: isLoading ?? this.isLoading,
        error: error,
      );
}

class OrdensNotifier extends StateNotifier<OrdensState> {
  final MidiasApiService _api;
  final int pedidoId;

  OrdensNotifier(this._api, this.pedidoId) : super(const OrdensState()) {
    load();
  }

  Future<void> load() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final data = await _api.listarOrdens(pedidoId);
      state = state.copyWith(
        isLoading: false,
        items: data.map(OsModel.fromJson).toList(),
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }
}

final ordensProvider =
    StateNotifierProvider.family<OrdensNotifier, OrdensState, int>(
  (ref, pedidoId) => OrdensNotifier(ref.watch(midiasApiProvider), pedidoId),
);

// ── Fila local de upload ─────────────────────────────────────────────────────

class QueueState {
  final List<UploadQueueItem> items;
  final bool isLoading;

  const QueueState({this.items = const [], this.isLoading = false});
  QueueState copyWith({List<UploadQueueItem>? items, bool? isLoading}) =>
      QueueState(items: items ?? this.items, isLoading: isLoading ?? this.isLoading);
}

class QueueNotifier extends StateNotifier<QueueState> {
  QueueNotifier() : super(const QueueState()) {
    refresh();
  }

  Future<void> refresh() async {
    state = state.copyWith(isLoading: true);
    final items = await UploadQueueDb.getAll();
    state = QueueState(items: items);
  }

  Future<void> enqueue(UploadQueueItem item) async {
    await UploadQueueDb.insert(item);
    await refresh();
  }
}

final queueProvider = StateNotifierProvider<QueueNotifier, QueueState>(
  (_) => QueueNotifier(),
);
```

- [ ] **Passo 3: Inicializar o processor em `mobile/lib/app.dart`**

Abrir `mobile/lib/app.dart`. Encontrar a classe principal do app (provavelmente `OperonApp` ou `MaterialApp`) e localizar onde o widget tree é iniciado.

Adicionar ao topo do arquivo:
```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'features/midias/providers/midias_provider.dart';
```

Dentro do `build` do widget raiz (após `ProviderScope` ou dentro de um `ConsumerWidget`), garantir que o processor seja iniciado uma vez. A forma mais simples é num `ConsumerStatefulWidget` que chama `startListening` no `initState`:

Criar `mobile/lib/core/upload/processor_initializer.dart`:
```dart
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../features/midias/providers/midias_provider.dart';

class ProcessorInitializer extends ConsumerStatefulWidget {
  final Widget child;
  const ProcessorInitializer({required this.child, super.key});

  @override
  ConsumerState<ProcessorInitializer> createState() => _ProcessorInitializerState();
}

class _ProcessorInitializerState extends ConsumerState<ProcessorInitializer> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(processorProvider).startListening();
    });
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
```

Em `mobile/lib/app.dart`, envolver o widget raiz com `ProcessorInitializer`:
```dart
import 'core/upload/processor_initializer.dart';

// No build method, envolver o MaterialApp/GoRouter:
return ProcessorInitializer(child: MaterialApp.router(...));
```

- [ ] **Passo 4: Verificar que compila**

```bash
cd mobile && flutter build apk --debug 2>&1 | tail -5
```

Esperado: sem erros.

- [ ] **Passo 5: Commitar**

```bash
cd mobile && git add lib/features/midias/models/os_model.dart lib/features/midias/providers/midias_provider.dart lib/core/upload/processor_initializer.dart lib/app.dart
git commit -m "feat: OsModel, providers Riverpod e inicialização do processor"
```

---

## Task 8: Tela de listagem de OS (OsListScreen)

**Files:**
- Create: `mobile/lib/features/midias/screens/os_list_screen.dart`

- [ ] **Passo 1: Criar `mobile/lib/features/midias/screens/os_list_screen.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../models/os_model.dart';
import '../providers/midias_provider.dart';

class OsListScreen extends ConsumerWidget {
  final int pedidoId;
  const OsListScreen({required this.pedidoId, super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(ordensProvider(pedidoId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Ordens de Serviço'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.read(ordensProvider(pedidoId).notifier).load(),
          ),
        ],
      ),
      body: _buildBody(context, state),
    );
  }

  Widget _buildBody(BuildContext context, OrdensState state) {
    if (state.isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (state.error != null) {
      return Center(child: Text('Erro: ${state.error}', style: const TextStyle(color: Colors.red)));
    }
    if (state.items.isEmpty) {
      return const Center(child: Text('Nenhuma ordem de serviço encontrada.'));
    }
    return RefreshIndicator(
      onRefresh: () async {},
      child: ListView.separated(
        itemCount: state.items.length,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (context, i) => _OsTile(os: state.items[i], pedidoId: pedidoId),
      ),
    );
  }
}

class _OsTile extends StatelessWidget {
  final OsModel os;
  final int pedidoId;
  const _OsTile({required this.os, required this.pedidoId});

  Color _statusColor() => switch (os.status) {
        'aberta' => Colors.orange,
        'em_andamento' => Colors.blue,
        'aguardando_aprovacao' => Colors.purple,
        'encerrada' => Colors.green,
        _ => Colors.grey,
      };

  String _statusLabel() => switch (os.status) {
        'aberta' => 'Aberta',
        'em_andamento' => 'Em andamento',
        'aguardando_aprovacao' => 'Aguard. aprovação',
        'encerrada' => 'Encerrada',
        _ => os.status,
      };

  @override
  Widget build(BuildContext context) {
    return ListTile(
      title: Text(os.itemDescricao, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (os.responsavelNome != null) Text('Responsável: ${os.responsavelNome}'),
          Row(children: [
            const Icon(Icons.photo, size: 14),
            Text(' ${os.totalFotos}  '),
            const Icon(Icons.videocam, size: 14),
            Text(' ${os.totalVideos}'),
          ]),
        ],
      ),
      trailing: Chip(
        label: Text(_statusLabel(),
            style: const TextStyle(fontSize: 11, color: Colors.white)),
        backgroundColor: _statusColor(),
        padding: EdgeInsets.zero,
        visualDensity: VisualDensity.compact,
      ),
      onTap: () => context.push('/midias/$pedidoId/os/${os.id}'),
    );
  }
}
```

- [ ] **Passo 2: Verificar que compila**

```bash
cd mobile && flutter build apk --debug 2>&1 | tail -5
```

Esperado: sem erros.

- [ ] **Passo 3: Commitar**

```bash
cd mobile && git add lib/features/midias/screens/os_list_screen.dart
git commit -m "feat: OsListScreen com status badge e contador de mídias"
```

---

## Task 9: Tela de upload de mídias (MidiaUploadScreen)

**Files:**
- Create: `mobile/lib/features/midias/screens/midia_upload_screen.dart`

- [ ] **Passo 1: Criar `mobile/lib/features/midias/screens/midia_upload_screen.dart`**

```dart
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/storage/upload_queue_item.dart';
import '../providers/midias_provider.dart';

class MidiaUploadScreen extends ConsumerWidget {
  final int pedidoId;
  final int pedidoItemId;
  final int? osId;

  const MidiaUploadScreen({
    required this.pedidoId,
    required this.pedidoItemId,
    this.osId,
    super.key,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final queueState = ref.watch(queueProvider);

    // Filtra itens desta OS
    final meuItens = queueState.items
        .where((i) =>
            i.pedidoId == pedidoId &&
            i.pedidoItemId == pedidoItemId)
        .toList();

    return Scaffold(
      appBar: AppBar(title: const Text('Mídias da OS')),
      body: Column(
        children: [
          Expanded(
            child: meuItens.isEmpty
                ? const Center(child: Text('Nenhuma mídia na fila.\nUse os botões abaixo para adicionar.', textAlign: TextAlign.center))
                : ListView.separated(
                    itemCount: meuItens.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (_, i) => _QueueTile(item: meuItens[i]),
                  ),
          ),
          _ActionBar(
            onPickGallery: () => _pick(context, ref, ImageSource.gallery),
            onPickCamera: () => _pick(context, ref, ImageSource.camera),
            onRetry: () {
              ref.read(processorProvider).processQueue();
              ref.read(queueProvider.notifier).refresh();
            },
          ),
        ],
      ),
    );
  }

  Future<void> _pick(BuildContext context, WidgetRef ref, ImageSource source) async {
    final picker = ImagePicker();
    final picked = await picker.pickMultipleMedia();
    if (picked.isEmpty) return;

    final now = DateTime.now().toIso8601String();
    for (final xFile in picked) {
      final file = File(xFile.path);
      final stat = await file.stat();
      final ext = xFile.name.split('.').last.toLowerCase();
      final tipo = ['mp4', 'mov', 'avi', 'mkv', 'webm'].contains(ext) ? 'video' : 'foto';
      final mime = tipo == 'video' ? 'video/mp4' : 'image/jpeg';

      final item = UploadQueueItem(
        localPath: xFile.path,
        pedidoId: pedidoId,
        pedidoItemId: pedidoItemId,
        osId: osId,
        tipo: tipo,
        mimeType: mime,
        tamanhoBytes: stat.size,
        criadoEm: now,
        atualizadoEm: now,
      );
      await ref.read(queueProvider.notifier).enqueue(item);
    }

    // Acionar processamento imediatamente
    ref.read(processorProvider).processQueue();
  }
}

class _QueueTile extends StatelessWidget {
  final UploadQueueItem item;
  const _QueueTile({required this.item});

  (IconData, Color, String) get _statusInfo => switch (item.status) {
        'pendente' => (Icons.hourglass_empty, Colors.orange, '⏳ Pendente'),
        'enviando' => (Icons.upload, Colors.blue, '📤 Enviando'),
        'enviado' => (Icons.check_circle, Colors.green, '✅ Enviado'),
        'erro' => (Icons.error_outline, Colors.red, '❌ Erro'),
        'interrompido' => (Icons.pause_circle_outline, Colors.amber, '⏸ Interrompido'),
        _ => (Icons.help_outline, Colors.grey, item.status),
      };

  @override
  Widget build(BuildContext context) {
    final (icon, color, label) = _statusInfo;
    final progress = item.tamanhoBytes > 0
        ? item.bytesConfirmados / item.tamanhoBytes
        : 0.0;

    return ListTile(
      leading: Icon(icon, color: color),
      title: Text(
        item.localPath.split(Platform.pathSeparator).last,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('$label  •  ${item.tipo}  •  ${_formatBytes(item.tamanhoBytes)}'),
          if (item.status == 'enviando' && progress > 0)
            LinearProgressIndicator(value: progress),
          if (item.erroMensagem != null)
            Text(item.erroMensagem!, style: const TextStyle(color: Colors.red, fontSize: 11)),
        ],
      ),
      isThreeLine: item.status == 'enviando' || item.erroMensagem != null,
    );
  }

  String _formatBytes(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / 1024 / 1024).toStringAsFixed(1)} MB';
  }
}

class _ActionBar extends StatelessWidget {
  final VoidCallback onPickGallery;
  final VoidCallback onPickCamera;
  final VoidCallback onRetry;

  const _ActionBar({
    required this.onPickGallery,
    required this.onPickCamera,
    required this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(children: [
          Expanded(
            child: FilledButton.icon(
              onPressed: onPickCamera,
              icon: const Icon(Icons.camera_alt),
              label: const Text('Câmera'),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: FilledButton.icon(
              onPressed: onPickGallery,
              icon: const Icon(Icons.photo_library),
              label: const Text('Galeria'),
            ),
          ),
          const SizedBox(width: 8),
          IconButton.outlined(
            onPressed: onRetry,
            icon: const Icon(Icons.replay),
            tooltip: 'Reprocessar fila',
          ),
        ]),
      ),
    );
  }
}
```

- [ ] **Passo 2: Verificar que compila**

```bash
cd mobile && flutter build apk --debug 2>&1 | tail -5
```

Esperado: sem erros.

- [ ] **Passo 3: Commitar**

```bash
cd mobile && git add lib/features/midias/screens/midia_upload_screen.dart
git commit -m "feat: MidiaUploadScreen com câmera/galeria, badges e fila"
```

---

## Task 10: Navegação — registrar rotas e permissões Android/iOS

**Files:**
- Modify: `mobile/lib/app.dart` (registrar rotas Go Router)
- Modify: `mobile/android/app/src/main/AndroidManifest.xml` (permissões de câmera/armazenamento)
- Modify: `mobile/ios/Runner/Info.plist` (descrições de uso de câmera/fotos)

- [ ] **Passo 1: Registrar as duas novas rotas no Go Router**

Abrir `mobile/lib/app.dart`. Encontrar onde as rotas GoRouter são definidas (lista de `GoRoute`). Adicionar:

```dart
import 'features/midias/screens/os_list_screen.dart';
import 'features/midias/screens/midia_upload_screen.dart';

// Dentro da lista de rotas:
GoRoute(
  path: '/midias/:pedidoId/os',
  builder: (context, state) => OsListScreen(
    pedidoId: int.parse(state.pathParameters['pedidoId']!),
  ),
),
GoRoute(
  path: '/midias/:pedidoId/os/:osId',
  builder: (context, state) => MidiaUploadScreen(
    pedidoId: int.parse(state.pathParameters['pedidoId']!),
    pedidoItemId: int.parse(state.uri.queryParameters['itemId'] ?? '0'),
    osId: int.tryParse(state.pathParameters['osId']!),
  ),
),
```

- [ ] **Passo 2: Adicionar permissões no AndroidManifest.xml**

Abrir `mobile/android/app/src/main/AndroidManifest.xml`. Dentro de `<manifest>`, antes de `<application>`, garantir que existem:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
<uses-permission android:name="android.permission.INTERNET" />
```

- [ ] **Passo 3: Adicionar descrições no Info.plist (iOS)**

Abrir `mobile/ios/Runner/Info.plist`. Dentro de `<dict>`, adicionar se não existirem:

```xml
<key>NSCameraUsageDescription</key>
<string>Necessário para fotografar e filmar instalações em campo.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>Necessário para selecionar fotos e vídeos da galeria.</string>
```

- [ ] **Passo 4: Build de verificação final**

```bash
cd mobile && flutter build apk --debug 2>&1 | tail -5
```

Esperado: `Built build/app/outputs/flutter-apk/app-debug.apk` sem erros.

- [ ] **Passo 5: Rodar todos os testes**

```bash
cd mobile && flutter test 2>&1 | tail -10
```

Esperado: todos os testes passam.

- [ ] **Passo 6: Commitar**

```bash
cd mobile && git add lib/app.dart android/app/src/main/AndroidManifest.xml ios/Runner/Info.plist
git commit -m "feat: rotas /midias e permissões de câmera/galeria"
```

---

## Notas para Sprint 4 (Resiliência — Plano 3)

O próximo plano cobrirá:
- Background upload com `flutter_background_service` (persiste quando app vai para segundo plano)
- Job noturno: marcar sessões `upload_sessions` expiradas no banco via endpoint `PATCH /api/admin/sessions/expirar`
- Retry automático com backoff nas tentativas de erro (atualmente só marca `erro`, não reagenda)
- Testes de campo simulando 3G intermitente com throttling no emulador
- Tela de histórico de mídias por pedido com pré-visualização via `drive_url`

Antes de iniciar o Plano 3, testar o Plano 2 manualmente num dispositivo real ou emulador Android com as variáveis de ambiente do backend configuradas.
