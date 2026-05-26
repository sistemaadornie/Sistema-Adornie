import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/api/api_client.dart';
import '../../../core/auth/auth_provider.dart';
import '../../../core/theme/app_theme.dart';
import '../providers/agendamentos_provider.dart';

class AgendamentoFormScreen extends ConsumerStatefulWidget {
  final int? editId;
  const AgendamentoFormScreen({super.key, this.editId});

  @override
  ConsumerState<AgendamentoFormScreen> createState() =>
      _AgendamentoFormScreenState();
}

class _AgendamentoFormScreenState
    extends ConsumerState<AgendamentoFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _tituloCtrl = TextEditingController();
  final _tipoCtrl = TextEditingController(text: 'Instalação');
  final _enderecoCtrl = TextEditingController();
  DateTime? _data;
  TimeOfDay? _hora;
  bool _loading = false;
  String? _error;

  // Clientes para selecionar
  List<Map<String, dynamic>> _clientes = [];
  int? _clienteId;

  @override
  void initState() {
    super.initState();
    _loadClientes();
  }

  @override
  void dispose() {
    _tituloCtrl.dispose();
    _tipoCtrl.dispose();
    _enderecoCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadClientes() async {
    try {
      final client = ref.read(apiClientProvider);
      final response = await client.dio.get('/clientes');
      final list = response.data['clientes'] as List? ?? [];
      if (mounted) {
        setState(() {
          _clientes = list.map((e) => e as Map<String, dynamic>).toList();
        });
      }
    } catch (_) {}
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_data == null) {
      setState(() => _error = 'Selecione a data.');
      return;
    }
    if (_hora == null) {
      setState(() => _error = 'Selecione a hora.');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    final data = {
      'titulo': _tituloCtrl.text.trim(),
      'tipo': _tipoCtrl.text.trim(),
      'data':
          '${_data!.year}-${_data!.month.toString().padLeft(2, '0')}-${_data!.day.toString().padLeft(2, '0')}',
      'hora':
          '${_hora!.hour.toString().padLeft(2, '0')}:${_hora!.minute.toString().padLeft(2, '0')}',
      'status': 'agendado',
      if (_clienteId != null) 'cliente_id': _clienteId,
      if (_enderecoCtrl.text.isNotEmpty) 'endereco': _enderecoCtrl.text.trim(),
    };

    final success =
        await ref.read(agendamentosProvider.notifier).create(data);
    if (!mounted) return;

    if (success) {
      context.pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Agendamento criado!')),
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
          title: Text(
              widget.editId == null ? 'Novo Agendamento' : 'Editar Agendamento'),
        ),
        body: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextFormField(
                  controller: _tituloCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Título *',
                    prefixIcon: Icon(Icons.title),
                  ),
                  validator: (v) => v!.isEmpty ? 'Obrigatório' : null,
                ),
                const SizedBox(height: 12),

                // Tipo
                DropdownButtonFormField<String>(
                  value: _tipoCtrl.text,
                  decoration: const InputDecoration(
                    labelText: 'Tipo *',
                    prefixIcon: Icon(Icons.category_outlined),
                  ),
                  items: ['Instalação', 'Manutenção', 'Visita', 'Outro']
                      .map((t) => DropdownMenuItem(value: t, child: Text(t)))
                      .toList(),
                  onChanged: (v) => _tipoCtrl.text = v ?? 'Instalação',
                ),
                const SizedBox(height: 12),

                // Cliente
                if (_clientes.isNotEmpty)
                  DropdownButtonFormField<int?>(
                    value: _clienteId,
                    decoration: const InputDecoration(
                      labelText: 'Cliente',
                      prefixIcon: Icon(Icons.person_outline),
                    ),
                    items: [
                      const DropdownMenuItem<int?>(
                          value: null, child: Text('Sem cliente')),
                      ..._clientes.map((c) => DropdownMenuItem<int?>(
                            value: c['id'] as int,
                            child: Text(c['nome'] as String? ?? ''),
                          )),
                    ],
                    onChanged: (v) => setState(() => _clienteId = v),
                  ),
                const SizedBox(height: 12),

                // Data
                InkWell(
                  onTap: () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: _data ?? DateTime.now(),
                      firstDate: DateTime.now().subtract(const Duration(days: 1)),
                      lastDate: DateTime.now().add(const Duration(days: 365)),
                    );
                    if (picked != null) setState(() => _data = picked);
                  },
                  child: InputDecorator(
                    decoration: const InputDecoration(
                      labelText: 'Data *',
                      prefixIcon: Icon(Icons.calendar_today),
                    ),
                    child: Text(
                      _data == null
                          ? 'Selecionar data'
                          : '${_data!.day.toString().padLeft(2, '0')}/${_data!.month.toString().padLeft(2, '0')}/${_data!.year}',
                      style: TextStyle(
                        color: _data == null ? Colors.grey : null,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 12),

                // Hora
                InkWell(
                  onTap: () async {
                    final picked = await showTimePicker(
                      context: context,
                      initialTime: _hora ?? TimeOfDay.now(),
                    );
                    if (picked != null) setState(() => _hora = picked);
                  },
                  child: InputDecorator(
                    decoration: const InputDecoration(
                      labelText: 'Hora *',
                      prefixIcon: Icon(Icons.access_time),
                    ),
                    child: Text(
                      _hora == null
                          ? 'Selecionar hora'
                          : _hora!.format(context),
                      style: TextStyle(
                        color: _hora == null ? Colors.grey : null,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 12),

                TextFormField(
                  controller: _enderecoCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Endereço',
                    prefixIcon: Icon(Icons.location_on_outlined),
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
                      : const Text('Salvar'),
                ),
              ],
            ),
          ),
        ),
      );
}
