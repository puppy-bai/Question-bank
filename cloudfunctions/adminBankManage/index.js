const cloud = require('wx-server-sdk');
const { assertAdmin } = require('./common/admin');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const adminOpenid = wxContext.OPENID;
  await assertAdmin(db, adminOpenid);

  const action = event.action || 'overview';
  if (action === 'overview') return getOverview();
  if (action === 'userOverview') return getUserOverview();
  if (action === 'statsOverview') return getStatsOverview();
  if (action === 'saveUserProfile') return saveUserProfile(event, adminOpenid);
  if (action === 'saveVisibility') return saveVisibility(event, adminOpenid);
  if (action === 'renameBank') return renameBank(event, adminOpenid);
  if (action === 'publishBank') return publishBank(event, adminOpenid);
  if (action === 'deleteBank') return deleteBank(event, adminOpenid);
  if (action === 'refreshCount') return refreshBankStats(event, adminOpenid);

  throw new Error('未知题库管理操作');
};

async function getOverview() {
  const [bankResult, classResult, visibilityResult] = await Promise.all([
    db.collection('question_banks').orderBy('createdAt', 'desc').limit(100).get(),
    db.collection('classes').where({ status: 'active' }).orderBy('name', 'asc').limit(100).get().catch(() => ({ data: [] })),
    db.collection('bank_visibility').limit(500).get()
  ]);

  const visibilityMap = {};
  visibilityResult.data.forEach((item) => {
    if (!visibilityMap[item.bankId]) visibilityMap[item.bankId] = [];
    visibilityMap[item.bankId].push(item);
  });

  const classMap = classResult.data.reduce((map, item) => {
    map[item._id] = item.name;
    return map;
  }, {});

  const visibleBanks = bankResult.data.filter((bank) => (bank.status || 'published') !== 'deleted');
  const banks = await Promise.all(visibleBanks.map(async (bank) => {
    const rules = visibilityMap[bank._id] || [];
    const classIds = rules
      .filter((rule) => rule.targetType === 'class')
      .map((rule) => rule.targetId)
      .filter(Boolean);
    const isAll = !rules.length || rules.some((rule) => rule.targetType === 'all');
    const stats = await getBankStats(bank._id);

    return {
      id: bank._id,
      name: bank.name,
      status: bank.status || 'published',
      questionCount: stats.publishedQuestionCount,
      totalQuestionCount: stats.totalQuestionCount,
      expectedQuestionCount: bank.expectedQuestionCount || bank.questionCount || stats.totalQuestionCount || 0,
      chapterCount: stats.chapterCount,
      visibilityMode: isAll ? 'all' : 'classes',
      classIds,
      scopeText: isAll
        ? '公开可见'
        : classIds.map((classId) => classMap[classId]).filter(Boolean).join('、')
    };
  }));

  return {
    ok: true,
    banks,
    classes: classResult.data.map((item) => ({
      id: item._id,
      name: item.name,
      grade: item.grade || ''
    }))
  };
}

