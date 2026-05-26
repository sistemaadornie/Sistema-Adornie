import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/theme/app_theme.dart';
import '../agendamentos/providers/agendamentos_provider.dart';
import '../notificacoes/providers/notificacoes_provider.dart';
import 'providers/dashboard_provider.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);
    final user = authState is AuthAuthenticated ? authState.user : null;
    final dash = ref.watch(dashboardProvider);
    final agendamentos = ref.watch(agendamentosProvider);
    final notif = ref.watch(notificacoesProvider);

    final primeiroNome = user?.nomeCompleto.split(' ').first ?? '';

    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: RefreshIndicator(
        color: AppTheme.primary,
        backgroundColor: AppTheme.surfaceStrong,
        onRefresh: () async {
          ref.read(dashboardProvider.notifier).load();
          ref.read(agendamentosProvider.notifier).load();
          ref.read(notificacoesProvider.notifier).load();
        },
        child: CustomScrollView(
          slivers: [
            // ── App Bar ────────────────────────────────────────────
            SliverAppBar(
              expandedHeight: 130,
              pinned: true,
              backgroundColor: AppTheme.surface,
              surfaceTintColor: Colors.transparent,
              bottom: PreferredSize(
                preferredSize: const Size.fromHeight(1),
                child: Container(height: 1, color: AppTheme.border),
              ),
              flexibleSpace: FlexibleSpaceBar(
                background: Container(
                  color: AppTheme.surface,
                  padding: const EdgeInsets.fromLTRB(20, 56, 20, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      Text(
                        'Olá, $primeiroNome',
                        style: GoogleFonts.cormorantGaramond(
                          color: AppTheme.textPrimary,
                          fontSize: 26,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Text(
                        'Veja o resumo do dia',
                        style: GoogleFonts.jost(
                          color: AppTheme.textMuted,
                          fontSize: 12,
                          fontWeight: FontWeight.w300,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              actions: [
                Stack(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.notifications_outlined,
                          color: AppTheme.textSecondary),
                      onPressed: () => context.go('/notificacoes'),
                    ),
                    if (notif.unreadCount > 0)
                      Positioned(
                        right: 8,
                        top: 8,
                        child: Container(
                          padding: const EdgeInsets.all(3),
                          decoration: const BoxDecoration(
                            color: AppTheme.error,
                            shape: BoxShape.circle,
                          ),
                          child: Text(
                            '${notif.unreadCount}',
                            style: const TextStyle(
                                color: Colors.white, fontSize: 9),
                          ),
                        ),
                      ),
                  ],
                ),
              ],
            ),

            SliverPadding(
              padding: const EdgeInsets.all(16),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  // ── KPI Cards ─────────────────────────────────────
                  Row(
                    children: [
                      _KpiCard(
                        label: 'Hoje',
                        value: '${dash.agendamentosHoje}',
                        icon: Icons.today_outlined,
                        color: AppTheme.statusAndamento,
                      ),
                      const SizedBox(width: 10),
                      _KpiCard(
                        label: '7 dias',
                        value: '${dash.agendamentosSemana}',
                        icon: Icons.calendar_month_outlined,
                        color: AppTheme.primary,
                      ),
                      const SizedBox(width: 10),
                      _KpiCard(
                        label: 'Clientes',
                        value: '${dash.clientesTotal}',
                        icon: Icons.people_outline,
                        color: AppTheme.statusConcluido,
                      ),
                    ],
                  ),
                  const SizedBox(height: 28),

                  // ── Ações rápidas ─────────────────────────────────
                  _SectionLabel('AÇÕES RÁPIDAS'),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      _QuickAction(
                        label: 'Novo\nAgendamento',
                        icon: Icons.add_circle_outline,
                        onTap: () => context.push('/agendamentos/new'),
                      ),
                      const SizedBox(width: 10),
                      _QuickAction(
                        label: 'Novo\nCliente',
                        icon: Icons.person_add_outlined,
                        onTap: () => context.push('/clientes/new'),
                      ),
                      const SizedBox(width: 10),
                      _QuickAction(
                        label: 'Relatórios',
                        icon: Icons.bar_chart_outlined,
                        onTap: () => context.go('/relatorios'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 28),

                  // ── Próximos agendamentos ─────────────────────────
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _SectionLabel('PRÓXIMOS AGENDAMENTOS'),
                      TextButton(
                        onPressed: () => context.go('/agendamentos'),
                        child: Text(
                          'Ver todos',
                          style: GoogleFonts.jost(
                              color: AppTheme.primary, fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (agendamentos.isLoading)
                    const _ShimmerCards()
                  else if (agendamentos.items.isEmpty)
                    Container(
                      padding: const EdgeInsets.all(24),
                      decoration: BoxDecoration(
                        color: AppTheme.surface,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: AppTheme.border),
                      ),
                      child: Center(
                        child: Text(
                          'Nenhum agendamento próximo.',
                          style: GoogleFonts.jost(
                              color: AppTheme.textMuted, fontSize: 13),
                        ),
                      ),
                    )
                  else
                    ...agendamentos.items.take(5).map((a) => _AgendCard(a)),
                ]),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) => Text(
        text,
        style: GoogleFonts.jost(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: AppTheme.textMuted,
          letterSpacing: 1.5,
        ),
      );
}

class _KpiCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  const _KpiCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) => Expanded(
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 12),
          decoration: BoxDecoration(
            color: AppTheme.surface,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppTheme.border),
          ),
          child: Column(
            children: [
              Icon(icon, color: color, size: 22),
              const SizedBox(height: 8),
              Text(
                value,
                style: GoogleFonts.cormorantGaramond(
                  fontSize: 28,
                  fontWeight: FontWeight.w700,
                  color: color,
                  height: 1,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                label,
                style: GoogleFonts.jost(
                    fontSize: 10,
                    color: AppTheme.textMuted,
                    fontWeight: FontWeight.w400),
              ),
            ],
          ),
        ),
      );
}

class _QuickAction extends StatelessWidget {
  final String label;
  final IconData icon;
  final VoidCallback onTap;

  const _QuickAction({
    required this.label,
    required this.icon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) => Expanded(
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(10),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 16),
            decoration: BoxDecoration(
              color: AppTheme.surface,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppTheme.border),
            ),
            child: Column(
              children: [
                Icon(icon, color: AppTheme.primary, size: 24),
                const SizedBox(height: 8),
                Text(
                  label,
                  textAlign: TextAlign.center,
                  style: GoogleFonts.jost(
                    fontSize: 10,
                    fontWeight: FontWeight.w500,
                    color: AppTheme.textSecondary,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
}

class _AgendCard extends StatelessWidget {
  final dynamic agendamento;
  const _AgendCard(this.agendamento);

  @override
  Widget build(BuildContext context) {
    final a = agendamento;
    final color = _statusColor(a.status as String);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppTheme.border),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(Icons.event_outlined, color: color, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  a.titulo as String,
                  style: GoogleFonts.jost(
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                    color: AppTheme.textPrimary,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  '${_dateBR(a.data as String)} às ${(a.hora as String).substring(0, 5)}',
                  style: GoogleFonts.jost(
                      fontSize: 11, color: AppTheme.textMuted),
                ),
              ],
            ),
          ),
          _StatusChip(a.status as String, color),
        ],
      ),
    );
  }

  Color _statusColor(String s) => switch (s) {
        'agendado' => AppTheme.statusAgendado,
        'andamento' || 'em_andamento' => AppTheme.statusAndamento,
        'concluido' => AppTheme.statusConcluido,
        'cancelado' => AppTheme.statusCancelado,
        _ => AppTheme.textMuted,
      };

  String _dateBR(String d) {
    final parts = d.split('-');
    return parts.length == 3 ? '${parts[2]}/${parts[1]}' : d;
  }
}

class _StatusChip extends StatelessWidget {
  final String status;
  final Color color;
  const _StatusChip(this.status, this.color);

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Text(
          _label(status),
          style: GoogleFonts.jost(
              color: color, fontSize: 9, fontWeight: FontWeight.w700),
        ),
      );

  String _label(String s) => switch (s) {
        'agendado' => 'Agendado',
        'andamento' || 'em_andamento' => 'Andamento',
        'concluido' => 'Concluído',
        'cancelado' => 'Cancelado',
        _ => s,
      };
}

class _ShimmerCards extends StatelessWidget {
  const _ShimmerCards();

  @override
  Widget build(BuildContext context) => Column(
        children: List.generate(
          3,
          (_) => Container(
            margin: const EdgeInsets.only(bottom: 8),
            height: 72,
            decoration: BoxDecoration(
              color: AppTheme.surface,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppTheme.border),
            ),
          ),
        ),
      );
}
