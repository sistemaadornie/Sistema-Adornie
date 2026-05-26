import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/auth/auth_provider.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/loading_widget.dart';
import '../../../shared/widgets/status_badge.dart';
import '../models/agendamento_model.dart';
import '../providers/agendamentos_provider.dart';

class AgendamentoDetailScreen extends ConsumerStatefulWidget {
  final int id;
  const AgendamentoDetailScreen({super.key, required this.id});

  @override
  ConsumerState<AgendamentoDetailScreen> createState() =>
      _AgendamentoDetailScreenState();
}

class _AgendamentoDetailScreenState
    extends ConsumerState<AgendamentoDetailScreen> {
  AgendamentoModel? _agendamento;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final result =
        await ref.read(agendamentosProvider.notifier).getById(widget.id);
    if (mounted) setState(() {
      _agendamento = result;
      _loading = false;
    });
  }

  Future<void> _changeStatus(String newStatus) async {
    final success = await ref
        .read(agendamentosProvider.notifier)
        .update(widget.id, {'status': newStatus});
    if (success && mounted) {
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Status atualizado!')),
        );
      }
    }
  }

  Future<void> _cancel() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancelar agendamento?'),
        content: const Text('Esta ação não pode ser desfeita.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Voltar')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: AppTheme.error),
            child: const Text('Cancelar'),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    final success =
        await ref.read(agendamentosProvider.notifier).cancel(widget.id);
    if (success && mounted) context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    final canEdit = auth is AuthAuthenticated &&
        (auth.user.isAdmin || auth.user.isOperador);

    if (_loading) return const Scaffold(body: LoadingWidget());
    if (_agendamento == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Agendamento')),
        body: const Center(child: Text('Agendamento não encontrado.')),
      );
    }

    final a = _agendamento!;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Detalhes'),
        actions: [
          if (canEdit)
            PopupMenuButton<String>(
              onSelected: (v) {
                if (v == 'edit') context.push('/agendamentos/${a.id}/edit');
                if (v == 'cancel') _cancel();
              },
              itemBuilder: (_) => [
                const PopupMenuItem(value: 'edit', child: Text('Editar')),
                const PopupMenuItem(
                    value: 'cancel',
                    child: Text('Cancelar', style: TextStyle(color: AppTheme.error))),
              ],
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header card
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              a.titulo,
                              style: const TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                          StatusBadge(a.status),
                        ],
                      ),
                      if (a.clienteNome != null) ...[
                        const SizedBox(height: 8),
                        Row(children: [
                          const Icon(Icons.person_outline,
                              size: 16, color: Colors.grey),
                          const SizedBox(width: 6),
                          Text(a.clienteNome!,
                              style: const TextStyle(color: Colors.grey)),
                        ]),
                      ],
                      const SizedBox(height: 8),
                      Row(children: [
                        const Icon(Icons.calendar_today,
                            size: 16, color: Colors.grey),
                        const SizedBox(width: 6),
                        Text(
                          '${_formatDate(a.data)} às ${a.hora.length >= 5 ? a.hora.substring(0, 5) : a.hora}',
                          style: const TextStyle(color: Colors.grey),
                        ),
                      ]),
                      const SizedBox(height: 8),
                      Row(children: [
                        const Icon(Icons.category_outlined,
                            size: 16, color: Colors.grey),
                        const SizedBox(width: 6),
                        Text(a.tipo, style: const TextStyle(color: Colors.grey)),
                      ]),
                    ],
                  ),
                ),
              ),

              if (a.endereco != null) ...[
                const SizedBox(height: 12),
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.location_on_outlined,
                        color: AppTheme.primary),
                    title: const Text('Endereço'),
                    subtitle: Text(a.endereco!),
                  ),
                ),
              ],

              if (a.itens.isNotEmpty) ...[
                const SizedBox(height: 12),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Itens',
                            style: TextStyle(fontWeight: FontWeight.bold)),
                        const SizedBox(height: 8),
                        ...a.itens.map((item) => Padding(
                              padding: const EdgeInsets.symmetric(vertical: 2),
                              child: Row(children: [
                                const Icon(Icons.check_circle_outline,
                                    size: 16, color: Colors.grey),
                                const SizedBox(width: 8),
                                Text(item.toString()),
                              ]),
                            )),
                      ],
                    ),
                  ),
                ),
              ],

              // Trocar status
              if (canEdit && a.status != 'cancelado') ...[
                const SizedBox(height: 24),
                const Text('ATUALIZAR STATUS',
                    style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey,
                        letterSpacing: 1)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _statusBtn('andamento', 'Em Andamento', AppTheme.statusAndamento),
                    _statusBtn('concluido', 'Concluído', AppTheme.statusConcluido),
                    _statusBtn('nao_concluido', 'Não Concluído',
                        AppTheme.statusNaoConcluido),
                  ]
                      .where((w) => true)
                      .toList(),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _statusBtn(String status, String label, Color color) => OutlinedButton(
        onPressed: _agendamento?.status == status
            ? null
            : () => _changeStatus(status),
        style: OutlinedButton.styleFrom(
          foregroundColor: color,
          side: BorderSide(color: color),
        ),
        child: Text(label),
      );

  String _formatDate(String date) {
    try {
      final parts = date.split('-');
      if (parts.length == 3) return '${parts[2]}/${parts[1]}/${parts[0]}';
    } catch (_) {}
    return date;
  }
}