async function getStatsOverview() {
  const [bankResult, questionCountResult, attemptsResult, wrongResult, favoriteResult, sessionResult] = await Promise.all([
    db.collection('question_banks').orderBy('createdAt', 'desc').limit(100).get(),
    db.collection('questions').where({ status: 'published' }).count().catch(() => ({ total: 0 })),
    db.collection('attempts').orderBy('createdAt', 'desc').limit(1000).get().catch(() => ({ data: [] })),
    db.collection('wrong_questions').where({ mastered: false }).limit(1000).get().catch(() => ({ data: [] })),
    db.collection('favorites').limit(1000).get().catch(() => ({ data: [] })),
    db.collection('study_sessions').orderBy('updatedAt', 'desc').limit(1000).get().catch(() => ({ data: [] }))
  ]);

  const banks = bankResult.data.filter((bank) => (bank.status || 'published') !== 'deleted');
  const bankMap = banks.reduce((map, bank) => {
    map[bank._id] = bank;
    return map;
  }, {});
  const attempts = attemptsResult.data;
  const correctAttempts = attempts.filter((item) => item.correct).length;
  const bankStatsMap = {};
  attempts.forEach((attempt) => {
    const bankId = attempt.bankId || '';
    if (!bankId) return;
    if (!bankStatsMap[bankId]) {
      bankStatsMap[bankId] = {
        bankId,
        name: bankMap[bankId] ? bankMap[bankId].name : '未知题库',
        attemptCount: 0,
        correctCount: 0,
        wrongCount: 0,
        userSet: new Set()
      };
    }
    const stat = bankStatsMap[bankId];
    stat.attemptCount += 1;
    if (attempt.correct) {
      stat.correctCount += 1;
    } else {
      stat.wrongCount += 1;
    }
    if (attempt.openid) stat.userSet.add(attempt.openid);
  });

  banks.forEach((bank) => {
    if (!bankStatsMap[bank._id]) {
      bankStatsMap[bank._id] = {
        bankId: bank._id,
        name: bank.name,
        attemptCount: 0,
        correctCount: 0,
        wrongCount: 0,
        userSet: new Set()
      };
    }
  });

  const bankStats = Object.values(bankStatsMap)
    .map((item) => ({
      bankId: item.bankId,
      name: item.name,
      attemptCount: item.attemptCount,
      correctRate: item.attemptCount ? Math.round(item.correctCount / item.attemptCount * 100) : 0,
      wrongCount: item.wrongCount,
      userCount: item.userSet.size
    }))
    .sort((a, b) => b.attemptCount - a.attemptCount)
    .slice(0, 20);

  const typeStats = buildTypeStats(attempts);
  const topWrongQuestions = buildTopWrongQuestions(wrongResult.data, bankMap);
  const recentAttempts = attempts.slice(0, 30).map((attempt) => ({
    id: attempt._id,
    bankName: bankMap[attempt.bankId] ? bankMap[attempt.bankId].name : '未知题库',
    openid: attempt.openid || '',
    questionId: attempt.questionId || '',
    correct: !!attempt.correct,
    type: attempt.type || '',
    duration: Math.max(Number(attempt.duration) || 0, 0),
    createdAt: attempt.createdAt || null
  }));

  return {
    ok: true,
    summary: {
      bankCount: banks.length,
      questionCount: questionCountResult.total || 0,
      attemptCount: attempts.length,
      correctRate: attempts.length ? Math.round(correctAttempts / attempts.length * 100) : 0,
      activeUserCount: new Set(attempts.map((item) => item.openid).filter(Boolean)).size,
      activeBankCount: bankStats.filter((item) => item.attemptCount > 0).length,
      wrongCount: wrongResult.data.length,
      favoriteCount: favoriteResult.data.length,
      sessionCount: sessionResult.data.length
    },
    bankStats,
    typeStats,
    topWrongQuestions,
    recentAttempts
  };
}

async function getUserOverview() {
  const [userResult, attemptsResult, wrongResult, favoriteResult, sessionResult] = await Promise.all([
    db.collection('users').orderBy('updatedAt', 'desc').limit(200).get(),
    db.collection('attempts').orderBy('createdAt', 'desc').limit(1000).get().catch(() => ({ data: [] })),
    db.collection('wrong_questions').where({ mastered: false }).limit(1000).get().catch(() => ({ data: [] })),
    db.collection('favorites').limit(1000).get().catch(() => ({ data: [] })),
    db.collection('study_sessions').orderBy('updatedAt', 'desc').limit(1000).get().catch(() => ({ data: [] }))
  ]);

  const attemptMap = groupAttempts(attemptsResult.data);
  const wrongMap = groupCount(wrongResult.data, 'openid');
  const favoriteMap = groupCount(favoriteResult.data, 'openid');
  const sessionMap = groupLatestSession(sessionResult.data);
  const users = userResult.data.map((user) => {
    const attempts = attemptMap[user.openid] || { total: 0, correct: 0 };
    const latestSession = sessionMap[user.openid] || {};
    return {
      id: user._id,
      openid: user.openid,
      name: user.name || '',
      role: user.role || 'user',
      attemptCount: attempts.total,
      correctRate: attempts.total ? Math.round(attempts.correct / attempts.total * 100) : 0,
      wrongCount: wrongMap[user.openid] || 0,
      favoriteCount: favoriteMap[user.openid] || 0,
      lastBankId: latestSession.bankId || '',
      lastQuestionId: latestSession.lastQuestionId || '',
      lastActiveAt: latestSession.updatedAt || user.updatedAt || user.createdAt || null,
      createdAt: user.createdAt || null
    };
  });
  const totalAttempts = attemptsResult.data.length;
  const correctAttempts = attemptsResult.data.filter((item) => item.correct).length;

  return {
    ok: true,
    summary: {
      userCount: users.length,
      adminCount: users.filter((user) => user.role === 'admin').length,
      activeUserCount: users.filter((user) => user.attemptCount > 0).length,
      attemptCount: totalAttempts,
      avgCorrectRate: totalAttempts ? Math.round(correctAttempts / totalAttempts * 100) : 0,
      wrongCount: wrongResult.data.length,
      favoriteCount: favoriteResult.data.length
    },
    users
  };
}

