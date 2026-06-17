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
  if (action === 'save') return saveTemplate(event, adminOpenid);

  throw new Error('未知考试模板操作');
};

async function getOverview() {
  const [bankResult, templateResult] = await Promise.all([
    db.collection('question_banks')
      .where({ status: 'published' })
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get(),
    db.collection('exam_templates').limit(200).get().catch(() => ({ data: [] }))
  ]);

  const templateMap = {};
  templateResult.data.forEach((item) => {
    templateMap[item.bankId] = item;
  });

  const banks = await Promise.all(bankResult.data.map(async (bank) => {
    const chaptersResult = await db.collection('chapters')
      .where({ bankId: bank._id })
      .orderBy('createdAt', 'asc')
      .limit(100)
      .get()
      .catch(() => ({ data: [] }));
    return {
      id: bank._id,
      name: bank.name,
      questionCount: bank.questionCount || 0,
      chapterCount: bank.chapterCount || 0,
      chapters: chaptersResult.data.map((chapter) => ({
        id: chapter._id,
        name: chapter.name,
        questionCount: chapter.questionCount || 0
      })),
      template: templateMap[bank._id] || defaultTemplate(bank._id)
    };
  }));

  return {
    ok: true,
    banks
  };
}

async function saveTemplate(event, adminOpenid) {
  await ensureCollection('exam_templates');
  const bankId = String(event.bankId || '').trim();
  if (!bankId) throw new Error('请选择题库');

  const totalQuestions = clamp(Number(event.totalQuestions) || 100, 1, 200);
  const ratios = normalizeRatios(event.typeRatios || {});
  const chapterRatios = normalizeChapterRatios(event.chapterRatios || {});
  const now = new Date();
  const bankResult = await db.collection('question_banks').doc(bankId).get();
  const bank = bankResult.data;
  if (!bank || bank.status !== 'published') throw new Error('题库不存在或未发布');

  const data = {
    bankId,
    bankName: bank.name,
    totalQuestions,
    typeRatios: ratios,
    chapterRatios,
    chapterMode: Object.keys(chapterRatios).length ? 'custom' : 'proportional',
    scoreMode: 'average',
    totalScore: 100,
    updatedBy: adminOpenid,
    updatedAt: now
  };

  const found = await db.collection('exam_templates').where({ bankId }).limit(1).get();
  if (found.data.length) {
    await db.collection('exam_templates').doc(found.data[0]._id).update({ data });
  } else {
    await db.collection('exam_templates').add({
      data: {
        ...data,
        createdBy: adminOpenid,
        createdAt: now
      }
    });
  }

  return { ok: true, template: data };
}

function defaultTemplate(bankId) {
  return {
    bankId,
    totalQuestions: 100,
    typeRatios: {
      single: 40,
      multiple: 20,
      judge: 40
    },
    chapterRatios: {},
    chapterMode: 'proportional',
    scoreMode: 'average',
    totalScore: 100
  };
}

function normalizeChapterRatios(input) {
  const output = {};
  Object.keys(input || {}).forEach((chapterId) => {
    const key = String(chapterId || '').trim();
    const value = Math.max(Number(input[chapterId]) || 0, 0);
    if (key && value > 0) output[key] = value;
  });
  return output;
}

function normalizeRatios(input) {
  const output = {
    single: Math.max(Number(input.single) || 0, 0),
    multiple: Math.max(Number(input.multiple) || 0, 0),
    judge: Math.max(Number(input.judge) || 0, 0),
    blank: Math.max(Number(input.blank) || 0, 0),
    short: Math.max(Number(input.short) || 0, 0)
  };
  const total = Object.values(output).reduce((sum, value) => sum + value, 0);
  if (!total) {
    return { single: 40, multiple: 20, judge: 40 };
  }
  return output;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

async function ensureCollection(name) {
  if (typeof db.createCollection !== 'function') return;
  await db.createCollection(name).catch(() => {});
}
