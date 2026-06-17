const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event = {}) => {
  const { wrongId, questionId } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const found = await findWrongQuestion({ openid, wrongId, questionId });
  if (!found) {
    throw new Error('错题不存在');
  }

  await db.collection('wrong_questions').doc(found._id).update({
    data: {
      mastered: true,
      masteredAt: new Date(),
      updatedAt: new Date()
    }
  });

  await updateWrongCount(openid);

  return {
    ok: true
  };
};

async function findWrongQuestion({ openid, wrongId, questionId }) {
  if (wrongId) {
    const result = await db.collection('wrong_questions').doc(wrongId).get();
    if (result.data && result.data.openid === openid && !result.data.mastered) {
      return result.data;
    }
    return null;
  }

  if (!questionId) {
    throw new Error('缺少错题 ID');
  }

  const result = await db.collection('wrong_questions')
    .where({ openid, questionId, mastered: false })
    .limit(1)
    .get();
  return result.data[0] || null;
}

async function updateWrongCount(openid) {
  const [userResult, wrongCount] = await Promise.all([
    db.collection('users').where({ openid }).limit(1).get(),
    db.collection('wrong_questions').where({ openid, mastered: false }).count()
  ]);

  if (userResult.data.length) {
    await db.collection('users').doc(userResult.data[0]._id).update({
      data: {
        wrongCount: wrongCount.total || 0,
        updatedAt: new Date()
      }
    });
  }
}
