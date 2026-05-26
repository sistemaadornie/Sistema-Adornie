import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';
import '../../../core/auth/auth_provider.dart';
import '../models/cliente_model.dart';

class ClientesState {
  final List<ClienteModel> items;
  final bool isLoading;
  final String? error;

  const ClientesState({
    this.items = const [],
    this.isLoading = false,
    this.error,
  });

  ClientesState copyWith({
    List<ClienteModel>? items,
    bool? isLoading,
    String? error,
  }) =>
      ClientesState(
        items: items ?? this.items,
        isLoading: isLoading ?? this.isLoading,
        error: error,
      );
}

class ClientesNotifier extends StateNotifier<ClientesState> {
  final ApiClient _client;

  ClientesNotifier(this._client) : super(const ClientesState()) {
    load();
  }

  Future<void> load({String? query}) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final response = await _client.dio.get(
        '/clientes',
        queryParameters: query != null && query.isNotEmpty ? {'q': query} : null,
      );
      final list = (response.data['clientes'] as List? ?? [])
          .map((e) => ClienteModel.fromJson(e as Map<String, dynamic>))
          .toList();
      state = state.copyWith(items: list, isLoading: false);
    } catch (_) {
      state = state.copyWith(
        isLoading: false,
        error: 'Erro ao carregar clientes.',
      );
    }
  }

  Future<ClienteModel?> getById(int id) async {
    try {
      final response = await _client.dio.get('/clientes/$id');
      return ClienteModel.fromJson(
          response.data['cliente'] as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<bool> create(Map<String, dynamic> data) async {
    try {
      await _client.dio.post('/clientes', data: data);
      await load();
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> update(int id, Map<String, dynamic> data) async {
    try {
      await _client.dio.put('/clientes/$id', data: data);
      await load();
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> delete(int id) async {
    try {
      await _client.dio.delete('/clientes/$id');
      state = state.copyWith(
        items: state.items.where((c) => c.id != id).toList(),
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> addEndereco(int clienteId, Map<String, dynamic> data) async {
    try {
      await _client.dio.post('/clientes/$clienteId/enderecos', data: data);
      return true;
    } catch (_) {
      return false;
    }
  }
}

final clientesProvider =
    StateNotifierProvider<ClientesNotifier, ClientesState>((ref) {
  final client = ref.read(apiClientProvider);
  ref.watch(authProvider);
  return ClientesNotifier(client);
});
