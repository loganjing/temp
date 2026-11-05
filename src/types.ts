export interface Teacher {
  id: string;
  name: string;
  course: string;
  grade: string;
  phone: string;
  email: string;
}

export type TeacherInput = Omit<Teacher, 'id'>;
