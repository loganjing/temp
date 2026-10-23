import { getDatabase } from './db/database';
import { runSeed } from './db/seed';
import { WSManager } from './ws/websocket';
import { WarehouseMapService } from './modules/warehouse-map';
import { ExecutionMonitoringService } from './modules/execution-monitoring';
import { DeviceManagementService } from './modules/device-management';
import { TrafficCoordinationService } from './modules/traffic-coordination';
import { PathPlanningService } from './modules/path-planning';
import { StatisticsService } from './modules/statistics';
import { TaskManagementService } from './modules/task-management';
import type { DatabaseType } from './db/database';

/**
 * Central service container. All domain services share a reference to this
 * context, allowing cross-module collaboration without circular imports.
 *
 * Services are created in dependency order — leaf modules first.
 */
export class AppContext {
  readonly db: DatabaseType;
  readonly ws: WSManager;
  readonly map: WarehouseMapService;
  readonly events: ExecutionMonitoringService;
  readonly device: DeviceManagementService;
  readonly traffic: TrafficCoordinationService;
  readonly path: PathPlanningService;
  readonly stats: StatisticsService;
  readonly task: TaskManagementService;

  constructor() {
    this.db = getDatabase();
    runSeed(); // idempotent — only seeds when empty
    this.ws = new WSManager();

    // Leaf services (no inter-service dependencies at construction time)
    this.map = new WarehouseMapService(this);
    this.events = new ExecutionMonitoringService(this);
    this.device = new DeviceManagementService(this);
    this.traffic = new TrafficCoordinationService(this);
    this.path = new PathPlanningService(this);
    this.stats = new StatisticsService(this);
    this.task = new TaskManagementService(this);
  }
}
