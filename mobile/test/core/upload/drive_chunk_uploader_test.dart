import 'package:flutter_test/flutter_test.dart';
import 'package:operon_mobile/core/upload/drive_chunk_uploader.dart';

void main() {
  group('contentRangeHeader', () {
    test('formato correto para chunk intermediário', () {
      final header = contentRangeHeader(start: 0, end: 5242879, total: 10000000);
      expect(header, 'bytes 0-5242879/10000000');
    });

    test('formato correto para último chunk', () {
      final header = contentRangeHeader(start: 5242880, end: 9999999, total: 10000000);
      expect(header, 'bytes 5242880-9999999/10000000');
    });
  });

  group('backoffDelay', () {
    test('aumenta exponencialmente', () {
      expect(backoffDelay(0).inSeconds, 1);
      expect(backoffDelay(1).inSeconds, 2);
      expect(backoffDelay(2).inSeconds, 4);
      expect(backoffDelay(3).inSeconds, 8);
    });

    test('limita em 60 segundos', () {
      expect(backoffDelay(10).inSeconds, 60);
    });
  });
}
