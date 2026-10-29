import { useState } from 'react';
import { useTeachers } from './hooks/useTeachers.js';
import TeacherForm from './components/TeacherForm.jsx';
import DeleteConfirm from './components/DeleteConfirm.jsx';

const COLUMNS = [
  { key: 'name', label: '教师名称' },
  { key: 'course', label: '教授课程' },
  { key: 'grade', label: '年级' },
  { key: 'phone', label: '手机' },
  { key: 'email', label: '邮箱' },
];

export default function App() {
  const { teachers, addTeacher, updateTeacher, deleteTeacher, persistError, initialized } = useTeachers();
  const [showForm, setShowForm] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [deletingTeacher, setDeletingTeacher] = useState(null);

  const handleAddClick = () => {
    setEditingTeacher(null);
    setShowForm(true);
  };

  const handleEditClick = (teacher) => {
    setEditingTeacher(teacher);
    setShowForm(true);
  };

  const handleFormSubmit = (data) => {
    try {
      if (editingTeacher) {
        updateTeacher(editingTeacher.id, data);
      } else {
        addTeacher(data);
      }
      setShowForm(false);
      setEditingTeacher(null);
    } catch (e) {
      console.error('保存教师失败:', e);
    }
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingTeacher(null);
  };

  const handleDeleteClick = (teacher) => {
    setDeletingTeacher(teacher);
  };

  const handleDeleteConfirm = () => {
    if (deletingTeacher) {
      deleteTeacher(deletingTeacher.id);
      setDeletingTeacher(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeletingTeacher(null);
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>教师管理系统</h1>
      </header>

      <div className="toolbar">
        <button className="btn btn-primary" onClick={handleAddClick}>
          新增教师
        </button>
      </div>

      {persistError && (
        <div className="persist-error">{persistError}</div>
      )}

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.key}>{col.label}</th>
              ))}
              <th style={{ width: '140px' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {!initialized ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="empty-row">
                  正在加载教师数据…
                </td>
              </tr>
            ) : teachers.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="empty-row">
                  暂无教师记录，点击「新增教师」添加
                </td>
              </tr>
            ) : (
              teachers.map((teacher) => (
                <tr key={teacher.id}>
                  {COLUMNS.map((col) => (
                    <td key={col.key}>{teacher[col.key]}</td>
                  ))}
                  <td>
                    <div className="action-cell">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleEditClick(teacher)}
                      >
                        编辑
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDeleteClick(teacher)}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <TeacherForm
          teacher={editingTeacher}
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
        />
      )}

      {deletingTeacher && (
        <DeleteConfirm
          teacher={deletingTeacher}
          onConfirm={handleDeleteConfirm}
          onCancel={handleDeleteCancel}
        />
      )}
    </div>
  );
}
