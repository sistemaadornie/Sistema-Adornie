import 'dart:convert';

class UserModel {
  final int id;
  final String email;
  final String nomeCompleto;
  final String? fotoUrl;
  final String status;
  final int empresaId;
  final int? setorId;
  final String? setorNome;
  final List<String> permissoes;

  const UserModel({
    required this.id,
    required this.email,
    required this.nomeCompleto,
    this.fotoUrl,
    required this.status,
    required this.empresaId,
    this.setorId,
    this.setorNome,
    required this.permissoes,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) => UserModel(
        id: json['id'] as int,
        email: json['email'] as String,
        nomeCompleto: json['nome_completo'] as String,
        fotoUrl: json['foto_url'] as String?,
        status: json['status'] as String? ?? 'aprovado',
        empresaId: json['empresa_id'] as int,
        setorId: json['setor_id'] as int?,
        setorNome: json['setor_nome'] as String?,
        permissoes: List<String>.from(json['permissoes'] ?? []),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'email': email,
        'nome_completo': nomeCompleto,
        'foto_url': fotoUrl,
        'status': status,
        'empresa_id': empresaId,
        'setor_id': setorId,
        'setor_nome': setorNome,
        'permissoes': permissoes,
      };

  String toJsonString() => jsonEncode(toJson());

  factory UserModel.fromJsonString(String s) =>
      UserModel.fromJson(jsonDecode(s) as Map<String, dynamic>);

  bool get isAdmin => permissoes.contains('ADMIN_MASTER');
  bool get isInstalador => permissoes.contains('AGENDAMENTO_INSTALADOR');
  bool get isOperador => permissoes.contains('OPERADOR_AGENDA');
  bool get isVendedor => permissoes.contains('VENDEDOR');

  UserModel copyWith({String? fotoUrl}) => UserModel(
        id: id,
        email: email,
        nomeCompleto: nomeCompleto,
        fotoUrl: fotoUrl ?? this.fotoUrl,
        status: status,
        empresaId: empresaId,
        setorId: setorId,
        setorNome: setorNome,
        permissoes: permissoes,
      );
}
