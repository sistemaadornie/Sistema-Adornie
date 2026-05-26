import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/auth/auth_provider.dart';
import '../../../core/storage/upload_queue_db.dart';
import '../../../core/storage/upload_queue_item.dart';
import '../../../core/upload/midias_api_service.dart';
import '../../../core/upload/upload_queue_processor.dart';
import '../models/os_model.dart';

// ── Providers de infraestrutura ──────────────────────────────────────────────

final midiasApiProvider = Provider<MidiasApiService>((ref) {
  final client = ref.watch(apiClientProvider);
  return MidiasApiService(client);
});

final processorProvider = Provider<UploadQueueProcessor>((ref) {
  final api = ref.watch(midiasApiProvider);
  return UploadQueueProcessor(api);
});

// ── Ordens de serviço de um pedido ──────────────────────────────────────────

class OrdensState {
  final List<OsModel> items;
  final bool isLoading;
  final String? error;

  const OrdensState({this.items = const [], this.isLoading = false, this.error});

  OrdensState copyWith({List<OsModel>? items, bool? isLoading, String? error}) =>
      OrdensState(
        items: items ?? this.items,
        isLoading: isLoading ?? this.isLoading,
        error: error,
      );
}

class OrdensNotifier extends StateNotifier<OrdensState> {
  final MidiasApiService _api;
  final int pedidoId;

  OrdensNotifier(this._api, this.pedidoId) : super(const OrdensState()) {
    load();
  }

  Future<void> load() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final data = await _api.listarOrdens(pedidoId);
      state = state.copyWith(
        isLoading: false,
        items: data.map(OsModel.fromJson).toList(),
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }
}

final ordensProvider =
    StateNotifierProvider.family<OrdensNotifier, OrdensState, int>(
  (ref, pedidoId) => OrdensNotifier(ref.watch(midiasApiProvider), pedidoId),
);

// ── Fila local de upload ─────────────────────────────────────────────────────

class QueueState {
  final List<UploadQueueItem> items;
  final bool isLoading;

  const QueueState({this.items = const [], this.isLoading = false});
  QueueState copyWith({List<UploadQueueItem>? items, bool? isLoading}) =>
      QueueState(items: items ?? this.items, isLoading: isLoading ?? this.isLoading);
}

class QueueNotifier extends StateNotifier<QueueState> {
  QueueNotifier() : super(const QueueState()) {
    refresh();
  }

  Future<void> refresh() async {
    state = state.copyWith(isLoading: true);
    final items = await UploadQueueDb.getAll();
    state = QueueState(items: items);
  }

  Future<void> enqueue(UploadQueueItem item) async {
    await UploadQueueDb.insert(item);
    await refresh();
  }
}

final queueProvider = StateNotifierProvider<QueueNotifier, QueueState>(
  (_) => QueueNotifier(),
);
