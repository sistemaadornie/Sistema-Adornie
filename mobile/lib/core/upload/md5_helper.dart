import 'dart:io';
import 'package:crypto/crypto.dart';

/// Calcula hash MD5 de um arquivo em stream (sem carregar tudo em memória).
Future<String> computeMd5(File file) async {
  final stream = file.openRead();
  final digest = await md5.bind(stream).first;
  return digest.toString();
}
