const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async () => {
  const wxContext = cloud.getWXContext();
  const teacher = await getCurrentUser(wxContext.OPENID);
  if (!['teacher', 'admin'].includes(teacher.role)) {
    throw new Error('无老师权限');
  }

  const studentOpenids = await getVisibleStudentOpenids(teacher);
  const students = await getStudents(studentOpenids);
  const attempts = await getAttempts(studentOpenids);
  const wrongs = await getWrongs(studentOpenids);

  const attemptMap = groupAttempts(attempts);
  const wrongMap = groupWrongs(wrongs);
  const studentRows = students.map((student) => {
    const stats = attemptMap[student.openid] || { total: 0, correct: 0 };
    return {
      openid: student.openid,
      name: student.name || '未命名学生',
      className: student.className || '未分班',
      attempts: stats.total,
      correctRate: stats.total ? Math.round((stats.correct / stats.total) * 100) : 0,
      wrongCount: wrongMap[student.openid] || 0
    };
  });

  const totalAttempts = attempts.length;
  const totalCorrect = attempts.filter((item) => item.correct).length;

  return {
    ok: true,
    summary: {
      studentCount: students.length,
      attempts: totalAttempts,
      correctRate: totalAttempts ? Math.round((totalCorrect / totalAttempts) * 100) : 0,
      wrongCount: wrongs.length
    },
    students: studentRows.sort((a, b) => b.attempts - a.attempts).slice(0, 100),
    hotWrongs: getHotWrongs(wrongs)
  };
};

async function getCurrentUser(openid) {
  const found = await db.collection('users').where({ openid }).limit(1).get();
  return found.data[0] || { openid, role: 'student' };
}

async function getVisibleStudentOpenids(teacher) {
  if (teacher.role === 'admin') {
    const result = await db.collection('users').where({ role: 'student' }).limit(100).get();
    return result.data.map((item) => item.openid);
  }

  const relations = await db.collection('teacher_classes')
    .where({ teacherOpenid: teacher.openid })
    .limit(100)
    .get();
  const classIds = relations.data.map((item) => item.classId);
  if (!classIds.length) return [];

  const students = await db.collection('student_classes')
    .where({ classId: _.in(classIds) })
    .limit(100)
    .get();
  return Array.from(new Set(students.data.map((item) => item.studentOpenid)));
}

async function getStudents(openids) {
  if (!openids.length) return [];
  const result = await db.collection('users')
    .where({ openid: _.in(openids), role: 'student' })
    .limit(100)
    .get();
  return result.data;
}

async function getAttempts(openids) {
  if (!openids.length) return [];
  const result = await db.collection('attempts')
    .where({ openid: _.in(openids) })
    .orderBy('createdAt', 'desc')
    .limit(1000)
    .get();
  return result.data;
}

async function getWrongs(openids) {
  if (!openids.length) return [];
  const result = await db.collection('wrong_questions')
    .where({ openid: _.in(openids), mastered: false })
    .orderBy('updatedAt', 'desc')
    .limit(1000)
    .get();
  return result.data;
}

function groupAttempts(attempts) {
  const map = {};
  attempts.forEach((item) => {
    if (!map[item.openid]) map[item.openid] = { total: 0, correct: 0 };
    map[item.openid].total += 1;
    if (item.correct) map[item.openid].correct += 1;
  });
  return map;
}

function groupWrongs(wrongs) {
  const map = {};
  wrongs.forEach((item) => {
    map[item.openid] = (map[item.openid] || 0) + 1;
  });
  return map;
}

function getHotWrongs(wrongs) {
  const map = {};
  wrongs.forEach((item) => {
    const key = item.questionId;
    if (!map[key]) {
      map[key] = {
        questionId: key,
        stem: item.stem,
        count: 0
      };
    }
    map[key].count += item.wrongCount || 1;
  });

  return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 10);
}
