const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event = {}) => {
  const { studentOpenid } = event;
  const wxContext = cloud.getWXContext();

  if (!studentOpenid) {
    throw new Error('缺少学生 OpenID');
  }

  const teacher = await getCurrentUser(wxContext.OPENID);
  if (!['teacher', 'admin'].includes(teacher.role)) {
    throw new Error('无老师权限');
  }

  const allowed = teacher.role === 'admin' || await canTeacherViewStudent(teacher.openid, studentOpenid);
  if (!allowed) {
    throw new Error('无权查看该学生');
  }

  const student = await getStudent(studentOpenid);
  const attempts = await db.collection('attempts')
    .where({ openid: studentOpenid })
    .orderBy('createdAt', 'desc')
    .limit(200)
    .get();
  const wrongs = await db.collection('wrong_questions')
    .where({ openid: studentOpenid, mastered: false })
    .orderBy('updatedAt', 'desc')
    .limit(100)
    .get();

  const correct = attempts.data.filter((item) => item.correct).length;

  return {
    ok: true,
    student,
    summary: {
      attempts: attempts.data.length,
      correctRate: attempts.data.length ? Math.round((correct / attempts.data.length) * 100) : 0,
      wrongCount: wrongs.data.length
    },
    attempts: attempts.data.map((item) => ({
      id: item._id,
      questionId: item.questionId,
      bankId: item.bankId,
      type: item.type,
      correct: item.correct,
      createdAt: item.createdAt
    })),
    wrongQuestions: wrongs.data.map((item) => ({
      id: item._id,
      questionId: item.questionId,
      stem: item.stem,
      type: item.type,
      wrongCount: item.wrongCount || 1
    }))
  };
};

async function getCurrentUser(openid) {
  const found = await db.collection('users').where({ openid }).limit(1).get();
  return found.data[0] || { openid, role: 'student' };
}

async function getStudent(openid) {
  const found = await db.collection('users').where({ openid, role: 'student' }).limit(1).get();
  if (!found.data.length) throw new Error('学生不存在');
  const student = found.data[0];
  return {
    openid: student.openid,
    name: student.name || '未命名学生',
    className: student.className || '未分班'
  };
}

async function canTeacherViewStudent(teacherOpenid, studentOpenid) {
  const teacherClasses = await db.collection('teacher_classes')
    .where({ teacherOpenid })
    .limit(100)
    .get();
  const classIds = teacherClasses.data.map((item) => item.classId);
  if (!classIds.length) return false;

  const relations = await db.collection('student_classes')
    .where({ studentOpenid })
    .limit(100)
    .get();
  return relations.data.some((item) => classIds.includes(item.classId));
}
