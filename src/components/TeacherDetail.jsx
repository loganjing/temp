export default function TeacherDetail({ teacher, onBack }) {
  return (
    <div className="teacher-detail-container">
      <div className="detail-header">
        <h2>教师详情</h2>
        <button className="btn btn-secondary" onClick={onBack}>
          返回列表
        </button>
      </div>
      <div className="detail-card">
        <div className="detail-field">
          <span className="detail-label">教师名称</span>
          <span className="detail-value">{teacher.teacherName}</span>
        </div>
        <div className="detail-field">
          <span className="detail-label">教授课程</span>
          <span className="detail-value">{teacher.course}</span>
        </div>
        <div className="detail-field">
          <span className="detail-label">年级</span>
          <span className="detail-value">{teacher.grade}</span>
        </div>
        <div className="detail-field">
          <span className="detail-label">手机</span>
          <span className="detail-value">{teacher.phone}</span>
        </div>
        <div className="detail-field">
          <span className="detail-label">邮箱</span>
          <span className="detail-value">{teacher.email}</span>
        </div>
      </div>
    </div>
  )
}
