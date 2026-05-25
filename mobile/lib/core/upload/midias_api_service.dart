import '../api/api_client.dart';
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
