import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/loading_widget.dart';
import '../providers/relatorios_provider.dart';

class RelatoriosScreen extends ConsumerWidget {
  const RelatoriosScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(relatoriosProvider);

    return Scaffold(
      backgroundColor: AppTheme.bg,
      appBar: AppBar(
        title: Text(
          'Relatórios',
          style: GoogleFonts.cormorantGaramond(
            color: AppTheme.textPrimary,
            fontSize: 20,
            fontWeight: FontWeight.w600,
          ),
        ),
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.tune, color: AppTheme.textSecondary),
            onSelected: (v) =>
                ref.read(relatoriosProvider.notifier).load(periodo: v),
            itemBuilder: (_) => [
              _menuItem('7d', 'Últimos 7 dias'),
              _menuItem('30d', 'Últimos 30 dias'),
              _menuItem('90d', 'Últimos 90 dias'),
              _menuItem('6m', 'Últimos 6 meses'),
              _menuItem('1a', 'Último ano'),
            ],
          ),
        ],
      ),
      body: state.isLoading
          ? const LoadingWidget()
          : state.error != null
              ? Center(
                  child: Text(state.error!,
                      style: const TextStyle(color: AppTheme.textSecondary)),
                )
              : RefreshIndicator(
                  color: AppTheme.primary,
                  backgroundColor: AppTheme.surfaceStrong,
                  onRefresh: () =>
                      ref.read(relatoriosProvider.notifier).load(),
                  child: SingleChildScrollView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Período
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 14, vertical: 6),
                          decoration: BoxDecoration(
                            color: AppTheme.primary.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(
                                color: AppTheme.primary.withValues(alpha: 0.3)),
                          ),
                          child: Text(
                            _periodoLabel(state.periodo),
                            style: GoogleFonts.jost(
                                color: AppTheme.primary, fontSize: 12),
                          ),
                        ),
                        const SizedBox(height: 20),

                        _KpiGrid(state),
                        const SizedBox(height: 28),

                        if (state.porStatus.isNotEmpty) ...[
                          _SectionLabel('DISTRIBUIÇÃO POR STATUS'),
                          const SizedBox(height: 14),
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: AppTheme.surface,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: AppTheme.border),
                            ),
                            child: SizedBox(
                              height: 220,
                              child: _StatusPieChart(state.porStatus),
                            ),
                          ),
                          const SizedBox(height: 28),
                        ],

                        if (state.porDia.isNotEmpty) ...[
                          _SectionLabel('AGENDAMENTOS POR DIA'),
                          const SizedBox(height: 14),
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: AppTheme.surface,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: AppTheme.border),
                            ),
                            child: SizedBox(
                              height: 200,
                              child: _DayBarChart(state.porDia),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
    );
  }

  PopupMenuItem<String> _menuItem(String value, String label) =>
      PopupMenuItem(
        value: value,
        child: Text(label, style: GoogleFonts.jost(color: AppTheme.textPrimary, fontSize: 13)),
      );

  String _periodoLabel(String p) => switch (p) {
        '7d' => 'Últimos 7 dias',
        '30d' => 'Últimos 30 dias',
        '90d' => 'Últimos 90 dias',
        '6m' => 'Últimos 6 meses',
        '1a' => 'Último ano',
        _ => p,
      };
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

class _KpiGrid extends StatelessWidget {
  final RelatoriosState state;
  const _KpiGrid(this.state);

  @override
  Widget build(BuildContext context) => Column(
        children: [
          Row(children: [
            _Kpi('Total', state.total, AppTheme.primary, Icons.calendar_month_outlined),
            const SizedBox(width: 10),
            _Kpi('Concluídos', state.concluidos, AppTheme.statusConcluido,
                Icons.check_circle_outline),
          ]),
          const SizedBox(height: 10),
          Row(children: [
            _Kpi('Em Andamento', state.emAndamento, AppTheme.statusAndamento,
                Icons.timelapse_outlined),
            const SizedBox(width: 10),
            _Kpi('Taxa', '${state.taxaConclusao.toStringAsFixed(0)}%',
                AppTheme.secondary, Icons.trending_up),
          ]),
        ],
      );
}

