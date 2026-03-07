import webpack from 'webpack';
import { defineConfig } from './src/libs/next/config/define-config';

const isVercel = !!process.env.VERCEL_ENV;

const nextConfig = defineConfig({
  // Vercel serverless: keep unzipped function size under 250 MB
  // https://vercel.com/guides/troubleshooting-function-250mb-limit
  outputFileTracingExcludes: isVercel
    ? {
        '*': [
          // Musl binaries (Vercel uses glibc). Saves ~120MB.
          'node_modules/.pnpm/@napi-rs+canvas-*-musl*',
          'node_modules/.pnpm/@img+sharp-libvips-*musl*',
          'node_modules/ffmpeg-static/**',
          'node_modules/.pnpm/ffmpeg-static*/**',
          // Build cache (not needed at runtime)
          '.next/cache/**',
          // Dev/test tooling (not needed in serverless)
          'node_modules/playwright/**',
          'node_modules/@playwright/**',
          'node_modules/electron/**',
          'node_modules/.pnpm/playwright@*/**',
          'node_modules/.pnpm/electron@*/**',
          // Test files in dependencies
          'node_modules/**/__tests__/**',
          'node_modules/**/*.test.js',
          'node_modules/**/*.test.ts',
          'node_modules/**/*.test.mjs',
          'node_modules/**/*.spec.js',
          'node_modules/**/*.spec.ts',
        ],
      }
    : undefined,
  // Include ffmpeg binary only for video webhook processing
  // refs: https://github.com/vercel-labs/ffmpeg-on-vercel
  outputFileTracingIncludes: isVercel
    ? {
        '/api/webhooks/video/*': ['./node_modules/ffmpeg-static/ffmpeg'],
      }
    : undefined,
  webpack: (webpackConfig, context) => {
    const { dev } = context;
    if (!dev) {
      webpackConfig.cache = false;
    } else {
      // Убираем из консоли предупреждения PackFileCacheStrategy про большие строки (не ошибки)
      webpackConfig.infrastructureLogging = {
        level: 'error',
      };
      // Прогресс компиляции: проценты и текущий этап в одной строке
      webpackConfig.plugins = webpackConfig.plugins || [];
      webpackConfig.plugins.push(
        new webpack.ProgressPlugin((percentage, message, ...args) => {
          const pct = Math.round(percentage * 100);
          if (process.stdout.isTTY) {
            if (percentage < 1) {
              const msg = [message, ...args].filter(Boolean).join(' ') || 'compiling...';
              process.stdout.write(`\r○ Compiling ${pct}% ${msg.slice(0, 50)}    `);
            } else {
              process.stdout.write(`\r✓ Compiled\n`);
            }
          }
        }),
      );
    }

    return webpackConfig;
  },
});

export default nextConfig;
