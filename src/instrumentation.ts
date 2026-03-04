export async function register() {
  if (process.env.ENABLE_TELEMETRY !== '1') {
    return;
  }

  if (process.env.NODE_ENV !== 'production' && process.env.ENABLE_TELEMETRY_IN_DEV !== '1') {
    return;
  }

  const shouldEnable = process.env.NEXT_RUNTIME === 'nodejs';
  if (!shouldEnable) {
    return;
  }

  await import(/* webpackIgnore: true */ './instrumentation.node');
}
