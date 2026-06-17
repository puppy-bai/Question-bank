const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event = {}) => {
  const { questionId, favorited } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!questionId) {
    throw new Error('缺少题目 ID');
  }

  const questionResult = await db.collection('questions').doc(questionId).get();
  const question = questionResult.data;
  if (!question || question.status !== 'published') {
    throw new Error('题目不存在或未发布');
  }

  const bank = await db.collection('question_banks').doc(question.bankId).get();
  if (!bank.data || bank.data.status !== 'published') {
    throw new Error('题库不存在或未发布');
  }

  const user = await getCurrentUser(openid);
  const access = await getUserAccess(user, openid);
  const rules = await getBankVisibilityRules(question.bankId);
  if (!canViewBank(rules, access)) {
    throw new Error('当前账号无权收藏该题目');
  }

  const found = await db.collection('favorites')
    .where({ openid, questionId })
    .limit(1)
    .get();

  const now = new Date();
  const nextFavorited = typeof favorited === 'boolean' ? favorited : !found.data.length;

  if (!nextFavorited) {
    if (found.data.length) {
      await db.collection('favorites').doc(found.data[0]._id).remove();
    }
    await updateFavoriteCount(openid);
    return {
      ok: true,
      favorited: false
    };
  }

  const data = {
    openid,
    bankId: question.bankId,
    bankName: bank.data.name || '',
    chapterId: question.chapterId || '',
    chapterName: question.chapterName || '',
    questionId,
    stem: question.stem || '',
    type: question.type || '',
    updatedAt: now
  };

  if (found.data.length) {
    await db.collection('favorites').doc(found.data[0]._id).update({ data });
  } else {
    await db.collection('favorites').add({
      data: {
        ...data,
        createdAt: now
      }
    });
  }

  await updateFavoriteCount(openid);
  return {
    ok: true,
    favorited: true
  };
};

async function updateFavoriteCount(openid) {
  const [userResult, favoriteCount] = await Promise.all([
    db.collection('users').where({ openid }).limit(1).get(),
    db.collection('favorites').where({ openid }).count()
  ]);

  if (userResult.data.length) {
    await db.collection('users').doc(userResult.data[0]._id).update({
      data: {
        favoriteCount: favoriteCount.total || 0,
        updatedAt: new Date()
      }
    });
  }
}

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
    if (rule.targetType === 'teacher') return access.role === 'teacher' && rule.targetId === access.openid;
    return false;
  });
}
