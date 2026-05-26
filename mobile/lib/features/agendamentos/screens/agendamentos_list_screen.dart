import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../core/auth/auth_provider.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/empty_state_widget.dart';
import '../../../shared/widgets/loading_widget.dart';
import '../providers/agendamentos_provider.dart';
import '../widgets/agendamento_card.dart';

final _filterProvider = StateProvider<String>((ref) => 'todos');
final _searchProvider = StateProvider<String>((ref) => '');

class AgendamentosListScreen extends ConsumerStatefulWidget {
  const AgendamentosListScreen({super.key});

  @override
  ConsumerState<AgendamentosListScreen> createState() =>
      _AgendamentosListScreenState();
}

class _AgendamentosListScreenState
    extends ConsumerState<AgendamentosListScreen> {
  final _searchCtrl = TextEditingController();

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(agendamentosProvider);
    final filter = ref.watch(_filterProvider);
    final search = ref.watch(_searchProvider);
    final auth = ref.watch(authProvider);
    final canCreate = auth is AuthAuthenticated &&
        (auth.user.isAdmin || auth.user.isOperador);

    var items = state.items;

    if (filter != 'todos') {
      items = items.where((a) => a.status == filter).toList();
    }

    if (search.isNotEmpty) {
      final q = search.toLowerCase();
      items = items
          .where((a) =>
              a.titulo.toLowerCase().contains(q) ||
              (a.clienteNome?.toLowerCase().contains(q) ?? false))
          .toList();
    }

    return Scaffold(
      backgroundColor: AppTheme.bg,
      appBar: AppBar(
        title: Text(
          'Agendamentos',
          style: GoogleFonts.cormorantGaramond(
            color: AppTheme.textPrimary,
            fontSize: 20,
            fontWeight: FontWeight.w600,
          ),
        ),
        actions: [
          if (canCreate)
            IconButton(
              icon: const Icon(Icons.add, color: AppTheme.primary),
              onPressed: () => context.push('/agendamentos/new'),
            ),
        ],
      ),
      body: Column(
        children: [
          // Barra de busca
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
            child: TextField(
              controller: _searchCtrl,
              style: const TextStyle(color: AppTheme.textPrimary, fontSize: 14),
              decoration: InputDecoration(
                hintText: 'Buscar agendamento...',
                hintStyle:
                    const TextStyle(color: AppTheme.textMuted, fontSize: 13),
                prefixIcon: const Icon(Icons.search, size: 18),
                suffixIcon: search.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear, size: 16),
                        onPressed: () {
                          _searchCtrl.clear();
                          ref.read(_searchProvider.notifier).state = '';
                        },
                      )
                    : null,
              ),
              onChanged: (v) => ref.read(_searchProvider.notifier).state = v,
            ),
          ),

          // Filtros de status
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(
              children: [
                _Chip('todos', 'Todos', filter, ref),
                const SizedBox(width: 6),
                _Chip('agendado', 'Agendado', filter, ref),
                const SizedBox(width: 6),
                _Chip('andamento', 'Andamento', filter, ref),
                const SizedBox(width: 6),
                _Chip('concluido', 'Concluído', filter, ref),
                const SizedBox(width: 6),
                _Chip('cancelado', 'Cancelado', filter, ref),
              ],
            ),
          ),

          // Lista
          Expanded(
            child: state.isLoading
                ? const ShimmerList()
                : state.error != null
                    ? EmptyStateWidget(
                        title: state.error!,
                        icon: Icons.error_outline,
                        action: FilledButton(
                          onPressed: () =>
                              ref.read(agendamentosProvider.notifier).load(),
                          child: const Text('TENTAR NOVAMENTE'),
                        ),
                      )
                    : items.isEmpty
                        ? EmptyStateWidget(
                            title: 'Nenhum agendamento',
                            subtitle: 'Toque em + para criar um novo.',
                            icon: Icons.event_outlined,
                          )
                        : RefreshIndicator(
                            color: AppTheme.primary,
                            backgroundColor: AppTheme.surfaceStrong,
                            onRefresh: () =>
                                ref.read(agendamentosProvider.notifier).load(),
                            child: ListView.builder(
                              padding:
                                  const EdgeInsets.fromLTRB(12, 0, 12, 80),
                              itemCount: items.length,
                              itemBuilder: (_, i) =>
                                  AgendamentoCard(agendamento: items[i]),
                            ),
                          ),
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final String value;
  final String label;
  final String current;
  final WidgetRef ref;

  const _Chip(this.value, this.label, this.current, this.ref);

  @override
  Widget build(BuildContext context) {
    final selected = current == value;
    return GestureDetector(
      onTap: () => ref.read(_filterProvider.notifier).state = value,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: selected
              ? AppTheme.primary.withValues(alpha: 0.15)
              : AppTheme.surfaceStrong,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: selected ? AppTheme.primary.withValues(alpha: 0.5) : AppTheme.border,
          ),
        ),
        child: Text(
          label,
          style: GoogleFonts.jost(
            fontSize: 11,
            fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
            color: selected ? AppTheme.primary : AppTheme.textSecondary,
          ),
        ),
      ),
    );
  }
}
