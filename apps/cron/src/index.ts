export interface Env {
  DASHBOARD_SECRET: string
  SITE_URL: string
}

export default {
  async scheduled(_: ScheduledController, env: Env) {
    try {
      const res = await fetch(`${env.SITE_URL}/api/sync-event`, {
        headers: { 'x-secret': env.DASHBOARD_SECRET },
      })
      console.log(`sync-event: ${res.status}`, await res.text())
    } catch (e) {
      console.error('sync-event fetch failed:', e)
    }
  },
} satisfies ExportedHandler<Env>
