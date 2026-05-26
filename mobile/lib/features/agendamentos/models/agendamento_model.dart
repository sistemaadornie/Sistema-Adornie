class AgendamentoModel {
  final int id;
  final String titulo;
  final int? clienteId;
  final String? clienteNome;
  final String data;
  final String hora;
  final String tipo;
  final String status;
  final List<int> equipeIds;
  final List<dynamic> itens;
  final double? lat;
  final double? lng;
  final String? endereco;
  final int empresaId;
  final String createdAt;

  const AgendamentoModel({
    required this.id,
    required this.titulo,
    this.clienteId,
    this.clienteNome,
    required this.data,
    required this.hora,
    required this.tipo,
    required this.status,
    required this.equipeIds,
    required this.itens,
    this.lat,
    this.lng,
    this.endereco,
    required this.empresaId,
    required this.createdAt,
  });

  factory AgendamentoModel.fromJson(Map<String, dynamic> json) =>
      AgendamentoModel(
        id: json['id'] as int,
        titulo: json['titulo'] as String? ?? '',
        clienteId: json['cliente_id'] as int?,
        clienteNome: json['cliente_nome'] as String?,
        data: json['data'] as String? ?? '',
        hora: json['hora'] as String? ?? '',
        tipo: json['tipo'] as String? ?? '',
        status: json['status'] as String? ?? 'agendado',
        equipeIds: json['equipe_ids'] != null
            ? List<int>.from(json['equipe_ids'] as List)
            : [],
        itens: json['itens'] as List? ?? [],
        lat: (json['lat'] as num?)?.toDouble(),
        lng: (json['lng'] as num?)?.toDouble(),
        endereco: json['endereco'] as String?,
        empresaId: json['empresa_id'] as int? ?? 0,
        createdAt: json['created_at'] as String? ?? '',
      );

  Map<String, dynamic> toJson() => {
        'titulo': titulo,
        'cliente_id': clienteId,
        'data': data,
        'hora': hora,
        'tipo': tipo,
        'status': status,
        'equipe_ids': equipeIds,
        'itens': itens,
        'endereco': endereco,
      };
}
