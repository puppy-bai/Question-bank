const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const bankId = String(event.bankId || '').trim();
  const chapterId = String(event.chapterId || '').trim();
  const query = { openid: wxContext.OPENID, mastered: false };
  if (bankId) query.bankId = bankId;
  if (chapterId) query.chapterId = chapterId;

  const result = await db.collection('wrong_questions')
    .where(query)
    .orderBy('updatedAt', 'desc')
    .limit(100)
    .get();

  return {
    ok: true,
    wrongQuestions: result.data.map((item) => ({
      id: item._id,
      bankId: item.bankId,
      questionId: item.questionId,
      stem: item.stem,
      type: item.type,
      wrongCount: item.wrongCount || 1,
      updatedAt: item.updatedAt
    }))
  };
};
