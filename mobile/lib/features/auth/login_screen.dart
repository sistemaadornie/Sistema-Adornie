import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/theme/app_theme.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailCtrl = TextEditingController();
  final _senhaCtrl = TextEditingController();
  bool _obscure = true;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _emailCtrl.dispose();
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
      await ref
          .read(authProvider.notifier)
          .login(_emailCtrl.text.trim(), _senhaCtrl.text);
    } catch (e) {
      setState(() => _error = 'E-mail ou senha incorretos.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: Stack(
        children: [
          // Gradiente dourado decorativo
          Positioned(
            left: -80,
            top: MediaQuery.of(context).size.height * 0.1,
            child: Container(
              width: 320,
              height: 320,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    AppTheme.primary.withValues(alpha: 0.07),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          SafeArea(
            child: Column(
              children: [
                // ── Seção de marca ──────────────────────────────────
                Expanded(
                  flex: 5,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(32, 40, 32, 24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Image.asset(
                          'assets/images/logo-adornie.png',
                          height: 80,
                          filterQuality: FilterQuality.high,
                        ),
                        const SizedBox(height: 20),
                        Container(
                          width: 40,
                          height: 1,
                          color: AppTheme.primary.withValues(alpha: 0.6),
                        ),
                        const SizedBox(height: 28),
                        Text(
                          'Gestão elegante\npara o seu salão.',
                          style: GoogleFonts.cormorantGaramond(
                            fontSize: 30,
                            fontWeight: FontWeight.w500,
                            fontStyle: FontStyle.italic,
                            color: AppTheme.textPrimary,
                            height: 1.35,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          'Agendamentos, clientes e relatórios\nnum só lugar.',
                          style: GoogleFonts.jost(
                            fontSize: 13,
                            fontWeight: FontWeight.w300,
                            color: AppTheme.textMuted,
                            height: 1.7,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                // ── Formulário ──────────────────────────────────────
                Container(
                  decoration: BoxDecoration(
                    color: AppTheme.surface,
                    borderRadius: const BorderRadius.vertical(
                        top: Radius.circular(20)),
                    border: Border(
                        top: BorderSide(
                            color: AppTheme.border)),
                  ),
                  padding: const EdgeInsets.fromLTRB(28, 32, 28, 24),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          'Entrar',
                          style: GoogleFonts.cormorantGaramond(
                            fontSize: 28,
                            fontWeight: FontWeight.w600,
                            color: AppTheme.textPrimary,
                            letterSpacing: 0.5,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Acesse sua conta para continuar',
                          style: GoogleFonts.jost(
                            fontSize: 13,
                            fontWeight: FontWeight.w300,
                            color: AppTheme.textMuted,
                          ),
                        ),
                        const SizedBox(height: 24),
                        TextFormField(
                          controller: _emailCtrl,
                          keyboardType: TextInputType.emailAddress,
                          style: const TextStyle(color: AppTheme.textPrimary),
                          decoration: const InputDecoration(
                            labelText: 'E-MAIL',
                            prefixIcon:
                                Icon(Icons.alternate_email, size: 18),
                          ),
                          validator: (v) =>
                              v != null && v.contains('@')
                                  ? null
                                  : 'E-mail inválido',
                        ),
                        const SizedBox(height: 14),
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
                              onPressed: () =>
                                  setState(() => _obscure = !_obscure),
                            ),
                          ),
                          validator: (v) =>
                              v != null && v.length >= 6
                                  ? null
                                  : 'Mínimo 6 caracteres',
                        ),
                        if (_error != null) ...[
                          const SizedBox(height: 14),
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color:
                                  AppTheme.error.withValues(alpha: 0.08),
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(
                                  color: AppTheme.error
                                      .withValues(alpha: 0.25)),
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
                        const SizedBox(height: 24),
                        FilledButton(
                          onPressed: _loading ? null : _submit,
                          child: _loading
                              ? const SizedBox(
                                  height: 18,
                                  width: 18,
                                  child: CircularProgressIndicator(
                                      color: Color(0xFF0E0D0B),
                                      strokeWidth: 2),
                                )
                              : const Text('ENTRAR'),
                        ),
                        const SizedBox(height: 12),
                        TextButton(
                          onPressed: () => context.push('/register'),
                          child: Text(
                            'Solicitar acesso para sua empresa',
                            style: GoogleFonts.jost(
                              color: AppTheme.textMuted,
                              fontSize: 13,
                              fontWeight: FontWeight.w400,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
