import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/empty_state_widget.dart';
import '../../../shared/widgets/loading_widget.dart';
import '../providers/clientes_provider.dart';
import '../widgets/cliente_card.dart';

class ClientesListScreen extends ConsumerStatefulWidget {
  const ClientesListScreen({super.key});

  @override
  ConsumerState<ClientesListScreen> createState() => _ClientesListScreenState();
}

class _ClientesListScreenState extends ConsumerState<ClientesListScreen> {
  final _searchCtrl = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(clientesProvider);
    var items = state.items;

    if (_query.isNotEmpty) {
      final q = _query.toLowerCase();
      items = items
          .where((c) =>
              c.nome.toLowerCase().contains(q) ||
              (c.telefone?.contains(q) ?? false) ||
              (c.email?.toLowerCase().contains(q) ?? false))
          .toList();
    }

    return Scaffold(
      backgroundColor: AppTheme.bg,
      appBar: AppBar(
        title: Text(
          'Clientes',
          style: GoogleFonts.cormorantGaramond(
            color: AppTheme.textPrimary,
            fontSize: 20,
            fontWeight: FontWeight.w600,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: AppTheme.primary),
            onPressed: () => context.push('/clientes/new'),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
            child: TextField(
              controller: _searchCtrl,
              style: const TextStyle(color: AppTheme.textPrimary, fontSize: 14),
              decoration: InputDecoration(
                hintText: 'Buscar cliente...',
                hintStyle:
                    const TextStyle(color: AppTheme.textMuted, fontSize: 13),
                prefixIcon: const Icon(Icons.search, size: 18),
                suffixIcon: _query.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear, size: 16),
                        onPressed: () {
                          _searchCtrl.clear();
                          setState(() => _query = '');
                          ref.read(clientesProvider.notifier).load();
                        },
                      )
                    : null,
              ),
              onChanged: (v) {
                setState(() => _query = v);
                if (v.length >= 2 || v.isEmpty) {
                  ref.read(clientesProvider.notifier).load(query: v);
                }
              },
            ),
          ),
          Expanded(
            child: state.isLoading
                ? const ShimmerList()
                : state.error != null
                    ? EmptyStateWidget(
                        title: state.error!,
                        icon: Icons.error_outline,
                        action: FilledButton(
                          onPressed: () =>
                              ref.read(clientesProvider.notifier).load(),
                          child: const Text('TENTAR NOVAMENTE'),
                        ),
                      )
                    : items.isEmpty
                        ? EmptyStateWidget(
                            title: 'Nenhum cliente encontrado',
                            icon: Icons.people_outline,
                            action: FilledButton(
                              onPressed: () => context.push('/clientes/new'),
                              child: const Text('ADICIONAR CLIENTE'),
                            ),
                          )
                        : RefreshIndicator(
                            color: AppTheme.primary,
                            backgroundColor: AppTheme.surfaceStrong,
                            onRefresh: () =>
                                ref.read(clientesProvider.notifier).load(),
                            child: ListView.builder(
                              padding:
                                  const EdgeInsets.fromLTRB(12, 0, 12, 80),
                              itemCount: items.length,
                              itemBuilder: (_, i) =>
                                  ClienteCard(cliente: items[i]),
                            ),
                          ),
          ),
        ],
      ),
    );
  }
}
