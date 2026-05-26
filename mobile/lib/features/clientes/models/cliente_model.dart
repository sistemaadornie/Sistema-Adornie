class EnderecoModel {
  final int id;
  final String rua;
  final String numero;
  final String cidade;
  final String cep;
  final String? complemento;
  final double? lat;
  final double? lng;
  final bool isPadrao;

  const EnderecoModel({
    required this.id,
    required this.rua,
    required this.numero,
    required this.cidade,
    required this.cep,
    this.complemento,
    this.lat,
    this.lng,
    required this.isPadrao,
  });

  factory EnderecoModel.fromJson(Map<String, dynamic> json) => EnderecoModel(
        id: json['id'] as int,
        rua: json['rua'] as String? ?? '',
        numero: json['numero'] as String? ?? '',
        cidade: json['cidade'] as String? ?? '',
        cep: json['cep'] as String? ?? '',
        complemento: json['complemento'] as String?,
        lat: (json['lat'] as num?)?.toDouble(),
        lng: (json['lng'] as num?)?.toDouble(),
        isPadrao: json['is_padrao'] as bool? ?? false,
      );

  String get enderecoCompleto =>
      '$rua, $numero${complemento != null ? ' - $complemento' : ''}, $cidade - CEP $cep';
}

class ClienteModel {
  final int id;
  final String nome;
  final String? telefone;
  final String? email;
  final int empresaId;
  final List<EnderecoModel> enderecos;

  const ClienteModel({
    required this.id,
    required this.nome,
    this.telefone,
    this.email,
    required this.empresaId,
    required this.enderecos,
  });

  factory ClienteModel.fromJson(Map<String, dynamic> json) => ClienteModel(
        id: json['id'] as int,
        nome: json['nome'] as String? ?? '',
        telefone: json['telefone'] as String?,
        email: json['email'] as String?,
        empresaId: json['empresa_id'] as int? ?? 0,
        enderecos: json['enderecos'] != null
            ? (json['enderecos'] as List)
                .map((e) => EnderecoModel.fromJson(e as Map<String, dynamic>))
                .toList()
            : [],
      );

  EnderecoModel? get enderecoPadrao =>
      enderecos.where((e) => e.isPadrao).firstOrNull ?? enderecos.firstOrNull;
}
