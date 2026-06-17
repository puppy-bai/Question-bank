const cloud = require('wx-server-sdk');
const { assertAdmin } = require('./common/admin');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const DEFAULT_CHAPTER = '默认章节';

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  await assertAdmin(db, openid);

  if (event.mode === 'createBank') {
    return createBank(event, openid);
  }

  if (event.mode === 'importBatch') {
    return importBatch(event, openid);
  }

  if (event.mode === 'finishImport') {
    return finishImport(event, openid);
  }

  return legacyImport(event, openid);
};

async function createBank(event, openid) {
  const {
    bankName,
    fileID = '',
    chapterNames = [],
    totalQuestions = 0,
    warningCount = 0,
    errorCount = 0
  } = event;

  if (!bankName || !bankName.trim()) {
    throw new Error('请填写题库名称');
  }

  const now = new Date();
  const chapters = normalizeChapterNames(chapterNames);
  const bank = await db.collection('question_banks').add({
    data: {
      name: bankName.trim(),
      status: 'importing',
      source: 'word',
      fileID,
      questionCount: 0,
      expectedQuestionCount: Number(totalQuestions || 0),
      chapterCount: chapters.length,
      createdBy: openid,
      createdAt: now,
      updatedAt: now
    }
  });

  const chapterIds = await ensureChapters(bank._id, chapters, now, openid);
  const importJob = await db.collection('import_jobs').add({
    data: {
      bankId: bank._id,
      bankName: bankName.trim(),
      fileID,
      status: 'importing',
      totalQuestions: Number(totalQuestions || 0),
      importedCount: 0,
      warningCount: Number(warningCount || 0),
      errorCount: Number(errorCount || 0),
      warnings: [],
      errors: [],
      createdBy: openid,
      createdAt: now,
      updatedAt: now
    }
  });

  return {
    ok: true,
    bankId: bank._id,
    importJobId: importJob._id,
    chapterIds
  };
}

async function importBatch(event, openid) {
  const {
    bankId,
    chapterIds = {},
    questions = [],
    batchIndex = 0,
    startIndex = batchIndex * 50,
    progressCount = 0
  } = event;

  if (!bankId) {
    throw new Error('缺少题库 ID');
  }
  if (!Array.isArray(questions) || !questions.length) {
    throw new Error('当前批次没有题目');
  }

  const now = new Date();
  await db.collection('questions').where({ bankId, batchIndex }).remove().catch(() => {});

  const inserted = await Promise.all(questions.map(async (question, index) => {
    const chapterName = question.chapter || DEFAULT_CHAPTER;
    const saved = await db.collection('questions').add({
      data: {
        bankId,
        chapterId: chapterIds[chapterName] || '',
        chapterName,
        type: question.type,
        stem: question.stem,
        groupStem: question.groupStem || '',
        options: stripRuntimeFlags(question.options || []),
        answer: question.answer || [],
        answerText: question.answerText || (question.answer || []).join(''),
        analysis: question.analysis || '',
        fillBlanks: question.fillBlanks || [],
        sourceParagraphs: question.sourceParagraphs || [],
        status: 'published',
        batchIndex,
        orderIndex: Number(startIndex || 0) + index,
        createdBy: openid,
        createdAt: now,
        updatedAt: now
      }
    });
    return saved._id;
  }));

  if (progressCount) {
    await db.collection('question_banks').doc(bankId).update({
      data: {
        questionCount: Number(progressCount || inserted.length),
        updatedAt: now
      }
    });
  }

  return {
    ok: true,
    bankId,
    importedCount: inserted.length
  };
}

async function finishImport(event, openid) {
  const { bankId, importJobId, questionCount = 0 } = event;

  if (!bankId) {
    throw new Error('缺少题库 ID');
  }

  await assertBankOwner(bankId, openid);

  const now = new Date();
  await db.collection('question_banks').doc(bankId).update({
    data: {
      status: 'published',
      questionCount: Number(questionCount || 0),
      updatedAt: now
    }
  });

  if (importJobId) {
    await db.collection('import_jobs').doc(importJobId).update({
      data: {
        status: 'imported',
        importedCount: Number(questionCount || 0),
        importedAt: now,
        updatedAt: now
      }
    });
  }

  await db.collection('admin_logs').add({
    data: {
      action: 'confirm_import',
      openid,
      bankId,
      questionCount: Number(questionCount || 0),
      createdAt: now
    }
  });

  return {
    ok: true,
    bankId,
    questionCount: Number(questionCount || 0)
  };
}

async function legacyImport(event, openid) {
  const { bankName, fileID = '', questions = [], warnings = [], errors = [] } = event;
  if (!Array.isArray(questions) || !questions.length) {
    throw new Error('没有可导入的题目');
  }
  if (questions.length > 50) {
    throw new Error('题目较多，请使用分批导入');
  }
  if (Array.isArray(errors) && errors.length) {
    throw new Error('存在解析错误，请修正后再导入');
  }

  const chapterNames = Array.from(new Set(questions.map((item) => item.chapter || DEFAULT_CHAPTER)));
  const created = await createBank({
    bankName,
    fileID,
    chapterNames,
    totalQuestions: questions.length,
    warningCount: warnings.length,
    errorCount: 0
  }, openid);

  await importBatch({
    bankId: created.bankId,
    chapterIds: created.chapterIds,
    questions,
    batchIndex: 0
  }, openid);

  return finishImport({
    bankId: created.bankId,
    importJobId: created.importJobId,
    questionCount: questions.length
  }, openid);
}

async function assertBankOwner(bankId, openid) {
  const result = await db.collection('question_banks').doc(bankId).get();
  if (!result.data) {
    throw new Error('题库不存在');
  }
  if (result.data.createdBy !== openid) {
    throw new Error('无权操作该题库');
  }
  return result.data;
}

async function ensureChapters(bankId, chapterNames, now, openid) {
  const chapterIds = {};

  for (const name of chapterNames) {
    const saved = await db.collection('chapters').add({
      data: {
        bankId,
        name,
        path: name.split('/').filter(Boolean),
        createdBy: openid,
        createdAt: now,
        updatedAt: now
      }
    });
    chapterIds[name] = saved._id;
  }

  return chapterIds;
}

function normalizeChapterNames(chapterNames) {
  const names = Array.isArray(chapterNames) ? chapterNames : [];
  const uniqueNames = names.map((name) => name || DEFAULT_CHAPTER);
  return Array.from(new Set(uniqueNames.length ? uniqueNames : [DEFAULT_CHAPTER]));
}

function stripRuntimeFlags(options) {
  return options.map((option) => ({
    key: option.key,
    text: option.text,
    images: option.images || []
  }));
}
