/**
 * 字段校验规则（按技术契约 §4）。
 */

const PHONE_REGEX = /^1[3-9]\d{9}$/;
const ID_CARD_REGEX = /^\d{17}[\dXx]$/;

export interface VisitorInput {
  name: string;
  phone: string;
  id_card: string;
  company: string;
  visit_reason: string;
  host_name: string | null;
  expected_arrival_time: string | null;
  phone_source: string;
}

export interface StatusUpdateInput {
  status: 'approved' | 'rejected';
}

export interface ListFilters {
  status?: string;
  phone?: string;
}

type ValidationResult<T> = { ok: true; data: T } | { ok: false; fields: Record<string, string> };

/**
 * 校验 POST /api/visitors 请求体。
 */
export function validateVisitorInput(body: unknown): ValidationResult<VisitorInput> {
  const fields: Record<string, string> = {};

  if (typeof body !== 'object' || body === null) {
    return { ok: false, fields: { _: '请求体必须是 JSON 对象' } };
  }

  const b = body as Record<string, unknown>;

  // name: 非空，1-50 字符
  if (typeof b.name !== 'string' || b.name.length === 0) {
    fields.name = '姓名不能为空';
  } else if (b.name.length > 50) {
    fields.name = '姓名长度不能超过 50 字符';
  }

  // phone: 11 位数字，正则 ^1[3-9]\d{9}$
  if (typeof b.phone !== 'string' || !PHONE_REGEX.test(b.phone)) {
    fields.phone = '手机号必须为 11 位数字，且以 1 开头（正则 ^1[3-9]\\d{9}$）';
  }

  // id_card: 18 位，前 17 位数字 + 末位数字或 X
  if (typeof b.id_card !== 'string' || !ID_CARD_REGEX.test(b.id_card)) {
    fields.id_card = '身份证号必须为 18 位（前 17 位数字，末位数字或 X）';
  }

  // company: 非空，1-200 字符
  if (typeof b.company !== 'string' || b.company.length === 0) {
    fields.company = '公司信息不能为空';
  } else if (b.company.length > 200) {
    fields.company = '公司信息长度不能超过 200 字符';
  }

  // visit_reason: 非空，1-500 字符
  if (typeof b.visit_reason !== 'string' || b.visit_reason.length === 0) {
    fields.visit_reason = '访问事由不能为空';
  } else if (b.visit_reason.length > 500) {
    fields.visit_reason = '访问事由长度不能超过 500 字符';
  }

  // host_name: 选填，可为空
  let host_name: string | null = null;
  if (b.host_name !== undefined && b.host_name !== null && b.host_name !== '') {
    if (typeof b.host_name !== 'string') {
      fields.host_name = '被访人姓名必须是字符串';
    } else if (b.host_name.length > 50) {
      fields.host_name = '被访人姓名长度不能超过 50 字符';
    } else {
      host_name = b.host_name;
    }
  }

  // expected_arrival_time: 选填，可为空，ISO 8601
  let expected_arrival_time: string | null = null;
  if (
    b.expected_arrival_time !== undefined &&
    b.expected_arrival_time !== null &&
    b.expected_arrival_time !== ''
  ) {
    if (typeof b.expected_arrival_time !== 'string') {
      fields.expected_arrival_time = '预计到访时间必须是字符串';
    } else if (Number.isNaN(Date.parse(b.expected_arrival_time))) {
      fields.expected_arrival_time = '预计到访时间必须是有效的 ISO 8601 格式';
    } else {
      expected_arrival_time = b.expected_arrival_time;
    }
  }

  // phone_source: wechat 或 manual
  if (
    typeof b.phone_source !== 'string' ||
    (b.phone_source !== 'wechat' && b.phone_source !== 'manual')
  ) {
    fields.phone_source = '手机号来源必须为 wechat 或 manual';
  }

  if (Object.keys(fields).length > 0) {
    return { ok: false, fields };
  }

  return {
    ok: true,
    data: {
      name: b.name as string,
      phone: b.phone as string,
      id_card: b.id_card as string,
      company: b.company as string,
      visit_reason: b.visit_reason as string,
      host_name,
      expected_arrival_time,
      phone_source: b.phone_source as string,
    },
  };
}

/**
 * 校验 PATCH /api/visitors/:id/status 请求体。
 */
export function validateStatusUpdate(body: unknown): ValidationResult<StatusUpdateInput> {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, fields: { _: '请求体必须是 JSON 对象' } };
  }

  const b = body as Record<string, unknown>;
  const status = b.status;

  if (
    typeof status !== 'string' ||
    (status !== 'approved' && status !== 'rejected')
  ) {
    return { ok: false, fields: { status: '状态必须为 approved 或 rejected' } };
  }

  return { ok: true, data: { status: status as 'approved' | 'rejected' } };
}

/**
 * 校验 GET /api/visitors 查询参数。
 */
export function validateListQuery(query: {
  status?: string;
  phone?: string;
}): ValidationResult<ListFilters> {
  const fields: Record<string, string> = {};
  const filters: ListFilters = {};

  if (query.status !== undefined && query.status !== '') {
    if (!['pending', 'approved', 'rejected'].includes(query.status)) {
      fields.status = '状态过滤值必须为 pending、approved 或 rejected';
    } else {
      filters.status = query.status;
    }
  }

  if (query.phone !== undefined && query.phone !== '') {
    if (!PHONE_REGEX.test(query.phone)) {
      fields.phone = '手机号过滤值必须为有效的 11 位手机号';
    } else {
      filters.phone = query.phone;
    }
  }

  if (Object.keys(fields).length > 0) {
    return { ok: false, fields };
  }

  return { ok: true, data: filters };
}
