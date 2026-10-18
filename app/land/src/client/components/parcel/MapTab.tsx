import { useEffect, useRef, useState } from 'react'
import { apiRequest, errorText } from '../../platform/api-client'
import { useCan } from '../../platform/permissions'
import { Card, ErrorBox, Loading, useResource } from '../ui'
import { MARKER_KIND_LABELS, displayDateTime } from '../../lib/format'
import { loadLeaflet, parseGeoJson, resetLeafletCache, type LeafletGlobal, type LeafletMap, type LeafletPath, type LeafletPoint } from '../../lib/map-provider'
import type { MapData, MapLink, MapMarker, MapViewDetail, MapViewListItem, Parcel } from '../../types'

const KINDS = Object.keys(MARKER_KIND_LABELS)

/** M03 地图：位置/边界/标记/外部链接保存 + 报告视图快照（不可变，AC-02）。 */
export default function MapTab({ parcel }: { parcel: Parcel }) {
  const can = useCan()
  const editable = can('parcels:write')
  const mapData = useResource<MapData>(() => apiRequest(`/api/parcels/${encodeURIComponent(parcel.id)}/map`))
  const views = useResource<{ items: MapViewListItem[] }>(() => apiRequest(`/api/parcels/${encodeURIComponent(parcel.id)}/map/views`))
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [boundaryText, setBoundaryText] = useState('')
  const [markers, setMarkers] = useState<MapMarker[]>([])
  const [links, setLinks] = useState<MapLink[]>([])
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [viewName, setViewName] = useState('')
  const [viewDetail, setViewDetail] = useState<MapViewDetail | null>(null)
  const [viewError, setViewError] = useState('')
  const [retryTick, setRetryTick] = useState(0)
  const mapInstanceRef = useRef<LeafletMap | null>(null)

  useEffect(() => {
    const data = mapData.data
    if (!data) return
    setLat(data.location?.lat ?? '')
    setLng(data.location?.lng ?? '')
    setBoundaryText(data.boundaryGeojson ? JSON.stringify(data.boundaryGeojson, null, 2) : '')
    setMarkers(data.markers)
    setLinks(data.externalMapLinks)
  }, [mapData.data])

  const saveMap = async () => {
    setBusy(true)
    setError('')
    setNotice('')
    const boundary = boundaryText.trim() === '' ? null : parseGeoJson(boundaryText)
    if (boundaryText.trim() !== '' && boundary === null) {
      setError('边界必须为合法 GeoJSON 对象（或留空）。')
      setBusy(false)
      return
    }
    const location = lat.trim() !== '' && lng.trim() !== '' ? { lat: lat.trim(), lng: lng.trim() } : null
    try {
      await apiRequest(`/api/parcels/${encodeURIComponent(parcel.id)}/map`, {
        method: 'PUT',
        body: JSON.stringify({ location, boundaryGeojson: boundary, markers, externalMapLinks: links }),
      })
      setNotice('地图数据已保存。')
      mapData.reload()
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const saveView = async () => {
    if (!viewName.trim()) {
      setError('请填写视图名称。')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    const center = mapInstanceRef.current?.getCenter()
    try {
      await apiRequest(`/api/parcels/${encodeURIComponent(parcel.id)}/map/views`, {
        method: 'POST',
        body: JSON.stringify({
          name: viewName.trim(),
          view: {
            center: center ? { lat: center.lat, lng: center.lng } : null,
            zoom: mapInstanceRef.current?.getZoom() ?? 13,
            layers: ['osm'],
            markerIds: markers.map((marker) => marker.id),
            boundaryIncluded: Boolean(parseGeoJson(boundaryText)),
          },
        }),
      })
      setNotice('报告地图视图已保存（快照不可变，不随后续地图操作变化）。')
      setViewName('')
      views.reload()
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const openView = async (viewId: string) => {
    setViewError('')
    try {
      setViewDetail(await apiRequest<MapViewDetail>(`/api/parcels/${encodeURIComponent(parcel.id)}/map/views/${encodeURIComponent(viewId)}`))
    } catch (cause) {
      setViewError(errorText(cause))
    }
  }

  const locationPoint: LeafletPoint | null = lat.trim() !== '' && lng.trim() !== '' ? { lat: Number(lat), lng: Number(lng) } : null
  const boundary = parseGeoJson(boundaryText)

  if (mapData.busy && !mapData.data) return <Loading />
  if (mapData.error) return <Card title="地图数据加载失败"><ErrorBox cause={mapData.error} /></Card>

  return (
    <div className="stack">
      {notice && <p role="status" className="success">{notice}</p>}
      {error && <p role="alert" className="error">{error}</p>}

      <Card title="地块地图" actions={editable ? <button disabled={busy} onClick={() => void saveMap()}>{busy ? '保存中…' : '保存地图数据'}</button> : undefined}>
        <MapCanvas location={locationPoint} boundary={boundary} mapInstanceRef={mapInstanceRef} retryTick={retryTick} />
        <button className="ghost" onClick={() => { resetLeafletCache(); setRetryTick((value) => value + 1) }}>重试加载地图组件</button>
        {editable && (
          <div className="form-grid" style={{ marginTop: '0.8rem' }}>
            <label>纬度 lat<input value={lat} onChange={(event) => setLat(event.currentTarget.value)} inputMode="decimal" placeholder="3.1390" /></label>
            <label>经度 lng<input value={lng} onChange={(event) => setLng(event.currentTarget.value)} inputMode="decimal" placeholder="101.6869" /></label>
            <label className="span-2">边界 GeoJSON<textarea value={boundaryText} onChange={(event) => setBoundaryText(event.currentTarget.value)} placeholder='粘贴 GeoJSON 对象（Polygon 等），留空表示仅有位置点' /></label>
          </div>
        )}
        <p className="hint">瓦片来自开放街道地图（OSM）；加载失败可重试。地图信息是辅助判断，不替代产权/规划/政府审批核实。</p>
      </Card>

      {editable && (
        <Card title={`标记（${markers.length}）`}>
          <div className="table-scroll">
            <table>
              <thead><tr><th>类型</th><th>名称 *</th><th>关联市场记录 ID</th><th>颜色</th><th>说明</th><th>操作</th></tr></thead>
              <tbody>
                {markers.map((marker, index) => (
                  <tr key={index}>
                    <td>
                      <select value={marker.kind} onChange={(event) => setMarkers((prev) => prev.map((item, i) => i === index ? { ...item, kind: event.currentTarget.value as MapMarker['kind'] } : item))}>
                        {KINDS.map((kind) => <option key={kind} value={kind}>{MARKER_KIND_LABELS[kind]}</option>)}
                      </select>
                    </td>
                    <td><input value={marker.label} onChange={(event) => setMarkers((prev) => prev.map((item, i) => i === index ? { ...item, label: event.currentTarget.value } : item))} /></td>
                    <td><input value={marker.refId ?? ''} placeholder="本地块土地参考/竞品 ID" onChange={(event) => setMarkers((prev) => prev.map((item, i) => i === index ? { ...item, refId: event.currentTarget.value || null } : item))} /></td>
                    <td><input value={marker.color ?? ''} placeholder="如 #1458a6" onChange={(event) => setMarkers((prev) => prev.map((item, i) => i === index ? { ...item, color: event.currentTarget.value || null } : item))} /></td>
                    <td><input value={marker.note ?? ''} onChange={(event) => setMarkers((prev) => prev.map((item, i) => i === index ? { ...item, note: event.currentTarget.value || null } : item))} /></td>
                    <td><button className="secondary" onClick={() => setMarkers((prev) => prev.filter((_, i) => i !== index))}>删除</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row-actions" style={{ marginTop: '0.6rem' }}>
            <button className="secondary" onClick={() => setMarkers((prev) => [...prev, { id: '', kind: 'poi', refId: null, label: '', color: null, note: null }])}>添加标记</button>
          </div>
          <p className="hint">refId 必须引用本地块下已有的土地交易参考或竞品记录（服务端校验）。</p>
        </Card>
      )}

      <Card title={`外部地图链接（${links.length}）`}>
        {links.map((link, index) => (
          <div key={index} className="row-actions" style={{ alignItems: 'end', marginBottom: '0.5rem' }}>
            <label className="field">来源
              <select value={link.provider} disabled={!editable} onChange={(event) => setLinks((prev) => prev.map((item, i) => i === index ? { ...item, provider: event.currentTarget.value as MapLink['provider'] } : item))}>
                <option value="google-maps">Google Maps</option>
                <option value="other">其他</option>
              </select>
            </label>
            <label className="grow">URL
              <input value={link.url} disabled={!editable} onChange={(event) => setLinks((prev) => prev.map((item, i) => i === index ? { ...item, url: event.currentTarget.value } : item))} />
            </label>
            <a className="tab-link" href={link.url} target="_blank" rel="noreferrer">打开</a>
            {editable && <button className="secondary" onClick={() => setLinks((prev) => prev.filter((_, i) => i !== index))}>删除</button>}
          </div>
        ))}
        {editable && (
          <button className="secondary" onClick={() => setLinks((prev) => [...prev, { provider: 'google-maps', url: '' }])}>添加链接</button>
        )}
      </Card>

      <Card title={`报告地图视图（${views.data?.items.length ?? 0}）`}>
        {editable && (
          <div className="toolbar">
            <label className="field">视图名称<input value={viewName} onChange={(event) => setViewName(event.currentTarget.value)} placeholder="如 投资报告-全览" /></label>
            <button disabled={busy} onClick={() => void saveView()}>保存当前视图</button>
          </div>
        )}
        {views.busy && !views.data && <Loading />}
        <ErrorBox cause={views.error} />
        {views.data && views.data.items.length === 0 && <p className="hint">暂无保存的视图。保存后用于报告，历史版本稳定不变。</p>}
        {views.data && views.data.items.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead><tr><th>视图</th><th>保存时间</th><th>操作</th></tr></thead>
              <tbody>
                {views.data.items.map((view) => (
                  <tr key={view.id}>
                    <td><strong>{view.name}</strong></td>
                    <td className="nowrap">{displayDateTime(view.createdAt)}</td>
                    <td><button className="secondary" onClick={() => void openView(view.id)}>查看快照</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {viewError && <p role="alert" className="error">{viewError}</p>}
        {viewDetail && (
          <div>
            <h4>{viewDetail.name} · {displayDateTime(viewDetail.createdAt)}</h4>
            <pre className="mono" style={{ overflow: 'auto', maxHeight: 260, background: 'var(--surface-2)', padding: '0.6rem', borderRadius: 8 }}>
              {JSON.stringify(viewDetail.view, null, 2)}
            </pre>
          </div>
        )}
      </Card>
    </div>
  )
}

/** Leaflet 画布：CDN 注入失败降级为占位；父级通过 mapInstanceRef 读取当前中心/缩放用于保存视图。 */
function MapCanvas({ location, boundary, mapInstanceRef, retryTick }: {
  location: LeafletPoint | null
  boundary: Record<string, unknown> | null
  mapInstanceRef: { current: LeafletMap | null }
  retryTick: number
}) {
  const holderRef = useRef<HTMLDivElement>(null)
  const leafRef = useRef<LeafletGlobal | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const pathsRef = useRef<LeafletPath[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const redrawRef = useRef<() => void>(() => {})

  redrawRef.current = () => {
    const L = leafRef.current
    const map = mapRef.current
    if (!L || !map) return
    for (const path of pathsRef.current) path.remove()
    pathsRef.current = []
    if (location) {
      const marker = L.marker(location, { title: '本地块' })
      marker.bindPopup('本地块位置').addTo(map)
      map.setView(location, Math.max(map.getZoom(), 15))
      pathsRef.current.push(marker)
    }
    if (boundary) {
      const layer = L.geoJSON(boundary)
      if (layer) {
        layer.addTo(map)
        pathsRef.current.push(layer)
      }
    }
  }

  useEffect(() => {
    let cancelled = false
    void loadLeaflet().then((L) => {
      if (cancelled) return
      if (!L || !holderRef.current) {
        setStatus('failed')
        return
      }
      setStatus('ready')
      leafRef.current = L
      const instance = L.map(holderRef.current)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 19 }).addTo(instance)
      instance.setView({ lat: 3.139, lng: 101.6869 }, 13)
      mapRef.current = instance
      mapInstanceRef.current = instance
      redrawRef.current()
    })
    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      mapInstanceRef.current = null
      pathsRef.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryTick])

  useEffect(() => {
    redrawRef.current()
  }, [location, boundary])

  return (
    <div className="map-frame">
      <div ref={holderRef} />
      {status === 'loading' && <div className="map-fallback">地图组件加载中…</div>}
      {status === 'failed' && <div className="map-fallback">地图组件（CDN）加载失败；可点击下方“重试加载地图组件”，或继续使用位置/边界数据录入。</div>}
    </div>
  )
}
