import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/storage/upload_queue_item.dart';
import '../providers/midias_provider.dart';

class MidiaUploadScreen extends ConsumerWidget {
  final int pedidoId;
  final int pedidoItemId;
  final int? osId;

  const MidiaUploadScreen({
    required this.pedidoId,
    required this.pedidoItemId,
    this.osId,
    super.key,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final queueState = ref.watch(queueProvider);

    final meuItens = queueState.items
        .where((i) => i.pedidoId == pedidoId && i.pedidoItemId == pedidoItemId)
        .toList();

    return Scaffold(
      appBar: AppBar(title: const Text('Mídias da OS')),
      body: Column(
        children: [
          Expanded(
            child: meuItens.isEmpty
                ? const Center(
                    child: Text(
                      'Nenhuma mídia na fila.\nUse os botões abaixo para adicionar.',
                      textAlign: TextAlign.center,
                    ),
                  )
                : ListView.separated(
                    itemCount: meuItens.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (_, i) => _QueueTile(item: meuItens[i]),
                  ),
          ),
          _ActionBar(
            onPickGallery: () => _pick(context, ref, ImageSource.gallery),
            onPickCamera: () => _pick(context, ref, ImageSource.camera),
            onRetry: () {
              ref.read(processorProvider).processQueue();
              ref.read(queueProvider.notifier).refresh();
            },
          ),
        ],
      ),
    );
  }

  Future<void> _pick(BuildContext context, WidgetRef ref, ImageSource source) async {
    final picker = ImagePicker();
    final picked = await picker.pickMultipleMedia();
    if (picked.isEmpty) return;

    final now = DateTime.now().toIso8601String();
    for (final xFile in picked) {
      final file = File(xFile.path);
      final stat = await file.stat();
      final ext = xFile.name.split('.').last.toLowerCase();
      final tipo = ['mp4', 'mov', 'avi', 'mkv', 'webm'].contains(ext) ? 'video' : 'foto';
      final mime = tipo == 'video' ? 'video/mp4' : 'image/jpeg';

      final item = UploadQueueItem(
        localPath: xFile.path,
        pedidoId: pedidoId,
        pedidoItemId: pedidoItemId,
        osId: osId,
        tipo: tipo,
        mimeType: mime,
        tamanhoBytes: stat.size,
        criadoEm: now,
        atualizadoEm: now,
      );
      await ref.read(queueProvider.notifier).enqueue(item);
    }

    ref.read(processorProvider).processQueue();
  }
}

class _QueueTile extends StatelessWidget {
  final UploadQueueItem item;
  const _QueueTile({required this.item});

  (IconData, Color, String) get _statusInfo => switch (item.status) {
        'pendente' => (Icons.hourglass_empty, Colors.orange, '⏳ Pendente'),
        'enviando' => (Icons.upload, Colors.blue, '📤 Enviando'),
        'enviado' => (Icons.check_circle, Colors.green, '✅ Enviado'),
        'erro' => (Icons.error_outline, Colors.red, '❌ Erro'),
        'interrompido' => (Icons.pause_circle_outline, Colors.amber, '⏸ Interrompido'),
        _ => (Icons.help_outline, Colors.grey, item.status),
      };

  @override
  Widget build(BuildContext context) {
    final (icon, color, label) = _statusInfo;
    final progress =
        item.tamanhoBytes > 0 ? item.bytesConfirmados / item.tamanhoBytes : 0.0;

    return ListTile(
      leading: Icon(icon, color: color),
      title: Text(
        item.localPath.split(Platform.pathSeparator).last,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('$label  •  ${item.tipo}  •  ${_formatBytes(item.tamanhoBytes)}'),
          if (item.status == 'enviando' && progress > 0)
            LinearProgressIndicator(value: progress),
          if (item.erroMensagem != null)
            Text(item.erroMensagem!,
                style: const TextStyle(color: Colors.red, fontSize: 11)),
        ],
      ),
      isThreeLine: item.status == 'enviando' || item.erroMensagem != null,
    );
  }

  String _formatBytes(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / 1024 / 1024).toStringAsFixed(1)} MB';
  }
}

class _ActionBar extends StatelessWidget {
  final VoidCallback onPickGallery;
  final VoidCallback onPickCamera;
  final VoidCallback onRetry;

  const _ActionBar({
    required this.onPickGallery,
    required this.onPickCamera,
    required this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(children: [
          Expanded(
            child: FilledButton.icon(
              onPressed: onPickCamera,
              icon: const Icon(Icons.camera_alt),
              label: const Text('Câmera'),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: FilledButton.icon(
              onPressed: onPickGallery,
              icon: const Icon(Icons.photo_library),
              label: const Text('Galeria'),
            ),
          ),
          const SizedBox(width: 8),
          IconButton.outlined(
            onPressed: onRetry,
            icon: const Icon(Icons.replay),
            tooltip: 'Reprocessar fila',
          ),
        ]),
      ),
    );
  }
}
