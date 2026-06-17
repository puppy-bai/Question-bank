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
  if (action === 'overview') return getOverview(event);
  if (action === 'getQuestion') return getQuestion(event);
  if (action === 'saveQuestion') return saveQuestion(event, adminOpenid);
  if (action === 'setQuestionStatus') return setQuestionStatus(event, adminOpenid);

  throw new Error('未知题目管理操作');
};

async function getOverview(event = {}) {
  const bankId = normalizeText(event.bankId);
  const banksResult = await db.collection('question_banks')
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();

  const banks = banksResult.data
    .filter((bank) => (bank.status || 'published') !== 'deleted')
    .map((bank) => ({
    id: bank._id,
    name: bank.name,
    status: bank.status || 'published',
    questionCount: bank.questionCount || 0,
    chapterCount: bank.chapterCount || 0
  }));

  const selectedBankId = bankId || (banks[0] && banks[0].id) || '';
  const chapters = selectedBankId ? await getChapters(selectedBankId) : [];
  const questions = selectedBankId ? await getQuestionList(selectedBankId) : [];

  return {
    ok: true,
    banks,
    selectedBankId,
    chapters,
    questions
  };
}

async function getQuestion(event = {}) {
  const questionId = normalizeText(event.questionId);
  if (!questionId) {
    throw new Error('缺少题目 ID');
  }

  const found = await db.collection('questions').doc(questionId).get();
  if (!found.data) {
    throw new Error('题目不存在');
  }

  return {
    ok: true,
    question: toFullQuestion(found.data)
  };
}

async function saveQuestion(event = {}, adminOpenid) {
  const questionId = normalizeText(event.questionId);
  const bankId = normalizeText(event.bankId);
  const stem = normalizeText(event.stem);
  const type = normalizeType(event.type);
  const options = normalizeOptions(event.options, type);
  const answer = normalizeAnswer(event.answer, type);
  const analysis = normalizeText(event.analysis);
  const status = normalizeStatus(event.status || 'published');

  if (!bankId) {
    throw new Error('缺少题库 ID');
  }
  if (!stem) {
    throw new Error('请填写题干');
  }

  const bank = await getBank(bankId);
  const chapter = await resolveChapter({
    bankId,
    chapterId: normalizeText(event.chapterId),
    chapterName: normalizeText(event.chapterName),
    adminOpenid
  });
  const now = new Date();
  const data = {
    bankId,
    chapterId: chapter.id,
    chapterName: chapter.name,
    type,
    stem,
    groupStem: normalizeText(event.groupStem),
    options,
    answer,
    answerText: normalizeText(event.answerText) || answer.join(type === 'multiple' ? '、' : ''),
    analysis,
    fillBlanks: type === 'blank' ? answer : [],
    status,
    updatedBy: adminOpenid,
    updatedAt: now
  };

  if (questionId) {
    const existing = await db.collection('questions').doc(questionId).get();
    if (!existing.data) {
      throw new Error('题目不存在');
    }
    await db.collection('questions').doc(questionId).update({ data });
    await refreshBankCount(bankId);
    await writeAdminLog('save_question', adminOpenid, { questionId, bankId });
    return { ok: true, questionId };
  }

  const inserted = await db.collection('questions').add({
    data: {
      ...data,
      source: 'manual',
      createdBy: adminOpenid,
      createdAt: now
    }
  });

  await refreshBankCount(bank._id);
  await writeAdminLog('create_question', adminOpenid, { questionId: inserted._id, bankId });
  return { ok: true, questionId: inserted._id };
}

async function setQuestionStatus(event = {}, adminOpenid) {
  const questionId = normalizeText(event.questionId);
  const status = normalizeStatus(event.status);
  if (!questionId) {
    throw new Error('缺少题目 ID');
  }

  const found = await db.collection('questions').doc(questionId).get();
  if (!found.data) {
    throw new Error('题目不存在');
  }

  await db.collection('questions').doc(questionId).update({
    data: {
      status,
      updatedBy: adminOpenid,
      updatedAt: new Date()
    }
  });
  await refreshBankCount(found.data.bankId);
  await writeAdminLog('set_question_status', adminOpenid, { questionId, status });

  return { ok: true };
}

