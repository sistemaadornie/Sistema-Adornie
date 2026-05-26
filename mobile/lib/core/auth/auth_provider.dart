import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/api_client.dart';
import '../models/user_model.dart';
import '../storage/secure_storage.dart';
import 'auth_repository.dart';

// ── Providers de infraestrutura ────────────────────────────────────────────

final secureStorageProvider = Provider<SecureStorage>((_) => SecureStorage());

final apiClientProvider = Provider<ApiClient>((ref) {
  final storage = ref.read(secureStorageProvider);
  final client = ApiClient(storage);
  client.onUnauthorized = () {
    ref.read(authProvider.notifier).forceLogout();
  };
  return client;
});

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(
    ref.read(apiClientProvider),
    ref.read(secureStorageProvider),
  );
});

// ── Estado de autenticação ─────────────────────────────────────────────────

sealed class AuthState {
  const AuthState();
}

class AuthLoading extends AuthState {
  const AuthLoading();
}

class AuthAuthenticated extends AuthState {
  final UserModel user;
  const AuthAuthenticated(this.user);
}

class AuthUnauthenticated extends AuthState {
  const AuthUnauthenticated();
}

// ── Notifier ───────────────────────────────────────────────────────────────

class AuthNotifier extends StateNotifier<AuthState> {
  final AuthRepository _repository;

  AuthNotifier(this._repository) : super(const AuthLoading()) {
    _init();
  }

  Future<void> _init() async {
    final user = await _repository.getStoredUser();
    final token = await _repository.getStoredToken();
    if (user != null && token != null) {
      state = AuthAuthenticated(user);
    } else {
      state = const AuthUnauthenticated();
    }
  }

  Future<void> login(String email, String password) async {
    state = const AuthLoading();
    final user = await _repository.login(email, password);
    state = AuthAuthenticated(user);
  }

  Future<void> registerEmpresa({
    required String nomeEmpresa,
    required String cnpj,
    required String nomeAdmin,
    required String email,
    required String senha,
    required String cpf,
  }) async {
    state = const AuthLoading();
    final user = await _repository.registerEmpresa(
      nomeEmpresa: nomeEmpresa,
      cnpj: cnpj,
      nomeAdmin: nomeAdmin,
      email: email,
      senha: senha,
      cpf: cpf,
    );
    state = AuthAuthenticated(user);
  }

  Future<void> logout() async {
    await _repository.logout();
    state = const AuthUnauthenticated();
  }

  void forceLogout() {
    state = const AuthUnauthenticated();
  }

  void updateUser(UserModel user) {
    if (state is AuthAuthenticated) {
      state = AuthAuthenticated(user);
    }
  }
}

final StateNotifierProvider<AuthNotifier, AuthState> authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ref.read(authRepositoryProvider));
});
