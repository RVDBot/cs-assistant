export async function register() {
  // Only run on the server (not edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startEmailPolling } = await import('./lib/email')
    startEmailPolling()
    console.log('[instrumentation] Email polling gestart')
  }
}
