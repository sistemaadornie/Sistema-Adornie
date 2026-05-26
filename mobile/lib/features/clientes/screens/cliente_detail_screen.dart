import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/loading_widget.dart';
import '../models/cliente_model.dart';
import '../providers/clientes_provider.dart';

class ClienteDetailScreen extends ConsumerStatefulWidget {
  final int id;
  const ClienteDetailScreen({super.key, required this.id});

  @override
  ConsumerState<ClienteDetailScreen> createState() =>
      _ClienteDetailScreenState();
}

class _ClienteDetailScreenState extends ConsumerState<ClienteDetailScreen> {
  ClienteModel? _cliente;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final result =
        await ref.read(clientesProvider.notifier).getById(widget.id);
    if (mounted) setState(() {
      _cliente = result;
      _loading = false;
    });
  }

  Future<void> _delete() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Excluir cliente?'),
        content: const Text('Esta ação não pode ser desfeita.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: AppTheme.error),
            child: const Text('Excluir'),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    await ref.read(clientesProvider.notifier).delete(widget.id);
    if (mounted) context.pop();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Scaffold(body: LoadingWidget());
    if (_cliente == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Cliente')),
        body: const Center(child: Text('Cliente não encontrado.')),
      );
    }

    final c = _cliente!;

    return Scaffold(
      appBar: AppBar(
        title: Text(c.nome),
        actions: [
          IconButton(
            icon: const Icon(Icons.edit_outlined),
            onPressed: () => context.push('/clientes/${c.id}/edit'),
          ),
          IconButton(
            icon: const Icon(Icons.delete_outline, color: Colors.red),
            onPressed: _delete,
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
              // Info card
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(children: [
                        CircleAvatar(
                          radius: 28,
                          backgroundColor:
                              AppTheme.primary.withValues(alpha: 0.12),
                          child: Text(
                            c.nome[0].toUpperCase(),
                            style: const TextStyle(
                              color: AppTheme.primary,
                              fontSize: 22,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Text(c.nome,
                              style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.bold,
                              )),
                        ),
                      ]),
                      if (c.telefone != null) ...[
                        const SizedBox(height: 12),
                        _InfoRow(
                            icon: Icons.phone_outlined, text: c.telefone!),
                      ],
                      if (c.email != null) ...[
                        const SizedBox(height: 8),
                        _InfoRow(
                            icon: Icons.email_outlined, text: c.email!),
                      ],
                    ],
                  ),
                ),
              ),

              if (c.enderecos.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text('ENDEREÇOS',
                    style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey.shade500,
                        letterSpacing: 1)),
                const SizedBox(height: 8),
                ...c.enderecos.map((e) => Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        leading: Icon(
                          e.isPadrao
                              ? Icons.home
                              : Icons.location_on_outlined,
                          color: e.isPadrao ? AppTheme.primary : Colors.grey,
                        ),
                        title: Text(e.enderecoCompleto),
                        subtitle: e.isPadrao
                            ? const Text('Endereço principal',
                                style: TextStyle(
                                    color: AppTheme.primary, fontSize: 12))
                            : null,
                      ),
                    )),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String text;
  const _InfoRow({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) => Row(children: [
        Icon(icon, size: 18, color: Colors.grey),
        const SizedBox(width: 8),
        Text(text, style: const TextStyle(fontSize: 15)),
      ]);
}
