import 'package:dio/dio.dart';
import '../constants/api_constants.dart';
import '../storage/secure_storage.dart';

class ApiClient {
  late final Dio _dio;
  final SecureStorage _storage;
  void Function()? onUnauthorized;

  bool _isRefreshing = false;
  final List<(RequestOptions, ErrorInterceptorHandler)> _pending = [];

  ApiClient(this._storage) {
    _dio = Dio(BaseOptions(
      baseUrl: ApiConstants.baseUrl, // getter detecta plataforma em runtime
      connectTimeout: const Duration(seconds: 30),
      receiveTimeout: const Duration(seconds: 30),
      headers: {'Content-Type': 'application/json'},
    ));

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: _addAuthHeader,
      onError: _handleError,
    ));
  }

  void _addAuthHeader(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await _storage.getToken();
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  void _handleError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final is401 = err.response?.statusCode == 401;
    final isRefreshEndpoint =
        err.requestOptions.path.contains('/auth/refresh');

    if (!is401 || isRefreshEndpoint) {
      handler.next(err);
      return;
    }

    if (_isRefreshing) {
      _pending.add((err.requestOptions, handler));
      return;
    }

    _isRefreshing = true;
    try {
      final refreshToken = await _storage.getRefreshToken();
      if (refreshToken == null) throw Exception('No refresh token');

      final response = await _dio.post(
        ApiConstants.refresh,
        data: {'refreshToken': refreshToken},
        options: Options(headers: {'Authorization': null}),
      );

      final newToken = response.data['token'] as String;
      final newRefresh = response.data['refreshToken'] as String;
      await _storage.saveToken(newToken);
      await _storage.saveRefreshToken(newRefresh);

      for (final (req, h) in _pending) {
        req.headers['Authorization'] = 'Bearer $newToken';
        final retryResponse = await _dio.fetch(req);
        h.resolve(retryResponse);
      }
      _pending.clear();

      err.requestOptions.headers['Authorization'] = 'Bearer $newToken';
      handler.resolve(await _dio.fetch(err.requestOptions));
    } catch (_) {
      await _storage.clear();
      for (final (_, h) in _pending) {
        h.next(err);
      }
      _pending.clear();
      onUnauthorized?.call();
      handler.next(err);
    } finally {
      _isRefreshing = false;
    }
  }

  Dio get dio => _dio;
}
