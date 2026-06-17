const cloud = require('wx-server-sdk');
const { assertAdmin } = require('./common/admin');
const { parseDocxBuffer } = require('./parser/docx');
const { parseQuestionParagraphs } = require('./parser/questionParser');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const PARSER_VERSION = '2026-06-03-batched-import-v3';
const PREVIEW_SIZE = 30;

exports.main = async (event = {}) => {
  const { fileID } = event;
  const wxContext = cloud.getWXContext();

  if (!fileID) {
    return {
      ok: false,
      parserVersion: PARSER_VERSION,
      errors: [{ message: '缺少 fileID' }],
      warnings: [],
      warningCount: 0,
      questions: [],
      previewQuestions: [],
      totalQuestions: 0
    };
  }

  await assertAdmin(db, wxContext.OPENID);

  const download = await cloud.downloadFile({ fileID });
  const docx = await parseDocxBuffer(download.fileContent);
  const parsed = parseQuestionParagraphs(docx.paragraphs);
  const questions = parsed.questions.map(compactQuestion);

  return {
    ok: parsed.errors.length === 0,
    parserVersion: PARSER_VERSION,
    questions,
    previewQuestions: questions.slice(0, PREVIEW_SIZE),
    totalQuestions: questions.length,
    paragraphCount: docx.paragraphs.length,
    firstParagraphs: docx.paragraphs.slice(0, 8).map((item) => item.text || ''),
    warnings: parsed.warnings.slice(0, PREVIEW_SIZE),
    warningCount: parsed.warnings.length,
    errors: parsed.errors
  };
};

function compactQuestion(question) {
  return {
    type: question.type,
    chapter: question.chapter || '默认章节',
    stem: question.stem,
    groupStem: question.groupStem || '',
    options: (question.options || []).map((option) => ({
      key: option.key,
      text: option.text,
      images: option.images || []
    })),
    answer: question.answer || [],
    answerText: question.answerText || (question.answer || []).join(''),
    analysis: question.analysis || '',
    fillBlanks: question.fillBlanks || []
  };
}