function buildTypeStats(attempts) {
  const labelMap = {
    single: '单选题',
    multiple: '多选题',
    judge: '判断题',
    blank: '填空题',
    short: '简答题'
  };
  const statsMap = {};
  attempts.forEach((attempt) => {
    const type = attempt.type || 'unknown';
    if (!statsMap[type]) {
      statsMap[type] = {
        type,
        label: labelMap[type] || '其他题型',
        attemptCount: 0,
        correctCount: 0
      };
    }
    statsMap[type].attemptCount += 1;
    if (attempt.correct) statsMap[type].correctCount += 1;
  });

  return Object.values(statsMap)
    .map((item) => ({
      ...item,
      correctRate: item.attemptCount ? Math.round(item.correctCount / item.attemptCount * 100) : 0
    }))
    .sort((a, b) => b.attemptCount - a.attemptCount);
}

function buildTopWrongQuestions(wrongQuestions, bankMap) {
  const statsMap = {};
  wrongQuestions.forEach((item) => {
    const questionId = item.questionId || '';
    if (!questionId) return;
    if (!statsMap[questionId]) {
      statsMap[questionId] = {
        questionId,
        bankName: bankMap[item.bankId] ? bankMap[item.bankId].name : '未知题库',
        stem: item.stem || '',
        wrongCount: 0,
        userSet: new Set()
      };
    }
    statsMap[questionId].wrongCount += Math.max(Number(item.wrongCount) || 1, 1);
    if (item.openid) statsMap[questionId].userSet.add(item.openid);
  });

  return Object.values(statsMap)
    .map((item) => ({
      questionId: item.questionId,
      bankName: item.bankName,
      stem: item.stem,
      wrongCount: item.wrongCount,
      userCount: item.userSet.size
    }))
    .sort((a, b) => b.wrongCount - a.wrongCount)
    .slice(0, 20);
}

async function saveUserProfile(event, adminOpenid) {
  const openid = normalizeText(event.openid);
  const name = normalizeText(event.name);
  const role = ['user', 'admin'].includes(event.role) ? event.role : 'user';

  if (!openid) {
    throw new Error('请填写用户 OpenID');
  }

  if (openid === adminOpenid && role !== 'admin') {
    throw new Error('不能取消当前登录管理员的管理员权限');
  }

  const now = new Date();
  const found = await db.collection('users').where({ openid }).limit(1).get();

  if (found.data.length) {
    await db.collection('users').doc(found.data[0]._id).update({
      data: {
        name,
        role,
        updatedBy: adminOpenid,
        updatedAt: now
      }
    });
  } else {
    await db.collection('users').add({
      data: {
        openid,
        name,
        role,
        visibleBanks: 0,
        wrongCount: 0,
        createdBy: adminOpenid,
        createdAt: now,
        updatedAt: now
      }
    });
  }

  await writeAdminLog('save_user_profile', adminOpenid, { openid, role });
  return { ok: true };
}

async function saveVisibility(event, adminOpenid) {
  const bankId = normalizeText(event.bankId);
  const mode = normalizeText(event.mode);
  const classIds = Array.isArray(event.classIds)
    ? Array.from(new Set(event.classIds.map(normalizeText).filter(Boolean)))
    : [];

  if (!bankId) {
    throw new Error('缺少题库 ID');
  }

  const bank = await getBank(bankId);
  if (bank.status !== 'published') {
    throw new Error('题库发布后才能设置可见范围');
  }

  if (!['all', 'classes'].includes(mode)) {
    throw new Error('题库展示范围不正确');
  }

  if (mode === 'classes' && !classIds.length) {
    throw new Error('请至少选择一个分组');
  }

  const classes = mode === 'classes' ? await getClassesByIds(classIds) : [];
  if (mode === 'classes' && classes.length !== classIds.length) {
    throw new Error('存在无效分组');
  }

  await db.collection('bank_visibility').where({ bankId }).remove();

  const now = new Date();
  if (mode === 'all') {
    await db.collection('bank_visibility').add({
      data: {
        bankId,
        targetType: 'all',
        targetId: '',
        targetName: '公开',
        createdBy: adminOpenid,
        createdAt: now,
        updatedAt: now
      }
    });
  } else {
    await Promise.all(classes.map((klass) => db.collection('bank_visibility').add({
      data: {
        bankId,
        targetType: 'class',
        targetId: klass._id,
        targetName: klass.name,
        createdBy: adminOpenid,
        createdAt: now,
        updatedAt: now
      }
    })));
  }

  await writeAdminLog('set_bank_visibility', adminOpenid, { bankId, mode, classIds });
  return { ok: true };
}

