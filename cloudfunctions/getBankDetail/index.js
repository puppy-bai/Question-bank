const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event = {}) => {
  const bankId = String(event.bankId || '').trim();
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!bankId) {
    throw new Error('缺少题库 ID');
  }

  const user = await getCurrentUser(openid);
  const access = await getUserAccess(user, openid);
  const bankResult = await db.collection('question_banks').doc(bankId).get();
  const bank = bankResult.data;

  if (!bank || bank.status === 'deleted') {
    throw new Error('题库不存在');
  }
  if (!access.all && bank.status !== 'published') {
    throw new Error('题库暂未发布');
  }

  const rules = await getBankVisibilityRules(bankId);
  if (!canViewBank(rules, access)) {
    throw new Error('当前账号无权访问该题库');
  }

  const [chaptersResult, attemptsResult, wrongCountResult, favoriteCountResult, joinedResult] = await Promise.all([
    db.collection('chapters').where({ bankId }).orderBy('createdAt', 'asc').limit(100).get(),
    db.collection('attempts').where({ openid, bankId }).limit(500).get(),
    db.collection('wrong_questions').where({ openid, bankId, mastered: false }).count(),
    db.collection('favorites').where({ openid, bankId }).count().catch(() => ({ total: 0 })),
    db.collection('user_banks').where({ openid, bankId, status: 'active' }).limit(1).get().catch(() => ({ data: [] }))
  ]);

  const chapterCounts = await getChapterCounts(bankId, chaptersResult.data);
  const answeredIds = Array.from(new Set(attemptsResult.data.map((item) => item.questionId).filter(Boolean)));
  const correctCount = attemptsResult.data.filter((item) => item.correct).length;
  const attemptCount = attemptsResult.data.length;

  return {
    ok: true,
    bank: {
      id: bank._id,
      name: bank.name,
      description: bank.description || '',
      status: bank.status || 'published',
      chapterCount: bank.chapterCount || chaptersResult.data.length,
      questionCount: bank.questionCount || 0,
      progress: bank.questionCount ? Math.min(Math.round(answeredIds.length / bank.questionCount * 100), 100) : 0,
      correctRate: attemptCount ? Math.round(correctCount / attemptCount * 100) : 0,
      wrongCount: wrongCountResult.total || 0,
      favoriteCount: favoriteCountResult.total || 0,
      joined: access.all || !!joinedResult.data.length
    },
    chapters: chaptersResult.data.map((chapter) => ({
      id: chapter._id,
      name: chapter.name,
      questionCount: chapterCounts[chapter._id] || 0
    }))
  };
};

async function getCurrentUser(openid) {
  const found = await db.collection('users').where({ openid }).limit(1).get();
  return found.data[0] || { openid, role: 'user' };
}

async function getUserAccess(user, openid) {
  if (user.role === 'admin') {
    return { role: user.role, openid, classIds: [], all: true };
  }

  const [studentClasses, teacherClasses] = await Promise.all([
    db.collection('student_classes').where({ studentOpenid: openid }).limit(100).get().catch(() => ({ data: [] })),
    db.collection('teacher_classes').where({ teacherOpenid: openid }).limit(100).get().catch(() => ({ data: [] }))
  ]);

  return {
    role: user.role || 'user',
    openid,
    all: false,
    classIds: Array.from(new Set([
      ...studentClasses.data.map((item) => item.classId),
      ...teacherClasses.data.map((item) => item.classId)
    ].filter(Boolean)))
  };
}

async function getBankVisibilityRules(bankId) {
  const result = await db.collection('bank_visibility').where({ bankId }).limit(100).get();
  return result.data || [];
}

function canViewBank(rules, access) {
  if (access.all) return true;
  if (!rules || !rules.length) return true;
  if (rules.some((rule) => rule.targetType === 'all')) return true;
  return rules.some((rule) => {
    if (rule.targetType === 'class') return access.classIds.includes(rule.targetId);
    if (rule.targetType === 'user') return rule.targetId === access.openid;
    return false;
  });
}

async function getChapterCounts(bankId, chapters) {
  const output = {};
  for (const chapter of chapters) {
    const count = await db.collection('questions')
      .where({
        bankId,
        chapterId: chapter._id,
        status: 'published'
      })
      .count();
    output[chapter._id] = count.total || 0;
  }

  if (!chapters.length) {
    const count = await db.collection('questions').where({ bankId, status: 'published' }).count();
    output.default = count.total || 0;
  }

  return output;
}
