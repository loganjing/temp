/**
 * API 客户端 — 基于技术契约 (docs/wi-t1000030/technical-contract.md) 实现。
 * 不发明 API 行为，所有接口路径、字段、类型严格对应契约定义。
 * 所有 ID 均为 string，前端透传，不做类型转换。
 */

const BASE_PATH = '/api';

async function request(method, path, { body, query } = {}) {
  let url = `${BASE_PATH}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, String(value));
      }
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const options = { method, headers: {} };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  if (res.status === 204) return null;

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message = data?.error || `请求失败 (${res.status})`;
    throw new ApiError(message, res.status, data);
  }
  return data;
}

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/* ── 类型定义（对应技术契约） ── */

/**
 * @typedef {Object} Area
 * @property {string} id
 * @property {string} name
 * @property {string} location_desc
 * @property {string} requirements
 * @property {string} created_at
 */

/**
 * @typedef {Object} Job
 * @property {string} id
 * @property {string} area_id
 * @property {string} area_name
 * @property {string} assignee
 * @property {'daily'|'weekly'} schedule_type
 * @property {number[]|null} schedule_days
 * @property {string} start_time
 * @property {boolean} active
 * @property {string} created_at
 */

/**
 * @typedef {Object} TaskInstance
 * @property {string} id
 * @property {string} job_id
 * @property {string} scheduled_date
 * @property {'pending'|'in_progress'|'completed'|'has_obstacle_completed'} status
 * @property {string} assignee
 * @property {string} area_name
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} Obstacle
 * @property {string} id
 * @property {string} task_instance_id
 * @property {string} description
 * @property {string} reported_at
 * @property {'pending'|'resolved'} status
 * @property {string|null} resolution_method
 * @property {string|null} resolution_result
 * @property {string|null} resolved_at
 */

/**
 * @typedef {Object} SupplyItem
 * @property {string} id
 * @property {string} name
 * @property {number} quantity
 * @property {string} unit
 * @property {number} threshold
 * @property {boolean} low_stock
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} SupplyAlert
 * @property {string} id
 * @property {string} supply_item_id
 * @property {string} supply_item_name
 * @property {string} created_at
 * @property {'active'|'resolved'} status
 * @property {string|null} resolved_at
 */

/**
 * @typedef {Object} SupplyConsumption
 * @property {string} supply_item_id
 * @property {string} supply_item_name
 * @property {number} consumed
 */

/**
 * @typedef {Object} QualityReport
 * @property {string|null} area_id
 * @property {string|null} area_name
 * @property {string} from
 * @property {string} to
 * @property {number} task_completion_rate
 * @property {number} total_task_instances
 * @property {number} completed_task_instances
 * @property {number} obstacle_count
 * @property {number} obstacle_resolved_count
 * @property {number} obstacle_resolution_rate
 * @property {SupplyConsumption[]} supply_consumption
 */

/* ── 1. 清洁区域 ── */

export const areasApi = {
  /** @returns {Promise<Area[]>} */
  list: () => request('GET', '/areas'),
  /** @param {string} id @returns {Promise<Area>} */
  get: (id) => request('GET', `/areas/${id}`),
  /** @param {{name:string, location_desc:string, requirements:string}} data @returns {Promise<Area>} */
  create: (data) => request('POST', '/areas', { body: data }),
  /** @param {string} id @param {Partial<{name:string, location_desc:string, requirements:string}>} data @returns {Promise<Area>} */
  update: (id, data) => request('PUT', `/areas/${id}`, { body: data }),
  /** @param {string} id @returns {Promise<null>} */
  remove: (id) => request('DELETE', `/areas/${id}`),
};

/* ── 2. 定时作业 + 任务实例 ── */

export const jobsApi = {
  /** @returns {Promise<Job[]>} */
  list: () => request('GET', '/jobs'),
  /**
   * @param {{area_id:string, assignee:string, schedule_type:'daily'|'weekly', schedule_days?:number[], start_time:string}} data
   * @returns {Promise<Job>}
   */
  create: (data) => request('POST', '/jobs', { body: data }),
  /**
   * @param {string} id
   * @param {Partial<{area_id:string, assignee:string, schedule_type:'daily'|'weekly', schedule_days:number[], start_time:string, active:boolean}>} data
   * @returns {Promise<Job>}
   */
  update: (id, data) => request('PUT', `/jobs/${id}`, { body: data }),
};

export const taskInstancesApi = {
  /**
   * @param {{job_id?:string, status?:string}} [query]
   * @returns {Promise<TaskInstance[]>}
   */
  list: (query) => request('GET', '/task-instances', { query }),
};

/* ── 3. 障碍处理 ── */

export const obstaclesApi = {
  /** @param {{status?:string}} [query] @returns {Promise<Obstacle[]>} */
  list: (query) => request('GET', '/obstacles', { query }),
  /** @param {{task_instance_id:string, description:string}} data @returns {Promise<Obstacle>} */
  create: (data) => request('POST', '/obstacles', { body: data }),
  /**
   * @param {string} id
   * @param {{resolution_method:string, resolution_result:string}} data
   * @returns {Promise<Obstacle>}
   */
  resolve: (id, data) => request('PUT', `/obstacles/${id}/resolve`, { body: data }),
};

/* ── 4. 耗材管理 + 库存提醒 ── */

export const suppliesApi = {
  /** @returns {Promise<SupplyItem[]>} */
  list: () => request('GET', '/supplies'),
  /** @param {{name:string, quantity:number, unit:string, threshold:number}} data @returns {Promise<SupplyItem>} */
  create: (data) => request('POST', '/supplies', { body: data }),
  /**
   * @param {string} id
   * @param {Partial<{name:string, quantity:number, unit:string, threshold:number}>} data
   * @returns {Promise<SupplyItem>}
   */
  update: (id, data) => request('PUT', `/supplies/${id}`, { body: data }),
  /** @param {string} id @returns {Promise<null>} */
  remove: (id) => request('DELETE', `/supplies/${id}`),
};

export const supplyAlertsApi = {
  /** @returns {Promise<SupplyAlert[]>} */
  list: () => request('GET', '/supply-alerts'),
  /** @param {string} id @returns {Promise<SupplyAlert>} */
  resolve: (id) => request('PUT', `/supply-alerts/${id}/resolve`),
};

/* ── 5. 作业质量报告 ── */

export const reportsApi = {
  /**
   * @param {{area_id?:string, from?:string, to?:string}} query
   * @returns {Promise<QualityReport>}
   */
  quality: (query) => request('GET', '/reports/quality', { query }),
};
