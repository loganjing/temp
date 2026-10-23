import { useEffect, useRef, useState } from 'react'

export interface AlertNewData {
  id: string
  eventId: string
  alertTime: string
  status: 'pending'
  eventType: string
  location: string
  routeName: string
}

export function useWebSocket(onAlertNew: (data: AlertNewData) => void) {
  const callbackRef = useRef(onAlertNew)
  callbackRef.current = onAlertNew
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/alerts`
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout>

    function connect() {
      ws = new WebSocket(wsUrl)
      ws.onopen = () => {
        setConnected(true)
        ws?.send(JSON.stringify({ type: 'alert:subscribe' }))
      }
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'alert:new') callbackRef.current(msg.data)
        } catch { /* ignore malformed */ }
      }
      ws.onclose = () => {
        setConnected(false)
        reconnectTimer = setTimeout(() => connect(), 3000)
      }
      ws.onerror = () => ws?.close()
    }

    connect()
    return () => {
      clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [])

  return { connected }
}
