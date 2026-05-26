import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';
import '../../../core/auth/auth_provider.dart';
import '../models/notificacao_model.dart';

class NotificacoesState {
  final List<NotificacaoModel> items;
  final bool isLoading;
  final String? error;

  const NotificacoesState({
    this.items = const [],
    this.isLoading = false,
    this.error,
  });

  NotificacoesState copyWith({
    List<NotificacaoModel>? items,
    bool? isLoading,
    String? error,
  }) =>
      NotificacoesState(
        items: items ?? this.items,
        isLoading: isLoading ?? this.isLoading,
        error: error,
      );

  int get unreadCount => items.where((n) => !n.lida).length;
}

class NotificacoesNotifier extends StateNotifier<NotificacoesState> {
  final ApiClient _client;

  NotificacoesNotifier(this._client) : super(const NotificacoesState()) {
    load();
  }

  Future<void> load() async {
    if (!mounted) return;
    state = state.copyWith(isLoading: true, error: null);
    try {
      final response = await _client.dio.get('/notificacoes');
      if (!mounted) return;
      final list = (response.data['notificacoes'] as List? ?? [])
          .map((e) => NotificacaoModel.fromJson(e as Map<String, dynamic>))
          .toList();
      state = state.copyWith(items: list, isLoading: false);
    } catch (_) {
      if (!mounted) return;
      state = state.copyWith(isLoading: false, error: 'Erro ao carregar notificações.');
    }
  }

  Future<void> markAsRead(int id) async {
    try {
      await _client.dio.post('/notificacoes/$id/marcar-como-lido');
      if (!mounted) return;
      state = state.copyWith(
        items: state.items
            .map((n) => n.id == id ? n.copyWith(lida: true) : n)
            .toList(),
      );
    } catch (_) {}
  }

  Future<void> delete(int id) async {
    try {
      await _client.dio.delete('/notificacoes/$id');
      if (!mounted) return;
      state = state.copyWith(
        items: state.items.where((n) => n.id != id).toList(),
      );
    } catch (_) {}
  }
}

final notificacoesProvider =
    StateNotifierProvider<NotificacoesNotifier, NotificacoesState>((ref) {
  final client = ref.read(apiClientProvider);
  ref.watch(authProvider);
  return NotificacoesNotifier(client);
});
