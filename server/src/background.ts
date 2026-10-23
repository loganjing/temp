import type { AppContext } from './context';

/**
 * Background services:
 * 1. Traffic deadlock detection — every 5 seconds (safety loop)
 * 2. Device heartbeat monitoring — every 30 seconds
 */
export class BackgroundServices {
  private deadlockTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private ctx: AppContext) {}

  start(): void {
    if (this.running) return;
    this.running = true;

    // Deadlock detection every 5 seconds
    this.deadlockTimer = setInterval(() => {
      try {
        this.ctx.traffic.detectAndResolveDeadlock();
      } catch (err) {
        console.error('[bg] Deadlock detection error:', err);
      }
    }, 5000);

    // Device heartbeat monitoring every 30 seconds
    this.heartbeatTimer = setInterval(() => {
      try {
        this.checkDeviceHeartbeats();
      } catch (err) {
        console.error('[bg] Heartbeat check error:', err);
      }
    }, 30000);

    console.log('[bg] Background services started (deadlock: 5s, heartbeat: 30s)');
  }

  stop(): void {
    this.running = false;
    if (this.deadlockTimer) {
      clearInterval(this.deadlockTimer);
      this.deadlockTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    console.log('[bg] Background services stopped');
  }

  /**
   * Checks for devices that haven't reported position within the timeout window.
   * Triggers anomaly alerts for stale devices.
   */
  private checkDeviceHeartbeats(): void {
    const now = Date.now();
    const TIMEOUT_MS = 60_000; // 60 seconds without position update = anomaly

    const devices = this.ctx.db.prepare(`
      SELECT id, name, status, current_location_code, last_position_at
      FROM transport_resources
      WHERE status = 'busy'
    `).all() as Array<{
      id: number;
      name: string;
      status: string;
      current_location_code: string | null;
      last_position_at: string | null;
    }>;

    for (const device of devices) {
      if (!device.last_position_at) continue;
      const lastReport = new Date(device.last_position_at).getTime();
      if (now - lastReport > TIMEOUT_MS) {
        // Find the active task for this device
        const task = this.ctx.db.prepare(`
          SELECT id FROM transport_tasks
          WHERE assigned_resource_id = ? AND status = 'in_transit'
          LIMIT 1
        `).get(device.id) as { id: number } | undefined;

        if (task) {
          this.ctx.events.recordEvent({
            taskId: task.id,
            resourceId: device.id,
            eventType: 'anomaly',
            description: `Device ${device.name} has not reported position for over 60 seconds`,
            metadata: { anomalyType: 'device_timeout', lastPositionAt: device.last_position_at },
          });

          this.ctx.events.pushAnomalyAlert({
            taskId: String(task.id),
            resourceId: String(device.id),
            anomalyType: 'device_timeout',
            description: `Device ${device.name} position report timeout`,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }
  }
}
