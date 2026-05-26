import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';
import '../../../core/auth/auth_provider.dart';

class RelatoriosState {
  final Map<String, dynamic>? data;
  final bool isLoading;
  final String? error;
  final String periodo;

  const RelatoriosState({
    this.data,
    this.isLoading = false,
    this.error,
    this.periodo = '30d',
  });

  RelatoriosState copyWith({
    Map<String, dynamic>? data,
    bool? isLoading,
    String? error,
    String? periodo,
  }) =>
      RelatoriosState(
        data: data ?? this.data,
        isLoading: isLoading ?? this.isLoading,
        error: error,
        periodo: periodo ?? this.periodo,
      );

  // Helpers
  int get total =>
      (data?['resumo']?['total_agendamentos'] as num?)?.toInt() ?? 0;
  int get concluidos =>
      (data?['resumo']?['total_concluidos'] as num?)?.toInt() ?? 0;
  int get cancelados =>
      (data?['resumo']?['total_cancelados'] as num?)?.toInt() ?? 0;
  int get emAndamento =>
      (data?['resumo']?['total_andamento'] as num?)?.toInt() ?? 0;
  double get taxaConclusao =>
      (data?['resumo']?['taxa_conclusao'] as num?)?.toDouble() ?? 0;

  List<Map<String, dynamic>> get porStatus {
    final raw = data?['por_status'] as List?;
    return raw?.map((e) => e as Map<String, dynamic>).toList() ?? [];
  }

  List<Map<String, dynamic>> get porDia {
    final raw = data?['por_dia'] as List?;
    return raw?.map((e) => e as Map<String, dynamic>).toList() ?? [];
  }
}

class RelatoriosNotifier extends StateNotifier<RelatoriosState> {
  final ApiClient _client;

  RelatoriosNotifier(this._client) : super(const RelatoriosState()) {
    load();
  }

  Future<void> load({String? periodo}) async {
    final p = periodo ?? state.periodo;
    state = state.copyWith(isLoading: true, error: null, periodo: p);
    try {
      final response = await _client.dio.get(
        '/relatorios/agendamentos',
        queryParameters: {'periodo': p},
      );
      state = state.copyWith(
        data: response.data as Map<String, dynamic>,
        isLoading: false,
      );
    } catch (_) {
      state = state.copyWith(isLoading: false, error: 'Erro ao carregar relatórios.');
    }
  }
}

final relatoriosProvider =
    StateNotifierProvider<RelatoriosNotifier, RelatoriosState>((ref) {
  final client = ref.read(apiClientProvider);
  ref.watch(authProvider);
  return RelatoriosNotifier(client);
});
