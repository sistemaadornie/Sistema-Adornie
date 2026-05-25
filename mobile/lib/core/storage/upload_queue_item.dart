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