async function renameBank(event, adminOpenid) {
  const bankId = normalizeText(event.bankId);
  const name = normalizeText(event.name);
  if (!bankId) throw new Error('缺少题库 ID');
  if (!name) throw new Error('请填写题库名称');

  await getBank(bankId);
  await db.collection('question_banks').doc(bankId).update({
    data: {
      name,
      updatedBy: adminOpenid,
      updatedAt: new Date()
    }
  });
  await writeAdminLog('rename_bank', adminOpenid, { bankId, name });
  return { ok: true };
}

async function publishBank(event, adminOpenid) {
  const bankId = normalizeText(event.bankId);
  if (!bankId) throw new Error('缺少题库 ID');

  await getBank(bankId);
  const stats = await getBankStats(bankId);
  if (!stats.totalQuestionCount) {
    throw new Error('当前题库没有题目，不能发布');
  }

  await db.collection('question_banks').doc(bankId).update({
    data: {
      status: 'published',
      questionCount: stats.publishedQuestionCount || stats.totalQuestionCount,
      chapterCount: stats.chapterCount,
      updatedBy: adminOpenid,
      updatedAt: new Date()
    }
  });
  await writeAdminLog('publish_bank', adminOpenid, { bankId, ...stats });

  return { ok: true, ...stats };
}

async function deleteBank(event, adminOpenid) {
  const bankId = normalizeText(event.bankId);
  if (!bankId) throw new Error('缺少题库 ID');

  await getBank(bankId);
  const now = new Date();
  await Promise.all([
    db.collection('question_banks').doc(bankId).update({
      data: {
        status: 'deleted',
        deletedBy: adminOpenid,
        deletedAt: now,
        updatedAt: now
      }
    }),
    db.collection('bank_visibility').where({ bankId }).remove().catch(() => {}),
    db.collection('import_jobs').where({ bankId }).update({
      data: {
        status: 'deleted',
        updatedAt: now
      }
    }).catch(() => {})
  ]);

  await writeAdminLog('delete_bank', adminOpenid, { bankId });
  return { ok: true };
}

async function refreshBankStats(event, adminOpenid) {
  const bankId = normalizeText(event.bankId);
  if (!bankId) throw new Error('缺少题库 ID');

  await getBank(bankId);
  const stats = await getBankStats(bankId);
  await db.collection('question_banks').doc(bankId).update({
    data: {
      questionCount: stats.publishedQuestionCount,
      chapterCount: stats.chapterCount,
      updatedBy: adminOpenid,
      updatedAt: new Date()
    }
  });
  await writeAdminLog('refresh_bank_count', adminOpenid, { bankId, ...stats });
  return { ok: true, ...stats };
}

async function getBank(bankId) {
  const bank = await db.collection('question_banks').doc(bankId).get();
  if (!bank.data || bank.data.status === 'deleted') {
    throw new Error('题库不存在');
  }
  return bank.data;
}

async function getBankStats(bankId) {
  const [published, total, chapters] = await Promise.all([
    db.collection('questions').where({ bankId, status: 'published' }).count(),
    db.collection('questions').where({ bankId }).count(),
    db.collection('chapters').where({ bankId }).count()
  ]);

  return {
    publishedQuestionCount: published.total || 0,
    totalQuestionCount: total.total || 0,
    chapterCount: chapters.total || 0
  };
}

async function getClassesByIds(classIds) {
  const classes = [];
  for (const classId of classIds) {
    const found = await db.collection('classes').doc(classId).get();
    if (!found.data || found.data.status !== 'active') {
      throw new Error('分组不存在');
    }
    classes.push(found.data);
  }
  return classes;
}

async function writeAdminLog(action, openid, detail) {
  await db.collection('admin_logs').add({
    data: {
      action,
      openid,
      detail,
      createdAt: new Date()
    }
  });
}

function normalizeText(value) {
  return String(value || '').trim();
}

function groupAttempts(attempts) {
  return attempts.reduce((map, attempt) => {
    if (!attempt.openid) return map;
    if (!map[attempt.openid]) {
      map[attempt.openid] = { total: 0, correct: 0 };
    }
    map[attempt.openid].total += 1;
    if (attempt.correct) {
      map[attempt.openid].correct += 1;
    }
    return map;
  }, {});
}

function groupCount(items, key) {
  return items.reduce((map, item) => {
    if (!item[key]) return map;
    map[item[key]] = (map[item[key]] || 0) + 1;
    return map;
  }, {});
}

function groupLatestSession(sessions) {
  return sessions.reduce((map, session) => {
    if (!session.openid || map[session.openid]) return map;
    map[session.openid] = session;
    return map;
  }, {});
}
