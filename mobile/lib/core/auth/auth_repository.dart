import 'package:dio/dio.dart';
import '../api/api_client.dart';
import '../constants/api_constants.dart';
import '../models/user_model.dart';
import '../storage/secure_storage.dart';

class AuthRepository {
  final ApiClient _client;
  final SecureStorage _storage;

  AuthRepository(this._client, this._storage);

  Future<UserModel> login(String email, String password) async {
    final response = await _client.dio.post(
      ApiConstants.login,
      data: {'email': email, 'senha': password},
    );
    final data = response.data as Map<String, dynamic>;
    final token = data['token'] as String;
    final refreshToken = data['refreshToken'] as String;
    final user = UserModel.fromJson(data['user'] as Map<String, dynamic>);

    await _storage.saveToken(token);
    await _storage.saveRefreshToken(refreshToken);
    await _storage.saveUser(user.toJsonString());

    return user;
  }

  Future<UserModel> registerEmpresa({
    required String nomeEmpresa,
    required String cnpj,
    required String nomeAdmin,
    required String email,
    required String senha,
    required String cpf,
  }) async {
    final response = await _client.dio.post(
      ApiConstants.register,
      data: {
        'nome_empresa': nomeEmpresa,
        'cnpj': cnpj,
        'nome_completo': nomeAdmin,
        'email': email,
        'senha': senha,
        'cpf': cpf,
      },
    );
    final data = response.data as Map<String, dynamic>;
    final token = data['token'] as String;
    final refreshToken = data['refreshToken'] as String;
    final user = UserModel.fromJson(data['user'] as Map<String, dynamic>);

    await _storage.saveToken(token);
    await _storage.saveRefreshToken(refreshToken);
    await _storage.saveUser(user.toJsonString());

    return user;
  }

  Future<void> logout() async {
    try {
      final refreshToken = await _storage.getRefreshToken();
      if (refreshToken != null) {
        await _client.dio.post(
          ApiConstants.logout,
          data: {'refreshToken': refreshToken},
        );
      }
    } on DioException catch (_) {
      // Logout silencioso se API falhar
    } finally {
      await _storage.clear();
    }
  }

  Future<UserModel?> getStoredUser() async {
    final json = await _storage.getUser();
    if (json == null) return null;
    return UserModel.fromJsonString(json);
  }

  Future<String?> getStoredToken() => _storage.getToken();

  Future<void> solicitarReset(String email) async {
    await _client.dio.post(
      ApiConstants.solicitarReset,
      data: {'email': email},
    );
  }
}
