import type { Hono } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import * as services from './services'

type Platform = Awaited<ReturnType<typeof initializePlatform>>

// 业务路由在认证边界前注册（本工作项未选择 authkit，业务 API 作为公开路由提供）。
export function registerPublicRoutes(app: Hono, platform: Platform) {
  // M1: 设备状态监测
  app.get('/api/devices', async (c) => c.json(await services.listDevices(platform.db)))
  app.get('/api/devices/:id', async (c) => c.json(await services.getDevice(platform.db, c.req.param('id'))))
  app.patch('/api/devices/:id/status', async (c) => {
    const body = await c.req.json()
    return c.json(await services.updateDeviceStatus(platform.db, c.req.param('id'), body.status))
  })

  // M2: 故障诊断
  app.post('/api/devices/:deviceId/fault-diagnoses', async (c) => {
    const body = await c.req.json()
    return c.json(await services.createFaultDiagnosis(platform.db, c.req.param('deviceId'), body.description), 201)
  })
  app.get('/api/devices/:deviceId/fault-diagnoses', async (c) =>
    c.json(await services.listFaultDiagnoses(platform.db, c.req.param('deviceId'))),
  )

  // M3: 远程升级
  app.post('/api/devices/:deviceId/upgrade-tasks', async (c) => {
    const body = await c.req.json()
    return c.json(await services.createUpgradeTask(platform.db, c.req.param('deviceId'), body.packageId), 201)
  })
  app.get('/api/devices/:deviceId/upgrade-tasks', async (c) =>
    c.json(await services.listUpgradeTasks(platform.db, c.req.param('deviceId'))),
  )
  app.patch('/api/upgrade-tasks/:id', async (c) => {
    const body = await c.req.json()
    return c.json(await services.updateUpgradeTask(platform.db, c.req.param('id'), body.status))
  })

  // M4: 维修工单
  app.post('/api/maintenance-orders', async (c) => {
    const body = await c.req.json()
    return c.json(
      await services.createMaintenanceOrder(platform.db, body.deviceId, body.faultDescription, body.technician ?? null),
      201,
    )
  })
  app.get('/api/maintenance-orders', async (c) =>
    c.json(await services.listMaintenanceOrders(platform.db, c.req.query('deviceId'))),
  )
  app.get('/api/maintenance-orders/:id', async (c) =>
    c.json(await services.getMaintenanceOrder(platform.db, c.req.param('id'))),
  )
  app.patch('/api/maintenance-orders/:id', async (c) => {
    const body = await c.req.json()
    return c.json(await services.updateMaintenanceOrder(platform.db, c.req.param('id'), body.status))
  })

  // M5: 设备履历
  app.get('/api/devices/:deviceId/history', async (c) =>
    c.json(await services.listEquipmentHistory(platform.db, c.req.param('deviceId'))),
  )
}

export function registerProtectedRoutes(_app: Hono, _platform: Platform) {}
