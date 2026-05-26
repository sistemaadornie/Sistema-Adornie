import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';
import '../providers/clientes_provider.dart';

class ClienteFormScreen extends ConsumerStatefulWidget {
  final int? editId;
  const ClienteFormScreen({super.key, this.editId});

  @override
  ConsumerState<ClienteFormScreen> createState() => _ClienteFormScreenState();
}

class _ClienteFormScreenState extends ConsumerState<ClienteFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nomeCtrl = TextEditingController();
  final _telefoneCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();

  // Endereço
  final _ruaCtrl = TextEditingController();
  final _numeroCtrl = TextEditingController();
  final _cidadeCtrl = TextEditingController();
  final _cepCtrl = TextEditingController();
  final _complementoCtrl = TextEditingController();

  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _nomeCtrl.dispose();
    _telefoneCtrl.dispose();
    _emailCtrl.dispose();
    _ruaCtrl.dispose();
    _numeroCtrl.dispose();
    _cidadeCtrl.dispose();
    _cepCtrl.dispose();
    _complementoCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
    });

    final data = {
      'nome': _nomeCtrl.text.trim(),
      if (_telefoneCtrl.text.isNotEmpty) 'telefone': _telefoneCtrl.text.trim(),
      if (_emailCtrl.text.isNotEmpty) 'email': _emailCtrl.text.trim(),
    };

    bool success;
    if (widget.editId != null) {
      success =
          await ref.read(clientesProvider.notifier).update(widget.editId!, data);
    } else {
      success = await ref.read(clientesProvider.notifier).create(data);
    }

    if (!mounted) return;

    if (success) {
      context.pop();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text(widget.editId != null
                ? 'Cliente atualizado!'
                : 'Cliente criado!')),
      );
    } else {
      setState(() {
        _loading = false;
        _error = 'Erro ao salvar. Tente novamente.';
      });
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title:
              Text(widget.editId != null ? 'Editar Cliente' : 'Novo Cliente'),
        ),
        body: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _section('DADOS DO CLIENTE'),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _nomeCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Nome completo *',
                    prefixIcon: Icon(Icons.person_outline),
                  ),
                  validator: (v) => v!.isEmpty ? 'Obrigatório' : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _telefoneCtrl,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(
                    labelText: 'Telefone',
                    prefixIcon: Icon(Icons.phone_outlined),
                  ),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _emailCtrl,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(
                    labelText: 'E-mail',
                    prefixIcon: Icon(Icons.email_outlined),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppTheme.error.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(_error!,
                        style: const TextStyle(color: AppTheme.error)),
                  ),
                ],
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: _loading ? null : _submit,
                  child: _loading
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(
                              color: Colors.white, strokeWidth: 2),
                        )
                      : Text(widget.editId != null ? 'Atualizar' : 'Criar Cliente'),
                ),
              ],
            ),
          ),
        ),
      );

  Widget _section(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: Text(
          text,
          style: const TextStyle(
            fontSize: 11,
            color: AppTheme.primary,
            fontWeight: FontWeight.w600,
            letterSpacing: 1,
          ),
        ),
      );
}
