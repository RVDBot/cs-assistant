export async function register() {
  // Only run on the server (not edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startEmailPolling } = await import('./lib/email')
    startEmailPolling()
    console.log('[instrumentation] Email polling gestart')

    // Migrate existing Twilio media URLs to local storage (one-time, idempotent)
    const { migrateExistingMedia } = await import('./lib/media')
    migrateExistingMedia()
      .then(({ migrated, failed }) => {
        if (migrated > 0 || failed > 0) {
          console.log(`[instrumentation] Media migratie: ${migrated} gemigreerd, ${failed} mislukt`)
        }
      })
      .catch(e => console.error('[instrumentation] Media migratie fout:', e))
  }
}
