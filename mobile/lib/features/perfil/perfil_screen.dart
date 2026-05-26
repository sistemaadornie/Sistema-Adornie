import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:dio/dio.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';

class PerfilScreen extends ConsumerStatefulWidget {
  const PerfilScreen({super.key});

  @override
  ConsumerState<PerfilScreen> createState() => _PerfilScreenState();
}

class _PerfilScreenState extends ConsumerState<PerfilScreen> {
  bool _uploading = false;

  Future<void> _pickAndUploadPhoto() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 80,
      maxWidth: 800,
    );
    if (picked == null || !mounted) return;

    setState(() => _uploading = true);
    try {
      final client = ref.read(apiClientProvider);
      final formData = FormData.fromMap({
        'foto': await MultipartFile.fromFile(picked.path,
            filename: 'foto_perfil.jpg'),
      });
      final response = await client.dio.put(
        '/auth/user/foto-upload',
        data: formData,
        options: Options(contentType: 'multipart/form-data'),
      );
      final fotoUrl = response.data['foto_url'] as String?;
      if (fotoUrl != null && mounted) {
        final auth = ref.read(authProvider);
        if (auth is AuthAuthenticated) {
          ref
              .read(authProvider.notifier)
              .updateUser(auth.user.copyWith(fotoUrl: fotoUrl));
        }
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Foto atualizada!')),
          );
        }
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Erro ao atualizar foto.')),
        );
      }
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _logout() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(
          'Sair?',
          style: GoogleFonts.cormorantGaramond(
              color: AppTheme.textPrimary, fontSize: 22, fontWeight: FontWeight.w600),
        ),
        content: Text(
          'Você será desconectado da Agenda Adornie.',
          style: GoogleFonts.jost(color: AppTheme.textSecondary, fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: AppTheme.error,
              foregroundColor: AppTheme.textPrimary,
              minimumSize: const Size(80, 40),
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('SAIR'),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    await ref.read(authProvider.notifier).logout();
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    final user = auth is AuthAuthenticated ? auth.user : null;

    return Scaffold(
      backgroundColor: AppTheme.bg,
      appBar: AppBar(
        title: Text(
          'Perfil',
          style: GoogleFonts.cormorantGaramond(
              color: AppTheme.textPrimary, fontSize: 20, fontWeight: FontWeight.w600),
        ),
      ),
      body: user == null
          ? const Center(
              child: CircularProgressIndicator(color: AppTheme.primary))
          : SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  // ── Avatar ────────────────────────────────────────
                  const SizedBox(height: 16),
                  GestureDetector(
                    onTap: _uploading ? null : _pickAndUploadPhoto,
                    child: Stack(
                      children: [
                        Container(
                          width: 104,
                          height: 104,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(
                                color: AppTheme.primary.withValues(alpha: 0.5),
                                width: 2),
                            color: AppTheme.surfaceStrong,
                          ),
                          child: ClipOval(
                            child: user.fotoUrl != null
                                ? CachedNetworkImage(
                                    imageUrl: user.fotoUrl!,
                                    fit: BoxFit.cover,
                                  )
                                : Center(
                                    child: Text(
                                      user.nomeCompleto[0].toUpperCase(),
                                      style: GoogleFonts.cormorantGaramond(
                                        color: AppTheme.primary,
                                        fontSize: 42,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                          ),
                        ),
                        Positioned(
                          bottom: 0,
                          right: 0,
                          child: Container(
                            padding: const EdgeInsets.all(7),
                            decoration: const BoxDecoration(
                              color: AppTheme.primary,
                              shape: BoxShape.circle,
                            ),
                            child: _uploading
                                ? const SizedBox(
                                    width: 14,
                                    height: 14,
                                    child: CircularProgressIndicator(
                                        color: Color(0xFF0E0D0B), strokeWidth: 2),
                                  )
                                : const Icon(Icons.camera_alt,
                                    color: Color(0xFF0E0D0B), size: 14),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    user.nomeCompleto,
                    style: GoogleFonts.cormorantGaramond(
                      fontSize: 24,
                      fontWeight: FontWeight.w600,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    user.email,
                    style: GoogleFonts.jost(
                        color: AppTheme.textMuted, fontSize: 13),
                  ),
                  const SizedBox(height: 10),
                  if (user.setorNome != null)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 5),
                      decoration: BoxDecoration(
                        color: AppTheme.primary.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                            color: AppTheme.primary.withValues(alpha: 0.3)),
                      ),
                      child: Text(
                        user.setorNome!,
                        style: GoogleFonts.jost(
                            color: AppTheme.primary,
                            fontSize: 12,
                            fontWeight: FontWeight.w500),
                      ),
                    ),
                  const SizedBox(height: 28),

                  // ── Info Card ─────────────────────────────────────
                  Container(
                    decoration: BoxDecoration(
                      color: AppTheme.surface,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: AppTheme.border),
                    ),
                    child: Column(
                      children: [
                        _InfoTile(Icons.badge_outlined, 'Status',
                            _statusLabel(user.status)),
                        Divider(height: 1, color: AppTheme.border),
                        _InfoTile(Icons.business_outlined, 'Empresa',
                            'ID ${user.empresaId}'),
                        if (user.permissoes.isNotEmpty) ...[
                          Divider(height: 1, color: AppTheme.border),
                          _InfoTile(Icons.security_outlined, 'Permissões',
                              user.permissoes.join(', ')),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 28),

                  // ── Logout ────────────────────────────────────────
                  OutlinedButton.icon(
                    onPressed: _logout,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppTheme.error,
                      side: BorderSide(
                          color: AppTheme.error.withValues(alpha: 0.4)),
                      minimumSize: const Size(double.infinity, 48),
                    ),
                    icon: const Icon(Icons.logout, size: 18),
                    label: Text(
                      'SAIR DA CONTA',
                      style: GoogleFonts.jost(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 1),
                    ),
                  ),
                  const SizedBox(height: 32),
                  Text(
                    'Agenda Adornie · v1.0',
                    style: GoogleFonts.jost(
                        color: AppTheme.textMuted,
                        fontSize: 11,
                        letterSpacing: 0.5),
                  ),
                ],
              ),
            ),
    );
  }

  String _statusLabel(String status) => switch (status) {
        'aprovado' => 'Aprovado',
        'pendente' => 'Pendente de aprovação',
        'bloqueado' => 'Bloqueado',
        _ => status,
      };
}

class _InfoTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _InfoTile(this.icon, this.label, this.value);

  @override
  Widget build(BuildContext context) => ListTile(
        leading: Icon(icon, color: AppTheme.primary, size: 20),
        title: Text(
          label,
          style: GoogleFonts.jost(
              fontSize: 10,
              color: AppTheme.textMuted,
              letterSpacing: 0.8,
              fontWeight: FontWeight.w600),
        ),
        subtitle: Text(
          value,
          style: GoogleFonts.jost(
              fontWeight: FontWeight.w500,
              fontSize: 13,
              color: AppTheme.textPrimary),
        ),
      );
}
