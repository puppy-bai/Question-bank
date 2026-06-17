const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event = {}) => {
  const { questionId, answer = [], duration = 0 } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!questionId) {
    throw new Error('缺少题目 ID');
  }

  const questionResult = await db.collection('questions').doc(questionId).get();
  const question = questionResult.data;
  if (!question || question.status !== 'published') {
    throw new Error('题目不存在或未发布');
  }

  const normalizedAnswer = normalizeAnswer(answer, question.type);
  const correct = judgeAnswer(question, normalizedAnswer);
  const now = new Date();

  await db.collection('attempts').add({
    data: {
      openid,
      bankId: question.bankId,
      chapterId: question.chapterId || '',
      questionId,
      type: question.type,
      answer: normalizedAnswer,
      correct,
      duration,
      createdAt: now
    }
  });

  if (!correct) {
    await upsertWrongQuestion({ openid, question, answer: normalizedAnswer, now });
  }
  await updateWrongCount(openid);

  await touchStudySession({ openid, question, correct, now });

  return {
    ok: true,
    correct,
    answer: question.answer || [],
    answerText: question.answerText || (question.answer || []).join(''),
    analysis: question.analysis || ''
  };
};

function normalizeAnswer(answer, type) {
  if (Array.isArray(answer)) {
    if (type === 'multiple') {
      return answer.map(String).map((item) => item.trim().toUpperCase()).filter(Boolean).sort();
    }
    return answer.map(String).map((item) => item.trim()).filter(Boolean);
  }

  const text = String(answer || '').trim();
  if (!text) return [];
  if (type === 'multiple') {
    return text.replace(/[,，\s]/g, '').split('').map((item) => item.toUpperCase()).sort();
  }
  return [text];
}

function judgeAnswer(question, answer) {
  const expected = normalizeAnswer(question.answer || [], question.type);

  if (question.type === 'short') {
    return false;
  }

  if (question.type === 'blank') {
    return expected.length === answer.length && expected.every((item, index) => item === answer[index]);
  }

  if (question.type === 'judge') {
    return normalizeJudge(expected[0]) === normalizeJudge(answer[0]);
  }

  return expected.length === answer.length && expected.every((item, index) => item === answer[index]);
}

function normalizeJudge(value) {
  if (['正确', '对', '√', 'true', 'TRUE'].includes(value)) return '正确';
  if (['错误', '错', '×', 'false', 'FALSE'].includes(value)) return '错误';
  return value;
}

async function upsertWrongQuestion({ openid, question, answer, now }) {
  const found = await db.collection('wrong_questions')
    .where({ openid, questionId: question._id })
    .limit(1)
    .get();

  const data = {
    openid,
    bankId: question.bankId,
    chapterId: question.chapterId || '',
    questionId: question._id,
    stem: question.stem,
    type: question.type,
    lastAnswer: answer,
    wrongCount: 1,
    mastered: false,
    updatedAt: now
  };

  if (found.data.length) {
    await db.collection('wrong_questions').doc(found.data[0]._id).update({
      data: {
        lastAnswer: answer,
        wrongCount: (found.data[0].wrongCount || 0) + 1,
        mastered: false,
        updatedAt: now
      }
    });
    return;
  }

  await db.collection('wrong_questions').add({
    data: {
      ...data,
      createdAt: now
    }
  });
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

async function touchStudySession({ openid, question, correct, now }) {
  const [bankResult, attemptsResult, sessionResult] = await Promise.all([
    db.collection('question_banks').doc(question.bankId).get().catch(() => ({ data: null })),
    db.collection('attempts').where({ openid, bankId: question.bankId }).limit(1000).get(),
    db.collection('study_sessions').where({ openid, bankId: question.bankId }).limit(1).get()
  ]);
  const answeredIds = Array.from(new Set(
    attemptsResult.data.map((item) => item.questionId).filter(Boolean)
  ));
  const questionCount = bankResult.data ? Number(bankResult.data.questionCount || 0) : 0;
  const data = {
    openid,
    bankId: question.bankId,
    lastQuestionId: question._id,
    answeredCount: answeredIds.length,
    attemptCount: attemptsResult.data.length,
    correctCount: attemptsResult.data.filter((item) => item.correct).length,
    progress: questionCount ? Math.min(Math.round(answeredIds.length / questionCount * 100), 100) : 0,
    updatedAt: now
  };

  if (sessionResult.data.length) {
    await db.collection('study_sessions').doc(sessionResult.data[0]._id).update({ data });
    return;
  }

  await db.collection('study_sessions').add({
    data: {
      ...data,
      createdAt: now
    }
  });
}
