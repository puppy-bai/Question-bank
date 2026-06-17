const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const user = await getCurrentUser(wxContext.OPENID);
  const access = await getUserAccess(user, wxContext.OPENID);
  const joinedOnly = !!event.joinedOnly;

  const statusQuery = access.all ? _.in(['published', 'importing']) : 'published';
  const banksResult = await db.collection('question_banks')
    .where({ status: statusQuery })
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();

  const visibilityResult = await db.collection('bank_visibility').limit(500).get();
  const visibilityMap = groupVisibility(visibilityResult.data);
  const viewableBanks = banksResult.data.filter((bank) => canViewBank(bank._id, visibilityMap[bank._id], access));
  const viewableBankIds = viewableBanks.map((bank) => bank._id);
  const joinedMap = await getJoinedBankMap(wxContext.OPENID, viewableBankIds);
  const banks = joinedOnly
    ? viewableBanks.filter((bank) => joinedMap[bank._id])
    : viewableBanks;
  const bankIds = banks.map((bank) => bank._id);
  const progressMap = await getProgressMap(wxContext.OPENID, bankIds);

  return {
    ok: true,
    user,
    banks: banks.map((bank) => ({
      id: bank._id,
      name: bank.name,
      status: bank.status || 'published',
      chapterCount: bank.chapterCount || 0,
      questionCount: bank.questionCount || 0,
      progress: progressMap[bank._id] || 0,
      joined: !!joinedMap[bank._id],
      joinedAt: joinedMap[bank._id] ? joinedMap[bank._id].createdAt : null,
      scope: getScopeText(visibilityMap[bank._id])
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

function groupVisibility(rules) {
  return rules.reduce((map, rule) => {
    if (!map[rule.bankId]) map[rule.bankId] = [];
    map[rule.bankId].push(rule);
    return map;
  }, {});
}

function canViewBank(bankId, rules, access) {
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

function getScopeText(rules) {
  if (!rules || !rules.length) return '公开题库';
  if (rules.some((rule) => rule.targetType === 'all')) return '公开题库';
  const classNames = rules
    .filter((rule) => rule.targetType === 'class')
    .map((rule) => rule.targetName)
    .filter(Boolean);
  return classNames.length ? '定向可见' : '指定可见';
}

async function getProgressMap(openid, bankIds) {
  const progressMap = {};
  if (!bankIds.length) return progressMap;

  const sessions = await db.collection('study_sessions')
    .where({ openid })
    .orderBy('updatedAt', 'desc')
    .limit(100)
    .get();

  sessions.data.forEach((session) => {
    if (!bankIds.includes(session.bankId)) return;
    if (progressMap[session.bankId]) return;
    progressMap[session.bankId] = session.progress || 0;
  });

  return progressMap;
}

async function getJoinedBankMap(openid, bankIds) {
  const joinedMap = {};
  if (!bankIds.length) return joinedMap;

  const result = await db.collection('user_banks')
    .where({ openid, status: 'active' })
    .limit(500)
    .get()
    .catch(() => ({ data: [] }));

  result.data.forEach((item) => {
    if (!bankIds.includes(item.bankId)) return;
    joinedMap[item.bankId] = item;
  });

  return joinedMap;
}
