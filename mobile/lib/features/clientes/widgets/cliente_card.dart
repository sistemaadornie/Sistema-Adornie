import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../core/theme/app_theme.dart';
import '../models/cliente_model.dart';

class ClienteCard extends StatelessWidget {
  final ClienteModel cliente;

  const ClienteCard({super.key, required this.cliente});

  @override
  Widget build(BuildContext context) {
    final c = cliente;
    final initial = c.nome.isNotEmpty ? c.nome[0].toUpperCase() : '?';

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppTheme.border),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: () => context.push('/clientes/${c.id}'),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppTheme.primary.withValues(alpha: 0.1),
                  border: Border.all(
                      color: AppTheme.primary.withValues(alpha: 0.3)),
                ),
                child: Center(
                  child: Text(
                    initial,
                    style: GoogleFonts.cormorantGaramond(
                      color: AppTheme.primary,
                      fontSize: 20,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      c.nome,
                      style: GoogleFonts.jost(
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    if (c.telefone != null) ...[
                      const SizedBox(height: 2),
                      Row(children: [
                        const Icon(Icons.phone_outlined,
                            size: 12, color: AppTheme.textMuted),
                        const SizedBox(width: 4),
                        Text(
                          c.telefone!,
                          style: GoogleFonts.jost(
                              fontSize: 11, color: AppTheme.textSecondary),
                        ),
                      ]),
                    ],
                    if (c.enderecoPadrao != null) ...[
                      const SizedBox(height: 2),
                      Row(children: [
                        const Icon(Icons.location_on_outlined,
                            size: 12, color: AppTheme.textMuted),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            c.enderecoPadrao!.cidade,
                            style: GoogleFonts.jost(
                                fontSize: 11, color: AppTheme.textSecondary),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ]),
                    ],
                  ],
                ),
              ),
              const Icon(Icons.chevron_right,
                  color: AppTheme.textMuted, size: 18),
            ],
          ),
        ),
      ),
    );
  }
}
