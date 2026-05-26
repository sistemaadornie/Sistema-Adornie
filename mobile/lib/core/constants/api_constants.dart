import 'package:flutter/foundation.dart' show kIsWeb, defaultTargetPlatform, TargetPlatform;

class ApiConstants {
  ApiConstants._();

  static String get baseUrl {
    if (kIsWeb) return 'http://localhost:3001/api';
    if (defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:3001/api';
    }
    return 'http://localhost:3001/api'; // iOS / desktop
  }

  // Endpoints de autenticação
  static const String login = '/auth/login';
  static const String register = '/auth/register-empresa';
  static const String refresh = '/auth/refresh';
  static const String logout = '/auth/logout';
  static const String solicitarReset = '/auth/solicitar-reset';

  // Agendamentos
  static const String agendamentos = '/agendamentos';

  // Clientes
  static const String clientes = '/clientes';

  // Notificações
  static const String notificacoes = '/notificacoes';

  // Relatórios
  static const String relatorios = '/relatorios';
  static const String relatoriosAgendamentos = '/relatorios/agendamentos';
  static const String relatoriosEquipe = '/relatorios/equipe';

  // Veículos
  static const String veiculos = '/veiculos';

  // Perfil
  static const String fotoUpload = '/auth/user/foto-upload';

  // Mídias / Upload
  static const String midiasIniciar    = '/midias/iniciar';
  static String midiasStatus(String id)    => '/midias/$id/status';
  static String midiasConfirmar(String id) => '/midias/$id/confirmar';
  static String pedidoMidias(int id)   => '/pedidos/$id/midias';
  static String pedidoOs(int id)       => '/pedidos/$id/os';
  static String osMidias(int id)       => '/os/$id/midias';
  static const String ordens           = '/os';
  static String ordemStatus(int id)    => '/os/$id/status';
}
