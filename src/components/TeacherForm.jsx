import { useState, useEffect } from 'react';
import { validateField, validateForm, isFormValid } from '../utils/validation.js';

const FIELD_CONFIG = [
  { key: 'name', label: '教师名称', placeholder: '请输入教师姓名', type: 'text' },
  { key: 'course', label: '教授课程', placeholder: '请输入教授课程', type: 'text' },
  { key: 'grade', label: '年级', placeholder: '请输入年级', type: 'text' },
  { key: 'phone', label: '手机', placeholder: '请输入手机号', type: 'tel' },
  { key: 'email', label: '邮箱', placeholder: '请输入邮箱', type: 'email' },
];

const EMPTY_FORM = {
  name: '',
  course: '',
  grade: '',
  phone: '',
  email: '',
};

/**
 * 教师信息表单组件
 * 用于新增和编辑教师信息，提交时执行字段校验。
 *
 * @param {Object} props
 * @param {Object|null} props.teacher - 编辑时传入的教师记录，新增时为 null
 * @param {Function} props.onSubmit - 提交回调，接收表单数据
 * @param {Function} props.onCancel - 取消回调
 */
export default function TeacherForm({ teacher, onSubmit, onCancel }) {
  // 惰性初始化：编辑模式同步回填数据，避免首帧闪现空表单
  const [formData, setFormData] = useState(() => {
    if (teacher) {
      return {
        name: teacher.name || '',
        course: teacher.course || '',
        grade: teacher.grade || '',
        phone: teacher.phone || '',
        email: teacher.email || '',
      };
    }
    return { ...EMPTY_FORM };
  });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  // 编辑模式：回填已有数据
  useEffect(() => {
    if (teacher) {
      setFormData({
        name: teacher.name || '',
        course: teacher.course || '',
        grade: teacher.grade || '',
        phone: teacher.phone || '',
        email: teacher.email || '',
      });
    } else {
      setFormData(EMPTY_FORM);
    }
    setErrors({});
    setTouched({});
  }, [teacher]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // 已触碰的字段实时校验
    if (touched[field]) {
      setErrors((prev) => ({ ...prev, [field]: validateField(field, value) }));
    }
  };

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrors((prev) => ({
      ...prev,
      [field]: validateField(field, formData[field]),
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const formErrors = validateForm(formData);
    setErrors(formErrors);
    setTouched({
      name: true,
      course: true,
      grade: true,
      phone: true,
      email: true,
    });

    if (isFormValid(formErrors)) {
      onSubmit(formData);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          {teacher ? '编辑教师信息' : '新增教师'}
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            {FIELD_CONFIG.map(({ key, label, placeholder, type }) => (
              <div className="form-field" key={key}>
                <label htmlFor={`field-${key}`}>
                  {label}
                  <span className="required">*</span>
                </label>
                <input
                  id={`field-${key}`}
                  type={type}
                  placeholder={placeholder}
                  value={formData[key]}
                  onChange={(e) => handleChange(key, e.target.value)}
                  onBlur={() => handleBlur(key)}
                  className={errors[key] ? 'error' : ''}
                  autoComplete="off"
                />
                {errors[key] && (
                  <span className="field-error">{errors[key]}</span>
                )}
              </div>
            ))}
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onCancel}>
                取消
              </button>
              <button type="submit" className="btn btn-primary">
                {teacher ? '保存' : '添加'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
