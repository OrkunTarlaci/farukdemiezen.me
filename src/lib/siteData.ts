import { fetchServices, fetchSettings, fetchWorkingHours } from './api'
import { isBackendConfigured } from './supabase'
import type { BusinessSettings, Service, WorkingHours } from './types'

export interface SiteData {
  services: Service[]
  settings: BusinessSettings
  workingHours: WorkingHours[]
  /** true ise veriler yalnızca geliştirme önizlemesidir; randevu kaydedilmez. */
  preview: boolean
}

export const isDevPreview = import.meta.env.DEV && !isBackendConfigured

export async function loadSiteData(): Promise<SiteData> {
  if (isDevPreview) {
    const m = await import('../dev/previewData')
    return {
      services: m.previewServices, settings: m.previewSettings, workingHours: m.previewWorkingHours, preview: true,
    }
  }
  const [services, settings, workingHours] = await Promise.all([fetchServices(), fetchSettings(), fetchWorkingHours()])
  return { services, settings, workingHours, preview: false }
}
