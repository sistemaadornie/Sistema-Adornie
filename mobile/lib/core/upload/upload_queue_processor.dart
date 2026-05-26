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
