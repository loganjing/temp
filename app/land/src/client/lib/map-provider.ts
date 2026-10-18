/**
 * Leaflet CDN 加载器（leaflet 不在 package.json 依赖内且包配置超出写入范围，
 * 故经 CDN 脚本动态注入；加载失败由调用方降级为占位与重试，符合架构基线的地图降级约定）。
 */

export type LeafletPoint = { lat: number; lng: number }
export type LeafletPath = { addTo(map: LeafletMap): LeafletPath; remove(): LeafletPath; bindPopup(content: string): LeafletPath }
export type LeafletMap = {
  setView(center: LeafletPoint, zoom: number): LeafletMap
  remove(): void
  getCenter(): LeafletPoint
  getZoom(): number
}

/** 只声明前端用到的最小 Leaflet 表面，避免引入 leaflet 类型包。 */
export type LeafletGlobal = {
  map(element: HTMLElement): LeafletMap
  tileLayer(url: string, options: { attribution: string; maxZoom: number }): LeafletPath
  marker(latlng: LeafletPoint, options?: { title?: string }): LeafletPath
  geoJSON(geojson: unknown): LeafletPath | null
}

const LEAFLET_BASE = 'https://unpkg.com/leaflet@1.9.4/dist'
let leafletPromise: Promise<LeafletGlobal | null> | null = null

function injectStyle(href: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLLinkElement>(`link[href="${href}"]`)
    if (existing) return resolve()
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.onload = () => resolve()
    link.onerror = () => reject(new Error(`stylesheet ${href} failed`))
    document.head.appendChild(link)
  })
}

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`)
    if (existing) {
      if ((window as { L?: LeafletGlobal }).L) return resolve()
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error(`script ${src} failed`)))
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`script ${src} failed`))
    document.head.appendChild(script)
  })
}

/** 已注入时直接返回 window.L；否则注入 CSS+JS，失败返回 null（调用方降级）。 */
export function loadLeaflet(): Promise<LeafletGlobal | null> {
  if (typeof document === 'undefined') return Promise.resolve(null)
  const existing = (window as { L?: LeafletGlobal }).L
  if (existing) return Promise.resolve(existing)
  if (!leafletPromise) {
    leafletPromise = (async () => {
      try {
        await injectStyle(`${LEAFLET_BASE}/leaflet.css`)
        await injectScript(`${LEAFLET_BASE}/leaflet.js`)
        return (window as { L?: LeafletGlobal }).L ?? null
      } catch {
        return null
      }
    })()
  }
  return leafletPromise
}

/** 重置加载缓存（CDN 加载失败后的“重试”需要重新注入脚本）。 */
export function resetLeafletCache() {
  leafletPromise = null
}

/** 边界 GeoJSON 文本安全解析：空串/数组/解析失败返回 null。 */
export function parseGeoJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    return null
  } catch {
    return null
  }
}
