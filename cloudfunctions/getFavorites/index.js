const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const bankId = String(event.bankId || '').trim();
  const chapterId = String(event.chapterId || '').trim();
  const query = { openid };
  if (bankId) query.bankId = bankId;
  if (chapterId) query.chapterId = chapterId;

  const result = await db.collection('favorites')
    .where(query)
    .orderBy('updatedAt', 'desc')
    .limit(100)
    .get();

  return {
    ok: true,
    favorites: result.data.map((item) => ({
      id: item._id,
      bankId: item.bankId,
      bankName: item.bankName || '',
      chapterId: item.chapterId || '',
      chapterName: item.chapterName || '',
      questionId: item.questionId,
      stem: item.stem || '',
      type: item.type || '',
      updatedAt: item.updatedAt
    }))
  };
};
