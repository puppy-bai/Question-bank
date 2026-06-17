const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const RANDOM_POOL_LIMIT = 1000;

exports.main = async (event = {}) => {
  const {
    bankId,
    chapterIds = [],
    limit = 100,
    offset = 0,
    includeAnswer = false,
    random = false,
    seed = '',
    questionLimit = 0,
    questionType = '',
    questionTypes = [],
    examMode = false,
    examTemplateOverride = null
  } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!bankId) {
    throw new Error('缺少题库 ID');
  }

  const bank = await db.collection('question_banks').doc(bankId).get();
  if (!bank.data || bank.data.status === 'deleted') {
    throw new Error('题库不存在');
  }

  if (bank.data.status !== 'published') {
    throw new Error('题库还没有发布，请在题库管理中点击“发布”或“重新统计”');
  }

  const user = await getCurrentUser(openid);
  const access = await getUserAccess(user, openid);
  const rules = await getBankVisibilityRules(bankId);
  if (!canViewBank(rules, access)) {
    throw new Error('当前账号无权访问该题库');
  }
  if (!access.all && !(await hasJoinedBank(openid, bankId))) {
    throw new Error('请先把该题库加入我的题库');
  }

  const normalizedChapterIds = Array.isArray(chapterIds)
    ? chapterIds.map((item) => String(item || '').trim()).filter(Boolean)
    : String(chapterIds || '').split(',').map((item) => item.trim()).filter(Boolean);
  const normalizedTypes = normalizeQuestionTypes(questionTypes.length ? questionTypes : questionType);
  const questionQuery = {
    bankId,
    status: 'published'
  };
  if (normalizedChapterIds.length) {
    questionQuery.chapterId = _.in(normalizedChapterIds);
  }
  if (normalizedTypes.length === 1) {
    questionQuery.type = normalizedTypes[0];
  } else if (normalizedTypes.length > 1) {
    questionQuery.type = _.in(normalizedTypes);
  }

  const pageSize = Math.min(Math.max(Number(limit) || 100, 1), 100);
  const pageOffset = Math.max(Number(offset) || 0, 0);
  const questionCountResult = await db.collection('questions')
    .where(questionQuery)
    .count();
  const sourceTotal = questionCountResult.total || 0;

  const examTemplate = examMode
    ? sanitizeExamTemplate(examTemplateOverride) || await getExamTemplate(bankId)
    : null;
  const questionsResult = random
    ? await getRandomQuestionPage(questionQuery, {
      pageSize,
      pageOffset,
      seed: String(seed || Date.now()),
      questionLimit: Number(questionLimit) || pageSize,
      sourceTotal,
      examTemplate
    })
    : await getOrderedQuestionPage(questionQuery, { pageSize, pageOffset, sourceTotal });
  const favoriteIds = await getFavoriteQuestionIds(openid, questionsResult.questions.map((question) => question._id));

  return {
    ok: true,
    bank: {
      id: bank.data._id,
      name: bank.data.name,
      status: bank.data.status || 'published',
      questionCount: bank.data.questionCount || 0
    },
    questions: questionsResult.questions.map((question) => toClientQuestion(question, includeAnswer, favoriteIds)),
    total: questionsResult.total,
    offset: pageOffset,
    limit: pageSize,
    hasMore: pageOffset + questionsResult.questions.length < questionsResult.total,
    emptyMessage: questionsResult.questions.length
      ? ''
      : '这个题库下没有已发布题目，请在题库管理中重新统计；如果仍为 0，请删除后重新导入。'
  };
};

async function getOrderedQuestionPage(questionQuery, { pageSize, pageOffset, sourceTotal }) {
  const result = await baseQuestionQuery(questionQuery)
    .skip(pageOffset)
    .limit(pageSize)
    .get();

  return {
    questions: result.data,
    total: sourceTotal
  };
}

