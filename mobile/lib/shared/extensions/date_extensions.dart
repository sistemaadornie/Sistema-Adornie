import 'package:intl/intl.dart';

extension DateStringExtension on String {
  String toDateBR() {
    try {
      final dt = DateTime.parse(this);
      return DateFormat('dd/MM/yyyy').format(dt);
    } catch (_) {
      return this;
    }
  }

  String toDateTimeBR() {
    try {
      final dt = DateTime.parse(this);
      return DateFormat('dd/MM/yyyy HH:mm').format(dt);
    } catch (_) {
      return this;
    }
  }

  String toTimeBR() {
    // Expects 'HH:mm' or 'HH:mm:ss'
    return length >= 5 ? substring(0, 5) : this;
  }
}

extension DateExtension on DateTime {
  String toDateBR() => DateFormat('dd/MM/yyyy').format(this);
  String toDateTimeBR() => DateFormat('dd/MM/yyyy HH:mm').format(this);
  String toApiDate() => DateFormat('yyyy-MM-dd').format(this);
}