class _Kpi extends StatelessWidget {
  final String label;
  final dynamic value;
  final Color color;
  final IconData icon;

  const _Kpi(this.label, this.value, this.color, this.icon);

  @override
  Widget build(BuildContext context) => Expanded(
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppTheme.surface,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppTheme.border),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(icon, color: color, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      value.toString(),
                      style: GoogleFonts.cormorantGaramond(
                        fontSize: 24,
                        fontWeight: FontWeight.w700,
                        color: color,
                        height: 1,
                      ),
                    ),
                    Text(
                      label,
                      style: GoogleFonts.jost(
                          fontSize: 10, color: AppTheme.textMuted),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
}

class _StatusPieChart extends StatelessWidget {
  final List<Map<String, dynamic>> data;
  const _StatusPieChart(this.data);

  Color _color(String status) => statusColor(status);

  @override
  Widget build(BuildContext context) {
    final sections = data.map((d) {
      final status = d['status'] as String? ?? '';
      final count = (d['total'] as num?)?.toInt() ?? 0;
      return PieChartSectionData(
        color: _color(status),
        value: count.toDouble(),
        title: count > 0 ? count.toString() : '',
        radius: 80,
        titleStyle: GoogleFonts.jost(
          fontSize: 13,
          fontWeight: FontWeight.bold,
          color: AppTheme.bg,
        ),
      );
    }).toList();

    return Row(
      children: [
        Expanded(
          child: PieChart(PieChartData(
            sections: sections,
            centerSpaceRadius: 36,
            sectionsSpace: 2,
          )),
        ),
        const SizedBox(width: 16),
        Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: data.map((d) {
            final status = d['status'] as String? ?? '';
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(children: [
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: _color(status),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  statusLabel(status),
                  style: GoogleFonts.jost(
                      fontSize: 11, color: AppTheme.textSecondary),
                ),
              ]),
            );
          }).toList(),
        ),
      ],
    );
  }
}

class _DayBarChart extends StatelessWidget {
  final List<Map<String, dynamic>> data;
  const _DayBarChart(this.data);

  @override
  Widget build(BuildContext context) {
    final last = data.take(14).toList().reversed.toList();
    final spots = List.generate(last.length, (i) {
      final total = (last[i]['total'] as num?)?.toDouble() ?? 0;
      return BarChartGroupData(
        x: i,
        barRods: [
          BarChartRodData(
            toY: total,
            color: AppTheme.primary,
            width: 14,
            borderRadius:
                const BorderRadius.vertical(top: Radius.circular(4)),
          ),
        ],
      );
    });

    return BarChart(BarChartData(
      barGroups: spots,
      gridData: const FlGridData(show: false),
      borderData: FlBorderData(show: false),
      titlesData: FlTitlesData(
        show: true,
        bottomTitles: AxisTitles(
          sideTitles: SideTitles(
            showTitles: true,
            getTitlesWidget: (v, _) {
              final idx = v.toInt();
              if (idx < 0 || idx >= last.length) return const SizedBox();
              final date = last[idx]['data'] as String? ?? '';
              final parts = date.split('-');
              final label =
                  parts.length >= 3 ? '${parts[2]}/${parts[1]}' : date;
              return Transform.rotate(
                angle: -0.5,
                child: Text(
                  label,
                  style: GoogleFonts.jost(
                      fontSize: 9, color: AppTheme.textMuted),
                ),
              );
            },
          ),
        ),
        leftTitles:
            const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        topTitles:
            const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        rightTitles:
            const AxisTitles(sideTitles: SideTitles(showTitles: false)),
      ),
    ));
  }
}