async function getRandomQuestionPage(questionQuery, { pageSize, pageOffset, seed, questionLimit, sourceTotal, examTemplate }) {
  const poolLimit = Math.min(RANDOM_POOL_LIMIT, sourceTotal || RANDOM_POOL_LIMIT);
  const pool = await fetchQuestionPool(questionQuery, poolLimit);
  const targetTotal = examTemplate
    ? Number(examTemplate.totalQuestions) || Number(questionLimit) || 100
    : Number(questionLimit) || pageSize;
  const shuffled = examTemplate
    ? selectExamQuestions(pool, seed, Math.min(Math.max(targetTotal, 1), pool.length), examTemplate)
    : stableShuffle(pool, seed);
  const total = Math.min(Math.max(targetTotal, 1), shuffled.length);
  const pageEnd = Math.min(pageOffset + pageSize, total);

  return {
    questions: shuffled.slice(pageOffset, pageEnd),
    total
  };
}

function selectExamQuestions(pool, seed, total, template) {
  const shuffled = stableShuffle(pool, seed);
  const typeQuotaMap = buildQuotaMap(template.typeRatios || {}, total);
  const chapterQuotaMap = buildChapterQuotaMap(pool, template.chapterRatios || {}, total);
  const typeCount = {};
  const chapterCount = {};
  const selected = [];
  const selectedIds = {};

  shuffled.forEach((question) => {
    if (selected.length >= total) return;
    const chapterId = question.chapterId || 'default';
    if ((typeCount[question.type] || 0) >= (typeQuotaMap[question.type] || 0)) return;
    if ((chapterCount[chapterId] || 0) >= (chapterQuotaMap[chapterId] || 0)) return;
    selectedIds[question._id] = true;
    selected.push(question);
    typeCount[question.type] = (typeCount[question.type] || 0) + 1;
    chapterCount[chapterId] = (chapterCount[chapterId] || 0) + 1;
  });

  shuffled.forEach((question) => {
    if (selected.length >= total) return;
    if (selectedIds[question._id]) return;
    if ((typeCount[question.type] || 0) >= (typeQuotaMap[question.type] || 0)) return;
    selectedIds[question._id] = true;
    selected.push(question);
    typeCount[question.type] = (typeCount[question.type] || 0) + 1;
  });

  shuffled.forEach((question) => {
    if (selected.length >= total) return;
    if (selectedIds[question._id]) return;
    selectedIds[question._id] = true;
    selected.push(question);
  });

  return stableShuffle(selected, `${seed}:paper`);
}

function buildChapterQuotaMap(pool, ratios, total) {
  const activeRatios = {};
  Object.keys(ratios || {}).forEach((chapterId) => {
    const value = Math.max(Number(ratios[chapterId]) || 0, 0);
    if (chapterId && value > 0) activeRatios[chapterId] = value;
  });
  if (Object.keys(activeRatios).length) {
    return buildQuotaMap(activeRatios, total);
  }

  const counts = {};
  pool.forEach((question) => {
    const chapterId = question.chapterId || 'default';
    counts[chapterId] = (counts[chapterId] || 0) + 1;
  });
  return buildQuotaMap(counts, total);
}

function buildQuotaMap(ratios, total) {
  const enabled = Object.keys(ratios || {})
    .map((type) => ({ type, ratio: Math.max(Number(ratios[type]) || 0, 0) }))
    .filter((item) => item.ratio > 0);
  if (!enabled.length) {
    enabled.push(
      { type: 'single', ratio: 40 },
      { type: 'multiple', ratio: 20 },
      { type: 'judge', ratio: 40 }
    );
  }

  const ratioTotal = enabled.reduce((sum, item) => sum + item.ratio, 0);
  const quotaMap = {};
  let used = 0;
  enabled.forEach((item) => {
    const quota = Math.floor(total * item.ratio / ratioTotal);
    quotaMap[item.type] = quota;
    used += quota;
  });

  let rest = total - used;
  enabled
    .map((item) => ({
      ...item,
      fraction: total * item.ratio / ratioTotal - Math.floor(total * item.ratio / ratioTotal)
    }))
    .sort((a, b) => b.fraction - a.fraction)
    .forEach((item) => {
      if (rest <= 0) return;
      quotaMap[item.type] = (quotaMap[item.type] || 0) + 1;
      rest -= 1;
    });

  return quotaMap;
}

