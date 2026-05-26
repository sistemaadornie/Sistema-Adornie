import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTheme {
  AppTheme._();

  // ── Palette ────────────────────────────────────────────────
  static const Color bg = Color(0xFF0E0D0B);
  static const Color surface = Color(0xFF161512);
  static const Color surfaceStrong = Color(0xFF1F1D19);
  static const Color primary = Color(0xFFC9A96E);
  static const Color primaryHover = Color(0xFFD4B87A);
  static const Color textPrimary = Color(0xFFF2EDE4);
  static const Color textSecondary = Color(0xFF9A9080);
  static const Color textMuted = Color(0xFF5A544A);
  static const Color border = Color(0xFF2C2A25);
  static const Color borderStrong = Color(0xFF3A3830);
  static const Color error = Color(0xFFC0614A);
  static const Color secondary = Color(0xFF6B9AB8);

  // Status
  static const Color statusAgendado = Color(0xFF6B9AB8);
  static const Color statusAndamento = Color(0xFFD4A843);
  static const Color statusConcluido = Color(0xFF7FB069);
  static const Color statusNaoConcluido = Color(0xFFC0614A);
  static const Color statusCancelado = Color(0xFF5A544A);

  static TextTheme get _textTheme {
    final base = ThemeData.dark().textTheme;
    return GoogleFonts.jostTextTheme(base).copyWith(
      displayLarge: GoogleFonts.cormorantGaramond(
        color: textPrimary, fontSize: 40, fontWeight: FontWeight.w600),
      displayMedium: GoogleFonts.cormorantGaramond(
        color: textPrimary, fontSize: 32, fontWeight: FontWeight.w600),
      displaySmall: GoogleFonts.cormorantGaramond(
        color: textPrimary, fontSize: 26, fontWeight: FontWeight.w600),
      headlineLarge: GoogleFonts.cormorantGaramond(
        color: textPrimary, fontSize: 24, fontWeight: FontWeight.w600),
      headlineMedium: GoogleFonts.cormorantGaramond(
        color: textPrimary, fontSize: 20, fontWeight: FontWeight.w600),
      headlineSmall: GoogleFonts.cormorantGaramond(
        color: textPrimary, fontSize: 18, fontWeight: FontWeight.w600),
    );
  }

  static ThemeData get dark => ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        colorScheme: const ColorScheme.dark(
          primary: primary,
          onPrimary: Color(0xFF0E0D0B),
          secondary: secondary,
          surface: surface,
          onSurface: textPrimary,
          error: error,
          onError: textPrimary,
          outline: border,
        ),
        scaffoldBackgroundColor: bg,
        textTheme: _textTheme,
        appBarTheme: AppBarTheme(
          backgroundColor: surface,
          foregroundColor: textPrimary,
          elevation: 0,
          centerTitle: false,
          surfaceTintColor: Colors.transparent,
          shadowColor: Colors.transparent,
          titleTextStyle: GoogleFonts.cormorantGaramond(
            color: textPrimary,
            fontSize: 20,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.5,
          ),
          iconTheme: const IconThemeData(color: textSecondary),
          actionsIconTheme: const IconThemeData(color: textSecondary),
        ),
        navigationBarTheme: NavigationBarThemeData(
          backgroundColor: surface,
          indicatorColor: primary.withValues(alpha: 0.15),
          surfaceTintColor: Colors.transparent,
          elevation: 0,
          labelTextStyle: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.selected)) {
              return GoogleFonts.jost(
                  color: primary, fontSize: 10, fontWeight: FontWeight.w600);
            }
            return GoogleFonts.jost(fontSize: 10, color: textMuted);
          }),
          iconTheme: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.selected)) {
              return const IconThemeData(color: primary, size: 22);
            }
            return const IconThemeData(color: textMuted, size: 22);
          }),
        ),
        cardTheme: CardThemeData(
          elevation: 0,
          color: surface,
          surfaceTintColor: Colors.transparent,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
            side: const BorderSide(color: border),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: surfaceStrong,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(6),
            borderSide: const BorderSide(color: border),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(6),
            borderSide: const BorderSide(color: border),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(6),
            borderSide:
                BorderSide(color: primary.withValues(alpha: 0.5), width: 1.5),
          ),
          errorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(6),
            borderSide: const BorderSide(color: error),
          ),
          focusedErrorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(6),
            borderSide: const BorderSide(color: error, width: 1.5),
          ),
          labelStyle: const TextStyle(
              color: textMuted, fontSize: 11, letterSpacing: 0.8),
          hintStyle: const TextStyle(color: textMuted),
          prefixIconColor: textMuted,
          suffixIconColor: textMuted,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: primary,
            foregroundColor: const Color(0xFF0E0D0B),
            minimumSize: const Size(double.infinity, 48),
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
            textStyle: GoogleFonts.jost(
                fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 1.5),
          ),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: primary,
            foregroundColor: const Color(0xFF0E0D0B),
            minimumSize: const Size(double.infinity, 48),
            elevation: 0,
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
            textStyle: GoogleFonts.jost(
                fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 1.5),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            foregroundColor: textSecondary,
            side: const BorderSide(color: border),
            minimumSize: const Size(double.infinity, 48),
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
            textStyle: GoogleFonts.jost(
                fontSize: 12, fontWeight: FontWeight.w600, letterSpacing: 0.5),
          ),
        ),
        textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(
            foregroundColor: primary,
            textStyle: GoogleFonts.jost(fontSize: 13, fontWeight: FontWeight.w500),
          ),
        ),
        dividerTheme: const DividerThemeData(color: border, thickness: 1),
        chipTheme: ChipThemeData(
          backgroundColor: surfaceStrong,
          selectedColor: primary.withValues(alpha: 0.18),
          disabledColor: surfaceStrong,
          labelStyle: GoogleFonts.jost(color: textSecondary, fontSize: 12),
          side: const BorderSide(color: border),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          checkmarkColor: primary,
          padding:
              const EdgeInsets.symmetric(horizontal: 4),
        ),
        dialogTheme: DialogThemeData(
          backgroundColor: surfaceStrong,
          surfaceTintColor: Colors.transparent,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: const BorderSide(color: border),
          ),
        ),
        snackBarTheme: SnackBarThemeData(
          backgroundColor: surfaceStrong,
          contentTextStyle:
              GoogleFonts.jost(color: textPrimary, fontSize: 13),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          behavior: SnackBarBehavior.floating,
        ),
        listTileTheme: const ListTileThemeData(
          textColor: textPrimary,
          iconColor: textMuted,
          tileColor: Colors.transparent,
        ),
        iconTheme: const IconThemeData(color: textSecondary),
        popupMenuTheme: PopupMenuThemeData(
          color: surfaceStrong,
          surfaceTintColor: Colors.transparent,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
            side: const BorderSide(color: border),
          ),
        ),
      );
}

Color statusColor(String status) => switch (status) {
      'agendado' => AppTheme.statusAgendado,
      'andamento' => AppTheme.statusAndamento,
      'em_andamento' => AppTheme.statusAndamento,
      'concluido' => AppTheme.statusConcluido,
      'nao_concluido' => AppTheme.statusNaoConcluido,
      'cancelado' => AppTheme.statusCancelado,
      _ => AppTheme.statusCancelado,
    };

String statusLabel(String status) => switch (status) {
      'agendado' => 'Agendado',
      'andamento' => 'Em Andamento',
      'em_andamento' => 'Em Andamento',
      'concluido' => 'Concluído',
      'nao_concluido' => 'Não Concluído',
      'cancelado' => 'Cancelado',
      _ => status,
    };
