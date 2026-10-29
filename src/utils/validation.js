/**
 * 表单校验工具
 * 校验规则来源于需求基线 AC-02：
 * - 五个字段均为必填
 * - 手机号须符合基本手机号格式（非空及基本数字长度）
 * - 邮箱须包含 @ 及域名部分的简单格式校验
 */

const PHONE_REGEX = /^1[3-9]\d{9}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 校验单个字段值
 * @param {string} field - 字段名
 * @param {string} value - 字段值
 * @returns {string|null} 错误信息，无错误返回 null
 */
export function validateField(field, value) {
  const trimmed = (value || '').trim();

  if (!trimmed) {
    return '此字段为必填项';
  }

  if (field === 'phone' && !PHONE_REGEX.test(trimmed)) {
    return '请输入有效的手机号码';
  }

  if (field === 'email' && !EMAIL_REGEX.test(trimmed)) {
    return '请输入有效的邮箱地址';
  }

  return null;
}

/**
 * 校验整个表单
 * @param {Object} data - 表单数据 { name, course, grade, phone, email }
 * @returns {Object} 各字段的错误信息，无错误的字段值为 null
 */
export function validateForm(data) {
  const fields = ['name', 'course', 'grade', 'phone', 'email'];
  const errors = {};

  for (const field of fields) {
    errors[field] = validateField(field, data[field]);
  }

  return errors;
}

/**
 * 检查表单是否通过校验（无任何错误）
 * @param {Object} errors - validateForm 返回的错误对象
 * @returns {boolean}
 */
export function isFormValid(errors) {
  return Object.values(errors).every((err) => err === null);
}
