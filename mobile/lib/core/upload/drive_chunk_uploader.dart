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
