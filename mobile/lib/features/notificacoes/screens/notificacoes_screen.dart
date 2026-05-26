import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:timeago/timeago.dart' as timeago;
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/empty_state_widget.dart';
import '../../../shared/widgets/loading_widget.dart';
import '../models/notificacao_model.dart';
import '../providers/notificacoes_provider.dart';

class NotificacoesScreen extends ConsumerWidget {
  const NotificacoesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(notificacoesProvider);

    return Scaffold(
      backgroundColor: AppTheme.bg,
      appBar: AppBar(
        title: Text(
          'Notificações',
          style: GoogleFonts.cormorantGaramond(
            color: AppTheme.textPrimary,
            fontSize: 20,
            fontWeight: FontWeight.w600,
          ),
        ),
        actions: [
          if (state.items.any((n) => !n.lida))
            TextButton(
              onPressed: () async {
                for (final n in state.items.where((n) => !n.lida)) {
                  await ref
                      .read(notificacoesProvider.notifier)
                      .markAsRead(n.id);
                }
              },
              child: Text(
                'Marcar todas',
                style: GoogleFonts.jost(
                    color: AppTheme.primary, fontSize: 12),
              ),
            ),
        ],
      ),
      body: state.isLoading
          ? const ShimmerList()
          : state.error != null
              ? EmptyStateWidget(
                  title: state.error!,
                  icon: Icons.error_outline,
                  action: FilledButton(
                    onPressed: () =>
                        ref.read(notificacoesProvider.notifier).load(),
                    child: const Text('TENTAR NOVAMENTE'),
                  ),
                )
              : state.items.isEmpty
                  ? const EmptyStateWidget(
                      title: 'Nenhuma notificação',
                      subtitle: 'Você está em dia!',
                      icon: Icons.notifications_none,
                    )
                  : RefreshIndicator(
                      color: AppTheme.primary,
                      backgroundColor: AppTheme.surfaceStrong,
                      onRefresh: () =>
                          ref.read(notificacoesProvider.notifier).load(),
                      child: ListView.separated(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        itemCount: state.items.length,
                        separatorBuilder: (_, __) =>
                            const Divider(height: 1, color: AppTheme.border),
                        itemBuilder: (_, i) =>
                            _NotificacaoTile(state.items[i], ref),
                      ),
                    ),
    );
  }
}

class _NotificacaoTile extends StatelessWidget {
  final NotificacaoModel notificacao;
  final WidgetRef ref;

  const _NotificacaoTile(this.notificacao, this.ref);

  IconData get _icon => switch (notificacao.tipo) {
        'agendamento_novo' => Icons.event_outlined,
        'agendamento_cancelado' => Icons.event_busy_outlined,
        'agendamento_atualizado' => Icons.edit_calendar_outlined,
        'usuario_aprovado' => Icons.check_circle_outline,
        _ => Icons.notifications_outlined,
      };

  @override
  Widget build(BuildContext context) {
    final n = notificacao;
    return Dismissible(
      key: Key('notif_${n.id}'),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        color: AppTheme.error.withValues(alpha: 0.15),
        child: const Icon(Icons.delete_outline, color: AppTheme.error),
      ),
      onDismissed: (_) =>
          ref.read(notificacoesProvider.notifier).delete(n.id),
      child: Container(
        color: n.lida
            ? Colors.transparent
            : AppTheme.primary.withValues(alpha: 0.04),
        child: ListTile(
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          leading: Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppTheme.primary.withValues(
                  alpha: n.lida ? 0.06 : 0.14),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                  color: AppTheme.primary.withValues(
                      alpha: n.lida ? 0.1 : 0.25)),
            ),
            child: Icon(_icon, color: AppTheme.primary, size: 18),
          ),
          title: Text(
            n.mensagem ?? _tipoLabel(n.tipo),
            style: GoogleFonts.jost(
              fontWeight: n.lida ? FontWeight.w400 : FontWeight.w600,
              fontSize: 13,
              color: n.lida ? AppTheme.textSecondary : AppTheme.textPrimary,
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          subtitle: Text(
            _timeAgo(n.criadoEm),
            style: GoogleFonts.jost(
                fontSize: 11, color: AppTheme.textMuted),
          ),
          trailing: !n.lida
              ? Container(
                  width: 7,
                  height: 7,
                  decoration: const BoxDecoration(
                    color: AppTheme.primary,
                    shape: BoxShape.circle,
                  ),
                )
              : null,
          onTap: n.lida
              ? null
              : () =>
                  ref.read(notificacoesProvider.notifier).markAsRead(n.id),
        ),
      ),
    );
  }

  String _tipoLabel(String tipo) => switch (tipo) {
        'agendamento_novo' => 'Novo agendamento',
        'agendamento_cancelado' => 'Agendamento cancelado',
        'agendamento_atualizado' => 'Agendamento atualizado',
        'usuario_aprovado' => 'Usuário aprovado',
        _ => 'Notificação',
      };

  String _timeAgo(String dateStr) {
    try {
      final dt = DateTime.parse(dateStr).toLocal();
      return timeago.format(dt, locale: 'pt_BR');
    } catch (_) {
      return dateStr;
    }
  }
}
