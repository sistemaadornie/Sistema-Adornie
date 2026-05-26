import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../features/midias/providers/midias_provider.dart';

class ProcessorInitializer extends ConsumerStatefulWidget {
  final Widget child;
  const ProcessorInitializer({required this.child, super.key});

  @override
  ConsumerState<ProcessorInitializer> createState() => _ProcessorInitializerState();
}

class _ProcessorInitializerState extends ConsumerState<ProcessorInitializer> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(processorProvider).startListening();
    });
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
