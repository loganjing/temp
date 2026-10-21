import { useCallback, useState } from 'react';
import type { Teacher, TeacherDraft } from './types';
import { createTeacher, deleteTeacher, listTeachers, updateTeacher } from './store/teacherStore';
import { validateTeacherDraft } from './validation';
import TeacherTable from './components/TeacherTable';
import TeacherForm from './components/TeacherForm';
import ConfirmDialog from './components/ConfirmDialog';

/** 单页视图状态：列表 / 新增 / 编辑 / 删除确认，由应用内状态切换，不引入路由库 */
type View =
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'edit'; teacher: Teacher }
  | { kind: 'delete'; teacher: Teacher };

export default function App() {
  const [teachers, setTeachers] = useState<Teacher[]>(() => listTeachers());
  const [view, setView] = useState<View>({ kind: 'list' });
  const [notice, setNotice] = useState<string | null>(null);

  /** 写操作完成后从存储重新读取，写入结果以读回为准 */
  const refreshList = useCallback(() => {
    setTeachers(listTeachers());
  }, []);

  const handleCreate = (input: TeacherDraft): void => {
    const { draft, errors } = validateTeacherDraft(input);
    if (Object.keys(errors).length > 0) {
      return;
    }
    createTeacher(draft);
    refreshList();
    setView({ kind: 'list' });
    setNotice(`已新增教师：${draft.name}`);
  };

  const handleUpdate = (id: string, input: TeacherDraft): void => {
    const { draft, errors } = validateTeacherDraft(input);
    if (Object.keys(errors).length > 0) {
      return;
    }
    const updated = updateTeacher(id, draft);
    if (updated === null) {
      return;
    }
    refreshList();
    setView({ kind: 'list' });
    setNotice(`已保存修改：${draft.name}`);
  };

  const handleDelete = (teacher: Teacher): void => {
    deleteTeacher(teacher.id);
    refreshList();
    setView({ kind: 'list' });
    setNotice(`已删除教师：${teacher.name}`);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>教师管理系统</h1>
        <p className="app-subtitle">管理教师的名称、教授课程、年级、手机与邮箱信息</p>
      </header>

      {notice !== null && (
        <div className="notice-bar" role="status">
          <span>{notice}</span>
          <button type="button" className="btn btn-small" onClick={() => setNotice(null)}>
            知道了
          </button>
        </div>
      )}

      {view.kind === 'list' && (
        <section className="panel">
          <div className="panel-toolbar">
            <h2>教师列表（{teachers.length}）</h2>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setNotice(null);
                setView({ kind: 'create' });
              }}
            >
              新增教师
            </button>
          </div>
          <TeacherTable
            teachers={teachers}
            onEdit={(teacher) => setView({ kind: 'edit', teacher })}
            onDelete={(teacher) => setView({ kind: 'delete', teacher })}
          />
        </section>
      )}

      {(view.kind === 'create' || view.kind === 'edit') && (
        <section className="panel">
          <div className="panel-toolbar">
            <h2>{view.kind === 'create' ? '新增教师' : '编辑教师'}</h2>
          </div>
          <TeacherForm
            key={view.kind === 'edit' ? view.teacher.id : 'create'}
            initial={view.kind === 'edit' ? view.teacher : undefined}
            submitLabel={view.kind === 'create' ? '保存' : '保存修改'}
            onSubmit={(input) => {
              if (view.kind === 'edit') {
                handleUpdate(view.teacher.id, input);
                return;
              }
              handleCreate(input);
            }}
            onCancel={() => setView({ kind: 'list' })}
          />
        </section>
      )}

      {view.kind === 'delete' && (
        <ConfirmDialog
          title="删除教师"
          message={`确定要删除教师“${view.teacher.name}”吗？删除后该记录不再出现在教师列表中。`}
          confirmLabel="删除"
          cancelLabel="取消"
          onConfirm={() => handleDelete(view.teacher)}
          onCancel={() => setView({ kind: 'list' })}
        />
      )}
    </div>
  );
}
