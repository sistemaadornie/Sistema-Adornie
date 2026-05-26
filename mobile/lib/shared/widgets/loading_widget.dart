import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';
import '../../core/theme/app_theme.dart';

class LoadingWidget extends StatelessWidget {
  const LoadingWidget({super.key});

  @override
  Widget build(BuildContext context) => const Center(
        child: CircularProgressIndicator(
          color: AppTheme.primary,
          strokeWidth: 2,
        ),
      );
}

class ShimmerList extends StatelessWidget {
  final int count;
  const ShimmerList({super.key, this.count = 5});

  @override
  Widget build(BuildContext context) => Shimmer.fromColors(
        baseColor: AppTheme.surface,
        highlightColor: AppTheme.surfaceStrong,
        child: ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: count,
          separatorBuilder: (_, __) => const SizedBox(height: 8),
          itemBuilder: (_, __) => Container(
            height: 90,
            decoration: BoxDecoration(
              color: AppTheme.surface,
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        ),
      );
}

class LoadingOverlay extends StatelessWidget {
  final Widget child;
  final bool isLoading;
  const LoadingOverlay({
    super.key,
    required this.child,
    required this.isLoading,
  });

  @override
  Widget build(BuildContext context) => Stack(
        children: [
          child,
          if (isLoading)
            ColoredBox(
              color: AppTheme.bg.withValues(alpha: 0.7),
              child: const Center(
                child: CircularProgressIndicator(
                    color: AppTheme.primary, strokeWidth: 2),
              ),
            ),
        ],
      );
}
