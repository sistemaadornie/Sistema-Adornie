import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'core/auth/auth_provider.dart';
import 'core/upload/processor_initializer.dart';
import 'features/midias/screens/os_list_screen.dart';
import 'features/midias/screens/midia_upload_screen.dart';
import 'core/theme/app_theme.dart';
import 'features/agendamentos/screens/agendamento_detail_screen.dart';
import 'features/agendamentos/screens/agendamento_form_screen.dart';
import 'features/agendamentos/screens/agendamentos_list_screen.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/register_screen.dart';
import 'features/clientes/screens/cliente_detail_screen.dart';
import 'features/clientes/screens/cliente_form_screen.dart';
import 'features/clientes/screens/clientes_list_screen.dart';
import 'features/home/home_screen.dart';
import 'features/notificacoes/providers/notificacoes_provider.dart';
import 'features/notificacoes/screens/notificacoes_screen.dart';
import 'features/perfil/perfil_screen.dart';
import 'features/relatorios/screens/relatorios_screen.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authProvider);

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/home',
    redirect: (context, state) {
      final isAuth = authState is AuthAuthenticated;
      final isLoading = authState is AuthLoading;
      final authRoutes = ['/login', '/register'];
      final isAuthRoute = authRoutes.contains(state.matchedLocation);

      if (isLoading) return null;
      if (!isAuth && !isAuthRoute) return '/login';
      if (isAuth && isAuthRoute) return '/home';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/register', builder: (_, __) => const RegisterScreen()),
      GoRoute(
        path: '/midias/:pedidoId/os',
        builder: (_, state) => OsListScreen(
          pedidoId: int.parse(state.pathParameters['pedidoId']!),
        ),
      ),
      GoRoute(
        path: '/midias/:pedidoId/os/:osId',
        builder: (_, state) => MidiaUploadScreen(
          pedidoId: int.parse(state.pathParameters['pedidoId']!),
          pedidoItemId: int.parse(state.uri.queryParameters['itemId'] ?? '0'),
          osId: int.tryParse(state.pathParameters['osId']!),
        ),
      ),

      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => _ScaffoldWithNavBar(shell: shell),
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(path: '/home', builder: (_, __) => const HomeScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/agendamentos',
              builder: (_, __) => const AgendamentosListScreen(),
              routes: [
                GoRoute(
                  path: 'new',
                  builder: (_, __) => const AgendamentoFormScreen(),
                ),
                GoRoute(
                  path: ':id',
                  builder: (_, state) => AgendamentoDetailScreen(
                    id: int.parse(state.pathParameters['id']!),
                  ),
                  routes: [
                    GoRoute(
                      path: 'edit',
                      builder: (_, state) {
                        final id = int.parse(state.pathParameters['id']!);
                        return AgendamentoFormScreen(editId: id);
                      },
                    ),
                  ],
                ),
              ],
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/clientes',
              builder: (_, __) => const ClientesListScreen(),
              routes: [
                GoRoute(
                  path: 'new',
                  builder: (_, __) => const ClienteFormScreen(),
                ),
                GoRoute(
                  path: ':id',
                  builder: (_, state) => ClienteDetailScreen(
                    id: int.parse(state.pathParameters['id']!),
                  ),
                  routes: [
                    GoRoute(
                      path: 'edit',
                      builder: (_, state) {
                        final id = int.parse(state.pathParameters['id']!);
                        return ClienteFormScreen(editId: id);
                      },
                    ),
                  ],
                ),
              ],
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/notificacoes',
              builder: (_, __) => const NotificacoesScreen(),
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/relatorios',
              builder: (_, __) => const RelatoriosScreen(),
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/perfil',
              builder: (_, __) => const PerfilScreen(),
            ),
          ]),
        ],
      ),
    ],
  );
});

class _ScaffoldWithNavBar extends ConsumerWidget {
  final StatefulNavigationShell shell;
  const _ScaffoldWithNavBar({required this.shell});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notif = ref.watch(notificacoesProvider);
    final unread = notif.unreadCount;

    return Scaffold(
      body: shell,
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: AppTheme.border)),
        ),
        child: NavigationBar(
          selectedIndex: shell.currentIndex,
          onDestinationSelected: (i) => shell.goBranch(
            i,
            initialLocation: i == shell.currentIndex,
          ),
          destinations: [
            const NavigationDestination(
              icon: Icon(Icons.home_outlined),
              selectedIcon: Icon(Icons.home),
              label: 'Início',
            ),
            const NavigationDestination(
              icon: Icon(Icons.event_outlined),
              selectedIcon: Icon(Icons.event),
              label: 'Agenda',
            ),
            const NavigationDestination(
              icon: Icon(Icons.people_outline),
              selectedIcon: Icon(Icons.people),
              label: 'Clientes',
            ),
            NavigationDestination(
              icon: Badge(
                isLabelVisible: unread > 0,
                label: Text('$unread'),
                child: const Icon(Icons.notifications_outlined),
              ),
              selectedIcon: Badge(
                isLabelVisible: unread > 0,
                label: Text('$unread'),
                child: const Icon(Icons.notifications),
              ),
              label: 'Avisos',
            ),
            const NavigationDestination(
              icon: Icon(Icons.bar_chart_outlined),
              selectedIcon: Icon(Icons.bar_chart),
              label: 'Relatórios',
            ),
            const NavigationDestination(
              icon: Icon(Icons.person_outline),
              selectedIcon: Icon(Icons.person),
              label: 'Perfil',
            ),
          ],
        ),
      ),
    );
  }
}

class AgendaAdornieApp extends ConsumerWidget {
  const AgendaAdornieApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);

    return ProcessorInitializer(
      child: MaterialApp.router(
        title: 'Agenda Adornie',
        theme: AppTheme.dark,
        routerConfig: router,
        debugShowCheckedModeBanner: false,
      ),
    );
  }
}

// Alias para manter compatibilidade com main.dart existente
typedef OperonApp = AgendaAdornieApp;
