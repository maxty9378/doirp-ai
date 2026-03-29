import { defineConfig } from './src/libs/next/config/define-config';

// VERCEL_ENV is usually set, but VERCEL=1 is always present on Vercel builders.
const isVercel = process.env.VERCEL === '1' || !!process.env.VERCEL_ENV;

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
          'node_modules/.pnpm/ffmpeg-static@*/**',
          'node_modules/.pnpm/**/node_modules/ffmpeg-static/**',
          '**/ffmpeg-static/**',

          // Other platform binaries (Vercel is Linux x64 glibc)
          'node_modules/.pnpm/@napi-rs+canvas-*-win32*',
          'node_modules/.pnpm/@napi-rs+canvas-*-darwin*',
          'node_modules/.pnpm/@img+sharp-*-win32*',
          'node_modules/.pnpm/@img+sharp-*-darwin*',
          'node_modules/.pnpm/@next+swc-*-musl*',
          'node_modules/.pnpm/@next+swc-*-win32*',
          'node_modules/.pnpm/@next+swc-*-darwin*',

          // Heavy libraries that should not be in runtime bundle
          'node_modules/.pnpm/onnxruntime-node@*/**',
          'node_modules/onnxruntime-node/**',
          '**/node_modules/onnxruntime-node/**',
          '**/onnxruntime-node/**',
          'node_modules/.pnpm/@huggingface+transformers@*/**',
          'node_modules/@huggingface/transformers/**',
          // promptfoo (dev/eval only in this repo) pulls huge optional deps (transformers, playwright SWC, etc.)
          'node_modules/.pnpm/promptfoo@*/**',
          'node_modules/promptfoo/**',
          'node_modules/.pnpm/better-sqlite3@*/**',
          'node_modules/.pnpm/@swc+core-darwin-arm64@*/**',
          'node_modules/.pnpm/@swc+core-darwin-x64@*/**',
          'node_modules/.pnpm/@swc+core-win32-x64-msvc@*/**',
          'node_modules/.pnpm/@rollup+rollup-darwin-arm64@*/**',
          'node_modules/.pnpm/@rollup+rollup-darwin-x64@*/**',
          'node_modules/.pnpm/@rollup+rollup-win32-x64-msvc@*/**',
          'node_modules/.pnpm/playwright*/**',
          'node_modules/.pnpm/@playwright*/**',
          'node_modules/.pnpm/electron*/**',
          'node_modules/.pnpm/puppeteer*/**',

          // Build/Test/Dev tooling
          'node_modules/typescript*/**',
          'node_modules/eslint*/**',
          'node_modules/prettier*/**',
          'node_modules/vitest*/**',
          'node_modules/.pnpm/typescript*/**',
          'node_modules/.pnpm/eslint*/**',
          'node_modules/.pnpm/prettier*/**',
          'node_modules/.pnpm/vitest*/**',
          'node_modules/.pnpm/knip*/**',

          // Build cache (not needed at runtime)
          '.next/cache/**',

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
  // ffmpeg-static only for routes that exec ffmpeg (exclude above strips it from other functions)
  // refs: https://github.com/vercel-labs/ffmpeg-on-vercel
  outputFileTracingIncludes: isVercel
    ? {
        '/api/webhooks/video/[provider]': ['./node_modules/ffmpeg-static/ffmpeg'],
        '/webapi/tts/google': ['./node_modules/ffmpeg-static/ffmpeg'],
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
    }

    return webpackConfig;
  },
});

export default nextConfig;
