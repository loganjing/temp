import { useEffect, useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { EMPTY_DRAFT, Teacher, TeacherDraft, teacherToDraft } from './domain/teacher';
import {
  addTeacher,
  loadTeachers,
  removeTeacher,
  saveTeachers,
  updateTeacher,
} from './services/teacher-repository';
import { TeacherTable } from './components/TeacherTable';
import { TeacherForm } from './components/TeacherForm';
import { TeacherDetail } from './components/TeacherDetail';
import { ConfirmDialog } from './components/ConfirmDialog';
import './styles/app.css';

interface EditorState {
  mode: 'create' | 'edit';
  teacherId: string | null;
}

interface Feedback {
  tone: 'success' | 'error';
  message: string;
}

export default function App() {
  const [teachers, setTeachers] = useState<Teacher[]>(() => loadTeachers());
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Teacher | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // 列表变化后同步写回存储，保证同一浏览器再次打开页面时读回一致。
  useEffect(() => {
    saveTeachers(teachers);
  }, [teachers]);

  const detailTeacher = useMemo(
    () => (detailId ? teachers.find((teacher) => teacher.id === detailId) ?? null : null),
    [detailId, teachers],
  );

  const editingTeacher = useMemo(
    () =>
      editor?.mode === 'edit' && editor.teacherId
        ? teachers.find((teacher) => teacher.id === editor.teacherId) ?? null
        : null,
    [editor, teachers],
  );

  const showForm = editor !== null && (editor.mode === 'create' || editingTeacher !== null);

  function handleSave(draft: TeacherDraft) {
    if (!editor) {
      return;
    }

    if (editor.mode === 'create') {
      const nextTeachers = addTeacher(teachers, draft);
      setTeachers(nextTeachers);
      const created = nextTeachers[nextTeachers.length - 1];
      setFeedback({ tone: 'success', message: `已保存教师「${created.name}」` });
    } else if (editor.teacherId) {
      setTeachers(updateTeacher(teachers, editor.teacherId, draft));
      setFeedback({ tone: 'success', message: `已更新教师「${draft.name}」` });
    }

    setEditor(null);
  }

  function confirmDelete() {
    if (!pendingDelete) {
      return;
    }
    setTeachers(removeTeacher(teachers, pendingDelete.id));
    setFeedback({ tone: 'success', message: `已删除教师「${pendingDelete.name}」` });
    if (detailId === pendingDelete.id) {
      setDetailId(null);
    }
    setPendingDelete(null);
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          <span className="app-brand-mark">
            <Users size={18} aria-hidden="true" />
          </span>
          <div>
            <h1>教师管理</h1>
            <p className="app-subtitle">教师信息的查看、新增、编辑与删除</p>
          </div>
        </div>
      </header>

      <main className="app-main">
        {feedback ? (
          <p className={`feedback feedback-${feedback.tone}`} role="status">
            {feedback.message}
          </p>
        ) : null}

        <div className={`content ${detailTeacher ? 'content-with-detail' : ''}`}>
          <TeacherTable
            teachers={teachers}
            onCreate={() => {
              setFeedback(null);
              setEditor({ mode: 'create', teacherId: null });
            }}
            onView={(teacher) => setDetailId(teacher.id)}
            onEdit={(teacher) => {
              setFeedback(null);
              setEditor({ mode: 'edit', teacherId: teacher.id });
            }}
            onDelete={(teacher) => setPendingDelete(teacher)}
          />

          {detailTeacher ? (
            <TeacherDetail
              teacher={detailTeacher}
              onClose={() => setDetailId(null)}
              onEdit={(teacher) => {
                setFeedback(null);
                setEditor({ mode: 'edit', teacherId: teacher.id });
              }}
              onDelete={(teacher) => setPendingDelete(teacher)}
            />
          ) : null}
        </div>
      </main>

      {showForm ? (
        <TeacherForm
          mode={editor.mode}
          initialDraft={editingTeacher ? teacherToDraft(editingTeacher) : EMPTY_DRAFT}
          onSave={handleSave}
          onCancel={() => setEditor(null)}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title="删除教师"
          message={`确认删除教师「${pendingDelete.name}」？删除后该记录不再出现在教师列表中。`}
          confirmLabel="确认删除"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}
    </div>
  );
}