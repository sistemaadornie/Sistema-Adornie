import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:timeago/timeago.dart' as timeago;
import 'app.dart';

void main() {
  timeago.setLocaleMessages('pt_BR', timeago.PtBrMessages());
  runApp(const ProviderScope(child: OperonApp()));
}
