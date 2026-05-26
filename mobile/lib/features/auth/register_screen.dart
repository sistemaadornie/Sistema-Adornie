import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/theme/app_theme.dart';

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _empresaCtrl = TextEditingController();
  final _cnpjCtrl = TextEditingController();
  final _nomeCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _cpfCtrl = TextEditingController();
  final _senhaCtrl = TextEditingController();
  bool _obscure = true;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _empresaCtrl.dispose();
    _cnpjCtrl.dispose();
    _nomeCtrl.dispose();
    _emailCtrl.dispose();
    _cpfCtrl.dispose();
    _senhaCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ref.read(authProvider.notifier).registerEmpresa(
            nomeEmpresa: _empresaCtrl.text.trim(),
            cnpj: _cnpjCtrl.text.trim(),
            nomeAdmin: _nomeCtrl.text.trim(),
            email: _emailCtrl.text.trim(),
            senha: _senhaCtrl.text,
            cpf: _cpfCtrl.text.trim(),
          );
    } catch (e) {
      setState(() => _error = 'Erro ao criar conta. Verifique os dados.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bg,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, size: 18),
          onPressed: () => context.pop(),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 40),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Header
              Padding(
                padding: const EdgeInsets.only(bottom: 32),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Solicitar Acesso',
                      style: GoogleFonts.cormorantGaramond(
                        fontSize: 32,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Preencha os dados do seu salão para começar.',
                      style: GoogleFonts.jost(
                        fontSize: 13,
                        fontWeight: FontWeight.w300,
                        color: AppTheme.textMuted,
                        height: 1.6,
                      ),
                    ),
                  ],
                ),
              ),

              // Seção empresa
              _sectionLabel('DADOS DA EMPRESA'),
              const SizedBox(height: 12),
              _field(
                controller: _empresaCtrl,
                label: 'NOME DA EMPRESA',
                icon: Icons.store_outlined,
                validator: (v) => v!.isEmpty ? 'Obrigatório' : null,
              ),
              const SizedBox(height: 12),
              _field(
                controller: _cnpjCtrl,
                label: 'CNPJ',
                icon: Icons.badge_outlined,
                keyboardType: TextInputType.number,
                validator: (v) => v!.isEmpty ? 'Obrigatório' : null,
              ),
              const SizedBox(height: 28),

              // Seção administrador
              _sectionLabel('DADOS DO ADMINISTRADOR'),
              const SizedBox(height: 12),
              _field(
                controller: _nomeCtrl,
                label: 'NOME COMPLETO',
                icon: Icons.person_outline,
                validator: (v) => v!.isEmpty ? 'Obrigatório' : null,
              ),
              const SizedBox(height: 12),
              _field(
                controller: _cpfCtrl,
                label: 'CPF',
                icon: Icons.credit_card_outlined,
                keyboardType: TextInputType.number,
                validator: (v) => v!.isEmpty ? 'Obrigatório' : null,
              ),
              const SizedBox(height: 12),
              _field(
                controller: _emailCtrl,
                label: 'E-MAIL',
                icon: Icons.alternate_email,
                keyboardType: TextInputType.emailAddress,
                validator: (v) =>
                    v != null && v.contains('@') ? null : 'E-mail inválido',
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _senhaCtrl,
                obscureText: _obscure,
                style: const TextStyle(color: AppTheme.textPrimary),
                decoration: InputDecoration(
                  labelText: 'SENHA',
                  prefixIcon: const Icon(Icons.lock_outline, size: 18),
                  suffixIcon: IconButton(
                    icon: Icon(
                      _obscure
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                      size: 18,
                    ),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  ),
                ),
                validator: (v) =>
                    v != null && v.length >= 6 ? null : 'Mínimo 6 caracteres',
              ),

              if (_error != null) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppTheme.error.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(
                        color: AppTheme.error.withValues(alpha: 0.25)),
                  ),
                  child: Text(
                    _error!,
                    style: GoogleFonts.jost(
                      color: const Color(0xFFD4856E),
                      fontSize: 13,
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 32),
              FilledButton(
                onPressed: _loading ? null : _submit,
                child: _loading
                    ? const SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(
                            color: Color(0xFF0E0D0B), strokeWidth: 2),
                      )
                    : const Text('SOLICITAR ACESSO'),
              ),
              const SizedBox(height: 16),
              TextButton(
                onPressed: () => context.pop(),
                child: Text(
                  'Já tenho uma conta',
                  style: GoogleFonts.jost(
                    color: AppTheme.textMuted,
                    fontSize: 13,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _sectionLabel(String text) => Text(
        text,
        style: GoogleFonts.jost(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: AppTheme.textMuted,
          letterSpacing: 1.5,
        ),
      );

  Widget _field({
    required TextEditingController controller,
    required String label,
    required IconData icon,
    TextInputType? keyboardType,
    String? Function(String?)? validator,
  }) =>
      TextFormField(
        controller: controller,
        keyboardType: keyboardType,
        style: const TextStyle(color: AppTheme.textPrimary),
        decoration: InputDecoration(
          labelText: label,
          prefixIcon: Icon(icon, size: 18),
        ),
        validator: validator,
      );
}
