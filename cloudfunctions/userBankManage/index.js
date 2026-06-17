const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = String(event.action || 'join');
  const bankId = String(event.bankId || '').trim();

  if (!bankId) throw new Error('缺少题库 ID');

  const user = await getCurrentUser(openid);
  const access = await getUserAccess(user, openid);
  const bankResult = await db.collection('question_banks').doc(bankId).get();
  const bank = bankResult.data;

  if (!bank || bank.status === 'deleted') throw new Error('题库不存在');
  if (!access.all && bank.status !== 'published') throw new Error('题库暂未发布');

  const rules = await getBankVisibilityRules(bankId);
  if (!canViewBank(rules, access)) throw new Error('当前账号无权访问该题库');

  if (action === 'join') return joinBank({ openid, bank });
  if (action === 'leave') return leaveBank({ openid, bankId });

  throw new Error('未知题库操作');
};

async function joinBank({ openid, bank }) {
  await ensureCollection('user_banks');
  const now = new Date();
  const found = await db.collection('user_banks')
    .where({ openid, bankId: bank._id })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }));

  if (found.data.length) {
    await db.collection('user_banks').doc(found.data[0]._id).update({
      data: {
        status: 'active',
        bankName: bank.name,
        questionCount: bank.questionCount || 0,
        chapterCount: bank.chapterCount || 0,
        updatedAt: now
      }
    });
  } else {
    await db.collection('user_banks').add({
      data: {
        openid,
        bankId: bank._id,
        bankName: bank.name,
        questionCount: bank.questionCount || 0,
        chapterCount: bank.chapterCount || 0,
        status: 'active',
        createdAt: now,
        updatedAt: now
      }
    });
  }

  await updateUserBankCount(openid);
  return { ok: true, joined: true };
}

async function leaveBank({ openid, bankId }) {
  await ensureCollection('user_banks');
  const now = new Date();
  const found = await db.collection('user_banks')
    .where({ openid, bankId })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }));

  if (found.data.length) {
    await db.collection('user_banks').doc(found.data[0]._id).update({
      data: {
        status: 'removed',
        updatedAt: now
      }
    });
  }

  await updateUserBankCount(openid);
  return { ok: true, joined: false };
}

async function ensureCollection(name) {
  if (typeof db.createCollection !== 'function') return;
  await db.createCollection(name).catch(() => {});
}

async function updateUserBankCount(openid) {
  const [userResult, countResult] = await Promise.all([
    db.collection('users').where({ openid }).limit(1).get(),
    db.collection('user_banks').where({ openid, status: 'active' }).count().catch(() => ({ total: 0 }))
  ]);

  if (!userResult.data.length) return;
  await db.collection('users').doc(userResult.data[0]._id).update({
    data: {
      visibleBanks: countResult.total || 0,
      updatedAt: new Date()
    }
  });
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
    return false;
  });
}
