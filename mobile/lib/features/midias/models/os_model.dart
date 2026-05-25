class OsModel {
  final int id;
  final int pedidoItemId;
  final String itemDescricao;
  final String status; // aberta | em_andamento | aguardando_aprovacao | encerrada
  final String? responsavelNome;
  final String abertaEm;
  final String? encerradaEm;
  final int totalFotos;
  final int totalVideos;

  const OsModel({
    required this.id,
    required this.pedidoItemId,
    required this.itemDescricao,
    required this.status,
    this.responsavelNome,
    required this.abertaEm,
    this.encerradaEm,
    this.totalFotos = 0,
    this.totalVideos = 0,
  });

  factory OsModel.fromJson(Map<String, dynamic> j) => OsModel(
        id: j['id'] as int,
        pedidoItemId: j['pedido_item_id'] as int? ?? 0,
        itemDescricao: j['item_descricao'] as String? ?? '',
        status: j['status'] as String,
        responsavelNome: j['responsavel_nome'] as String?,
        abertaEm: j['aberta_em'] as String? ?? '',
        encerradaEm: j['encerrada_em'] as String?,
        totalFotos: int.tryParse(j['total_fotos']?.toString() ?? '0') ?? 0,
        totalVideos: int.tryParse(j['total_videos']?.toString() ?? '0') ?? 0,
      );

  int get totalMidias => totalFotos + totalVideos;
}