async function fetchQuestionPool(questionQuery, poolLimit) {
  const output = [];
  let offset = 0;

  while (output.length < poolLimit) {
    const result = await baseQuestionQuery(questionQuery)
      .skip(offset)
      .limit(Math.min(100, poolLimit - output.length))
      .get();

    if (!result.data.length) break;
    output.push(...result.data);
    offset += result.data.length;
  }

  return output;
}

function baseQuestionQuery(questionQuery) {
  return db.collection('questions')
    .where(questionQuery)
    .orderBy('orderIndex', 'asc')
    .orderBy('batchIndex', 'asc')
    .orderBy('createdAt', 'asc');
}

function stableShuffle(questions, seed) {
  return questions
    .map((question) => ({
      question,
      rank: hashString(`${seed}:${question._id}`)
    }))
    .sort((a, b) => a.rank - b.rank)
    .map((item) => item.question);
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function toClientQuestion(question, includeAnswer, favoriteIds) {
  const output = {
    id: question._id,
    bankId: question.bankId,
    chapterId: question.chapterId,
    chapterName: question.chapterName,
    type: question.type,
    typeLabel: typeLabel(question.type),
    stem: question.stem,
    groupStem: question.groupStem || '',
    options: question.options || [],
    analysis: question.analysis || '',
    fillBlanks: question.fillBlanks || [],
    favorited: favoriteIds.includes(question._id)
  };

  if (includeAnswer) {
    output.answer = question.answer || [];
    output.answerText = question.answerText || (question.answer || []).join('');
  }

  return output;
}

function typeLabel(type) {
  const labels = {
    single: '单选',
    multiple: '多选',
    judge: '判断',
    blank: '填空',
    short: '简答'
  };
  return labels[type] || '题目';
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

async function getFavoriteQuestionIds(openid, questionIds) {
  if (!questionIds.length) return [];
  const result = await db.collection('favorites').where({ openid }).limit(100).get();
  return result.data
    .map((item) => item.questionId)
    .filter((questionId) => questionIds.includes(questionId));
}

async function hasJoinedBank(openid, bankId) {
  const result = await db.collection('user_banks')
    .where({ openid, bankId, status: 'active' })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }));
  return !!result.data.length;
}

async function getExamTemplate(bankId) {
  const result = await db.collection('exam_templates')
    .where({ bankId })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }));
  return result.data[0] || {
    bankId,
    totalQuestions: 100,
    typeRatios: {
      single: 40,
      multiple: 20,
      judge: 40
    },
    chapterMode: 'proportional',
    scoreMode: 'average',
    totalScore: 100
  };
}

function sanitizeExamTemplate(input) {
  if (!input || typeof input !== 'object') return null;
  return {
    totalQuestions: Math.min(Math.max(Number(input.totalQuestions) || 100, 1), 200),
    typeRatios: sanitizeRatioObject(input.typeRatios || {}),
    chapterRatios: sanitizeRatioObject(input.chapterRatios || {}),
    chapterMode: input.chapterMode === 'custom' ? 'custom' : 'proportional',
    scoreMode: 'average',
    totalScore: 100
  };
}

function sanitizeRatioObject(input) {
  const output = {};
  Object.keys(input || {}).forEach((key) => {
    const normalizedKey = String(key || '').trim();
    const value = Math.max(Number(input[key]) || 0, 0);
    if (normalizedKey && value > 0) {
      output[normalizedKey] = value;
    }
  });
  return output;
}

function normalizeQuestionTypes(value) {
  const typeMap = {
    single: 'single',
    multiple: 'multiple',
    judge: 'judge',
    blank: 'blank',
    short: 'short'
  };
  const list = Array.isArray(value)
    ? value
    : String(value || '').split(',');
  return Array.from(new Set(
    list
      .map((item) => typeMap[String(item || '').trim()])
      .filter(Boolean)
  ));
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
