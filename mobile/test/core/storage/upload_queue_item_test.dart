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
