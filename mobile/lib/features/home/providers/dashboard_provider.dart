import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';
import '../../../core/auth/auth_provider.dart';

class DashboardState {
  final int agendamentosHoje;
  final int agendamentosSemana;
  final int clientesTotal;
  final bool isLoading;

  const DashboardState({
    this.agendamentosHoje = 0,
    this.agendamentosSemana = 0,
    this.clientesTotal = 0,
    this.isLoading = false,
  });
}

class DashboardNotifier extends StateNotifier<DashboardState> {
  final ApiClient _client;

  DashboardNotifier(this._client) : super(const DashboardState()) {
    load();
  }

  Future<void> load() async {
    if (!mounted) return;
    state = const DashboardState(isLoading: true);
    try {
      final responses = await Future.wait([
        _client.dio.get('/relatorios/agendamentos', queryParameters: {'periodo': '7d'}),
        _client.dio.get('/clientes'),
      ]);
      if (!mounted) return;

      final relatorio = responses[0].data as Map<String, dynamic>;
      final clientes = responses[1].data as Map<String, dynamic>;

      final hoje = (relatorio['resumo']?['agendamentos_hoje'] as num?)?.toInt() ?? 0;
      final semana = (relatorio['resumo']?['total_agendamentos'] as num?)?.toInt() ?? 0;
      final totalClientes = (clientes['clientes'] as List?)?.length ?? 0;

      state = DashboardState(
        agendamentosHoje: hoje,
        agendamentosSemana: semana,
        clientesTotal: totalClientes,
        isLoading: false,
      );
    } catch (_) {
      if (!mounted) return;
      state = const DashboardState();
    }
  }
}

final dashboardProvider =
    StateNotifierProvider<DashboardNotifier, DashboardState>((ref) {
  final client = ref.read(apiClientProvider);
  ref.watch(authProvider);
  return DashboardNotifier(client);
});
