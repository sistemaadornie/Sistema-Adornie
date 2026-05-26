import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/status_badge.dart';
import '../models/agendamento_model.dart';

class AgendamentoCard extends StatelessWidget {
  final AgendamentoModel agendamento;

  const AgendamentoCard({super.key, required this.agendamento});

  @override
  Widget build(BuildContext context) {
    final a = agendamento;
    final color = statusColor(a.status);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppTheme.border),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: () => context.push('/agendamentos/${a.id}'),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 46,
                height: 46,
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
                      a.titulo,
                      style: GoogleFonts.jost(
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                        color: AppTheme.textPrimary,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    if (a.clienteNome != null)
                      Text(
                        a.clienteNome!,
                        style: GoogleFonts.jost(
                            color: AppTheme.textSecondary, fontSize: 11),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        const Icon(Icons.calendar_today,
                            size: 11, color: AppTheme.textMuted),
                        const SizedBox(width: 4),
                        Text(
                          _formatDate(a.data),
                          style: GoogleFonts.jost(
                              fontSize: 11, color: AppTheme.textMuted),
                        ),
                        const SizedBox(width: 10),
                        const Icon(Icons.access_time,
                            size: 11, color: AppTheme.textMuted),
                        const SizedBox(width: 4),
                        Text(
                          a.hora.length >= 5 ? a.hora.substring(0, 5) : a.hora,
                          style: GoogleFonts.jost(
                              fontSize: 11, color: AppTheme.textMuted),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              StatusBadge(a.status),
            ],
          ),
        ),
      ),
    );
  }

  String _formatDate(String date) {
    try {
      final parts = date.split('-');
      if (parts.length == 3) return '${parts[2]}/${parts[1]}/${parts[0]}';
    } catch (_) {}
    return date;
  }
}
