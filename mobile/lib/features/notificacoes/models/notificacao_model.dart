class NotificacaoModel {
  final int id;
  final String tipo;
  final String? mensagem;
  final int? usuarioId;
  final bool lida;
  final String criadoEm;

  const NotificacaoModel({
    required this.id,
    required this.tipo,
    this.mensagem,
    this.usuarioId,
    required this.lida,
    required this.criadoEm,
  });

  factory NotificacaoModel.fromJson(Map<String, dynamic> json) =>
      NotificacaoModel(
        id: json['id'] as int,
        tipo: json['tipo'] as String? ?? '',
        mensagem: json['mensagem'] as String?,
        usuarioId: json['usuario_id'] as int?,
        lida: json['lida'] as bool? ?? false,
        criadoEm: json['criado_em'] as String? ?? '',
      );

  NotificacaoModel copyWith({bool? lida}) => NotificacaoModel(
        id: id,
        tipo: tipo,
        mensagem: mensagem,
        usuarioId: usuarioId,
        lida: lida ?? this.lida,
        criadoEm: criadoEm,
      );
}