async function getBank(bankId) {
  const found = await db.collection('question_banks').doc(bankId).get();
  if (!found.data || found.data.status === 'deleted') {
    throw new Error('题库不存在');
  }
  return found.data;
}

async function getChapters(bankId) {
  const result = await db.collection('chapters')
    .where({ bankId })
    .orderBy('createdAt', 'asc')
    .limit(100)
    .get();

  return result.data.map((chapter) => ({
    id: chapter._id,
    name: chapter.name
  }));
}

async function getQuestionList(bankId) {
  const result = await db.collection('questions')
    .where({ bankId })
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();

  return result.data.map((question) => ({
    id: question._id,
    stem: question.stem,
    type: question.type,
    typeLabel: typeLabel(question.type),
    chapterName: question.chapterName || '',
    status: question.status || 'published',
    statusLabel: question.status === 'draft' ? '已下架' : '已发布'
  }));
}

async function resolveChapter({ bankId, chapterId, chapterName, adminOpenid }) {
  if (chapterId) {
    const found = await db.collection('chapters').doc(chapterId).get();
    if (!found.data || found.data.bankId !== bankId) {
      throw new Error('章节不存在');
    }
    return { id: found.data._id, name: found.data.name };
  }

  const name = chapterName || '默认章节';
  const existing = await db.collection('chapters').where({ bankId, name }).limit(1).get();
  if (existing.data.length) {
    return { id: existing.data[0]._id, name: existing.data[0].name };
  }

  const now = new Date();
  const inserted = await db.collection('chapters').add({
    data: {
      bankId,
      name,
      path: name.split('/').filter(Boolean),
      createdBy: adminOpenid,
      createdAt: now,
      updatedAt: now
    }
  });
  await refreshBankChapterCount(bankId);
  return { id: inserted._id, name };
}

async function refreshBankCount(bankId) {
  const result = await db.collection('questions').where({ bankId, status: 'published' }).count();
  await db.collection('question_banks').doc(bankId).update({
    data: {
      questionCount: result.total || 0,
      updatedAt: new Date()
    }
  });
}

async function refreshBankChapterCount(bankId) {
  const result = await db.collection('chapters').where({ bankId }).count();
  await db.collection('question_banks').doc(bankId).update({
    data: {
      chapterCount: result.total || 0,
      updatedAt: new Date()
    }
  });
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

function toFullQuestion(question) {
  return {
    id: question._id,
    bankId: question.bankId,
    chapterId: question.chapterId || '',
    chapterName: question.chapterName || '',
    type: question.type,
    stem: question.stem || '',
    groupStem: question.groupStem || '',
    options: question.options || [],
    answer: question.answer || [],
    answerText: question.answerText || (question.answer || []).join(''),
    analysis: question.analysis || '',
    status: question.status || 'published'
  };
}

function normalizeOptions(options, type) {
  if (!['single', 'multiple'].includes(type)) return [];
  if (!Array.isArray(options) || !options.length) {
    throw new Error('选择题至少需要一个选项');
  }

  return options.map((option) => ({
    key: normalizeText(option.key).toUpperCase(),
    text: normalizeText(option.text),
    images: option.images || []
  })).filter((option) => option.key && option.text);
}

function normalizeAnswer(answer, type) {
  const normalized = Array.isArray(answer)
    ? answer.map((item) => normalizeText(item)).filter(Boolean)
    : [];

  if (['single', 'multiple', 'judge', 'blank'].includes(type) && !normalized.length) {
    throw new Error('请填写答案');
  }

  if (type === 'multiple') {
    return normalized.map((item) => item.toUpperCase()).sort();
  }

  if (type === 'single') {
    return [normalized[0].toUpperCase()];
  }

  return normalized;
}

function normalizeType(type) {
  if (['single', 'multiple', 'judge', 'blank', 'short'].includes(type)) {
    return type;
  }
  throw new Error('题型不正确');
}

function normalizeStatus(status) {
  if (['published', 'draft'].includes(status)) {
    return status;
  }
  throw new Error('题目状态不正确');
}

function normalizeText(value) {
  return String(value || '').trim();
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
