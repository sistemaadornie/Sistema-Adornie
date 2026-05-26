import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../models/os_model.dart';
import '../providers/midias_provider.dart';

class OsListScreen extends ConsumerWidget {
  final int pedidoId;
  const OsListScreen({required this.pedidoId, super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(ordensProvider(pedidoId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Ordens de Serviço'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.read(ordensProvider(pedidoId).notifier).load(),
          ),
        ],
      ),
      body: _buildBody(context, state),
    );
  }

  Widget _buildBody(BuildContext context, OrdensState state) {
    if (state.isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (state.error != null) {
      return Center(
          child: Text('Erro: ${state.error}', style: const TextStyle(color: Colors.red)));
    }
    if (state.items.isEmpty) {
      return const Center(child: Text('Nenhuma ordem de serviço encontrada.'));
    }
    return RefreshIndicator(
      onRefresh: () async {},
      child: ListView.separated(
        itemCount: state.items.length,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (context, i) => _OsTile(os: state.items[i], pedidoId: pedidoId),
      ),
    );
  }
}

class _OsTile extends StatelessWidget {
  final OsModel os;
  final int pedidoId;
  const _OsTile({required this.os, required this.pedidoId});

  Color _statusColor() => switch (os.status) {
        'aberta' => Colors.orange,
        'em_andamento' => Colors.blue,
        'aguardando_aprovacao' => Colors.purple,
        'encerrada' => Colors.green,
        _ => Colors.grey,
      };

  String _statusLabel() => switch (os.status) {
        'aberta' => 'Aberta',
        'em_andamento' => 'Em andamento',
        'aguardando_aprovacao' => 'Aguard. aprovação',
        'encerrada' => 'Encerrada',
        _ => os.status,
      };

  @override
  Widget build(BuildContext context) {
    return ListTile(
      title: Text(os.itemDescricao, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (os.responsavelNome != null) Text('Responsável: ${os.responsavelNome}'),
          Row(children: [
            const Icon(Icons.photo, size: 14),
            Text(' ${os.totalFotos}  '),
            const Icon(Icons.videocam, size: 14),
            Text(' ${os.totalVideos}'),
          ]),
        ],
      ),
      trailing: Chip(
        label: Text(_statusLabel(),
            style: const TextStyle(fontSize: 11, color: Colors.white)),
        backgroundColor: _statusColor(),
        padding: EdgeInsets.zero,
        visualDensity: VisualDensity.compact,
      ),
      onTap: () => context.push('/midias/$pedidoId/os/${os.id}'),
    );
  }
}
