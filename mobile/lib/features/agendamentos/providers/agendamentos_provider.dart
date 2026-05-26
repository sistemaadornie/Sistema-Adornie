import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';
import '../../../core/auth/auth_provider.dart';
import '../models/agendamento_model.dart';

class AgendamentosState {
  final List<AgendamentoModel> items;
  final bool isLoading;
  final String? error;

  const AgendamentosState({
    this.items = const [],
    this.isLoading = false,
    this.error,
  });

  AgendamentosState copyWith({
    List<AgendamentoModel>? items,
    bool? isLoading,
    String? error,
  }) =>
      AgendamentosState(
        items: items ?? this.items,
        isLoading: isLoading ?? this.isLoading,
        error: error,
      );
}

class AgendamentosNotifier extends StateNotifier<AgendamentosState> {
  final ApiClient _client;

  AgendamentosNotifier(this._client) : super(const AgendamentosState()) {
    load();
  }

  Future<void> load() async {
    if (!mounted) return;
    state = state.copyWith(isLoading: true, error: null);
    try {
      final response = await _client.dio.get('/agendamentos');
      if (!mounted) return;
      final list = (response.data['agendamentos'] as List? ?? [])
          .map((e) => AgendamentoModel.fromJson(e as Map<String, dynamic>))
          .toList();
      state = state.copyWith(items: list, isLoading: false);
    } catch (e) {
      if (!mounted) return;
      state = state.copyWith(
        isLoading: false,
        error: 'Erro ao carregar agendamentos.',
      );
    }
  }

  Future<AgendamentoModel?> getById(int id) async {
    try {
      final response = await _client.dio.get('/agendamentos/$id');
      return AgendamentoModel.fromJson(
          response.data['agendamento'] as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<bool> create(Map<String, dynamic> data) async {
    try {
      await _client.dio.post('/agendamentos', data: data);
      if (!mounted) return false;
      await load();
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> update(int id, Map<String, dynamic> data) async {
    try {
      await _client.dio.put('/agendamentos/$id', data: data);
      if (!mounted) return false;
      await load();
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> cancel(int id) async {
    try {
      await _client.dio.delete('/agendamentos/$id');
      if (!mounted) return false;
      await load();
      return true;
    } catch (_) {
      return false;
    }
  }
}

final agendamentosProvider =
    StateNotifierProvider<AgendamentosNotifier, AgendamentosState>((ref) {
  final client = ref.read(apiClientProvider);
  ref.watch(authProvider); // re-create when auth changes
  return AgendamentosNotifier(client);
});
