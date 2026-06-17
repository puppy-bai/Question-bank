const OPTION_RE = /^([A-H])[\.\、]\s*(.*)$/i;
const ANSWER_RE = /^答案\s*[:：]\s*(.+)$/;
const ANALYSIS_RE = /^解析\s*[:：]\s*(.*)$/;
const NUMBERED_QUESTION_RE = /^(\d+)[\.\、]\s*(.+)$/;
const INLINE_CHOICE_ANSWER_RE = /^[A-H](?:\s*[,，、]?\s*[A-H])*$/i;
const INLINE_ANSWER_RE = /[（(]\s*(?:[A-H](?:\s*[,，、]?\s*[A-H])*|正确|错误|对|错|√|×)\s*[）)]$/i;
const TRUE_VALUES = new Set(['正确', '对', '√', 'T', 'true', 'TRUE']);
const FALSE_VALUES = new Set(['错误', '错', '×', 'X', 'x', 'F', 'false', 'FALSE']);
const TEMPLATE_HEADING_RE = /(选择题|简答题|判断题|填空题|名词解释|案例分析|题型)格式/;

function parseQuestionParagraphs(paragraphs) {
  const context = createContext();

  paragraphs.forEach((paragraph) => {
    handleParagraph(context, normalizeParagraph(paragraph));
  });

  finalizeCurrent(context);

  return {
    questions: context.questions,
    warnings: context.warnings,
    errors: context.errors
  };
}

function createContext() {
  return {
    currentChapter: '',
    current: null,
    groupStem: '',
    sharedOptions: null,
    expectedGroupEnd: 0,
    questions: [],
    warnings: [],
    errors: []
  };
}

function normalizeParagraph(paragraph) {
  return {
    ...paragraph,
    text: (paragraph.text || '').trim()
  };
}

function handleParagraph(context, paragraph) {
  const text = paragraph.text;
  if (!text && !(paragraph.images && paragraph.images.length)) return;
  if (isTemplateHeading(text)) return;

  const chapter = parseChapter(text);
  if (chapter) {
    finalizeCurrent(context);
    context.currentChapter = chapter;
    context.groupStem = '';
    context.sharedOptions = null;
    return;
  }

  const sharedStemRange = parseSharedRange(text, '共用题干');
  if (sharedStemRange) {
    finalizeCurrent(context);
    context.groupStem = '';
    context.expectedGroupEnd = sharedStemRange.end;
    context.sharedOptions = null;
    return;
  }

  const sharedOptionRange = parseSharedRange(text, '共用备选答案');
  if (sharedOptionRange) {
    finalizeCurrent(context);
    context.sharedOptions = [];
    context.expectedGroupEnd = sharedOptionRange.end;
    context.groupStem = '';
    return;
  }

  const option = parseOption(paragraph);
  if (option) {
    if (context.sharedOptions && !context.current) {
      context.sharedOptions.push(option);
      return;
    }

    ensureCurrent(context, paragraph);
    context.current.options.push(option);
    if (option.isCorrect) {
      context.current.answer.push(option.key);
    }
    return;
  }

  const numbered = text.match(NUMBERED_QUESTION_RE);
  if (numbered && context.sharedOptions) {
    finalizeCurrent(context);
    context.current = createQuestionFromStem(paragraph, numbered[2]);
    context.current.options = cloneOptions(context.sharedOptions);
    return;
  }

  if (numbered) {
    finalizeCurrent(context);
    context.current = createQuestionFromStem(paragraph, numbered[2]);
    return;
  }

  const answer = parseAnswer(text);
  if (answer) {
    ensureCurrent(context, paragraph);
    applyAnswer(context.current, answer);
    return;
  }

  const analysis = parseAnalysis(text);
  if (analysis !== null) {
    ensureCurrent(context, paragraph);
    context.current.analysis = analysis;
    finalizeCurrent(context);
    return;
  }

  const inlineJudgement = parseInlineJudgement(text);
  if (inlineJudgement) {
    finalizeCurrent(context);
    const question = createQuestion(paragraph, inlineJudgement.stem);
    question.type = 'judge';
    question.answer = [inlineJudgement.answer];
    context.current = question;
    finalizeCurrent(context);
    return;
  }

  const fillBlank = parseFillBlank(paragraph, !!context.current);
  if (fillBlank) {
    finalizeCurrent(context);
    const question = createQuestion(paragraph, fillBlank.stem);
    question.type = 'blank';
    question.answer = fillBlank.answers;
    question.fillBlanks = fillBlank.answers;
    context.current = question;
    return;
  }

  const term = parseTermExplanation(text);
  if (term) {
    finalizeCurrent(context);
    const question = createQuestion(paragraph, `解释“${term.term}”`);
    question.type = 'short';
    question.answer = [term.answer];
    context.current = question;
    finalizeCurrent(context);
    return;
  }

  if (context.expectedGroupEnd && !context.current && !context.groupStem) {
    context.groupStem = text;
    return;
  }

  finalizeCurrent(context);
  context.current = createQuestionFromStem(paragraph, text);
}

function ensureCurrent(context, paragraph) {
  if (!context.current) {
    context.current = createQuestion(paragraph, '');
  }
}

function createQuestion(paragraph, stem) {
  return {
    type: 'unknown',
    chapter: '',
    stem,
    groupStem: '',
    options: [],
    answer: [],
    analysis: '',
    fillBlanks: [],
    sourceParagraphs: [paragraph.index],
    importWarnings: []
  };
}

function createQuestionFromStem(paragraph, stemText) {
  const inline = stripInlineAnswer(stemText);
  const question = createQuestion(paragraph, inline.stem);

  if (inline.answer.length) {
    question.answer = inline.answer;
    if (inline.answer.length === 1 && isJudgeAnswer(inline.answer[0])) {
      question.type = 'judge';
      question.answer = [normalizeJudgeAnswer(inline.answer[0])];
    }
  }

  return question;
}

function finalizeCurrent(context) {
  const question = context.current;
  if (!question) return;

  question.chapter = context.currentChapter || '默认章节';
  question.groupStem = context.groupStem || '';
  inferType(question);
  if (shouldSkipQuestion(question)) {
    context.current = null;
    return;
  }
  validateQuestion(context, question);
  question.answerText = question.answer.join('');
  context.questions.push(question);
  context.current = null;
}

function shouldSkipQuestion(question) {
  return question.type === 'short'
    && !question.answer.length
    && !question.analysis
    && !question.options.length
    && !question.fillBlanks.length;
}

function inferType(question) {
  if (question.type !== 'unknown') return;

  if (question.options.length) {
    question.type = question.answer.length > 1 ? 'multiple' : 'single';
    return;
  }

  if (question.answer.length && isJudgeAnswer(question.answer[0])) {
    question.type = 'judge';
    question.answer = [normalizeJudgeAnswer(question.answer[0])];
    return;
  }

  if (question.fillBlanks.length) {
    question.type = 'blank';
    return;
  }

  question.type = 'short';
}

function validateQuestion(context, question) {
  if (!question.stem) {
    context.errors.push(error('题干为空', question));
  }

  if ((question.type === 'single' || question.type === 'multiple') && question.options.length < 2) {
    context.errors.push(error('选择题少于两个选项', question));
  }

  if ((question.type === 'single' || question.type === 'multiple') && !question.answer.length) {
    context.errors.push(error('选择题缺少答案', question));
  }

  if (question.type === 'judge' && !question.answer.length) {
    context.errors.push(error('判断题缺少答案', question));
  }

  if (!context.currentChapter) {
    context.warnings.push(warning('未识别章节，已归入默认章节', question));
  }
}

function error(message, question) {
  return {
    message,
    sourceParagraphs: question.sourceParagraphs,
    stem: question.stem
  };
}

function warning(message, question) {
  return {
    message,
    sourceParagraphs: question.sourceParagraphs,
    stem: question.stem
  };
}

function isTemplateHeading(text) {
  return TEMPLATE_HEADING_RE.test(text);
}

function parseChapter(text) {
  if (NUMBERED_QUESTION_RE.test(text)) return '';
  if (INLINE_ANSWER_RE.test(text)) return '';
  if (!/^(第[一二三四五六七八九十百千万\d]+[章节]|[一二三四五六七八九十]+[、.]\s*第?[一二三四五六七八九十百千万\d]*[章节])/.test(text)) return '';
  if (ANSWER_RE.test(text) || ANALYSIS_RE.test(text) || OPTION_RE.test(text)) return '';
  const stripped = text.replace(/[（(][^（）()]*格式[^（）()]*[）)]/g, '').trim();
  if (!stripped || stripped.includes('格式')) return '';

  return stripped.replace(/^[一二三四五六七八九十]+[、.]\s*/, '').trim();
}

function parseSharedRange(text, keyword) {
  if (!text.includes(keyword)) return null;
  const match = text.match(/[（(]\s*(\d+)\s*[~-]\s*(\d+)\s*题/);
  if (!match) return { start: 0, end: 0 };
  return {
    start: Number(match[1]),
    end: Number(match[2])
  };
}

function parseOption(paragraph) {
  const match = paragraph.text.match(OPTION_RE);
  if (!match) return null;

  const key = match[1].toUpperCase();
  const marker = /[（(]\s*正确答案\s*[）)]/.test(match[2]);
  const text = match[2].replace(/[（(]\s*正确答案\s*[）)]/g, '').trim();
  const red = paragraph.runs.some((run) => run.color === 'FF0000' && run.text.trim());

  return {
    key,
    text,
    images: paragraph.images || [],
    isCorrect: marker || red
  };
}

function cloneOptions(options) {
  return options.map((option) => ({ ...option, isCorrect: false }));
}

function parseAnswer(text) {
  const match = text.match(ANSWER_RE);
  return match ? match[1].trim() : '';
}

function parseAnalysis(text) {
  const match = text.match(ANALYSIS_RE);
  return match ? match[1].trim() : null;
}

function applyAnswer(question, rawAnswer) {
  if (isJudgeAnswer(rawAnswer)) {
    question.answer = [normalizeJudgeAnswer(rawAnswer)];
    return;
  }

  const letters = rawAnswer.replace(/[,，\s]/g, '').toUpperCase();
  if (/^[A-H]+$/.test(letters)) {
    question.answer = letters.split('');
    return;
  }

  question.answer = [rawAnswer];
}

function parseInlineJudgement(text) {
  const match = text.match(/^(.*?)[（(]\s*(正确|错误|对|错|√|×)\s*[）)]$/);
  if (!match) return null;
  return {
    stem: match[1].trim(),
    answer: normalizeJudgeAnswer(match[2])
  };
}

function parseFillBlank(paragraph, allowParenthesesAnswers = false) {
  const underlineAnswers = paragraph.runs
    .filter((run) => run.underline && run.text.trim())
    .map((run) => run.text.trim());

  if (underlineAnswers.length) {
    let stem = paragraph.text;
    underlineAnswers.forEach((answer) => {
      stem = stem.replace(answer, '____');
    });
    return {
      stem,
      answers: underlineAnswers
    };
  }

  if (!allowParenthesesAnswers && !NUMBERED_QUESTION_RE.test(paragraph.text)) return null;

  const answers = [];
  const stem = paragraph.text.replace(/[（(]([^（）()]+)[）)]/g, (_, answer) => {
    if (/^[A-H]+$/i.test(answer) || isJudgeAnswer(answer) || answer.includes('正确答案')) {
      return _;
    }
    answers.push(answer.trim());
    return '____';
  });

  return answers.length ? { stem, answers } : null;
}

function parseTermExplanation(text) {
  if (NUMBERED_QUESTION_RE.test(text)) return null;
  if ((text.match(/[:：]/g) || []).length !== 1) return null;
  if (ANSWER_RE.test(text) || ANALYSIS_RE.test(text)) return null;

  const [term, answer] = text.split(/[:：]/);
  if (!term || !answer) return null;
  if (term.length > 20) return null;

  return {
    term: term.trim(),
    answer: answer.trim()
  };
}

function stripInlineAnswer(text) {
  const match = text.match(/^(.*?)[（(]\s*([^（）()]+)\s*[）)]$/);
  if (!match) {
    return { stem: text, answer: [] };
  }

  const rawAnswer = match[2].trim();
  if (isJudgeAnswer(rawAnswer)) {
    return {
      stem: match[1].trim(),
      answer: [normalizeJudgeAnswer(rawAnswer)]
    };
  }

  if (!INLINE_CHOICE_ANSWER_RE.test(rawAnswer)) {
    return { stem: text, answer: [] };
  }

  return {
    stem: match[1].trim(),
    answer: rawAnswer.replace(/[,，、\s]/g, '').toUpperCase().split('')
  };
}

function isJudgeAnswer(answer) {
  return TRUE_VALUES.has(answer) || FALSE_VALUES.has(answer);
}

function normalizeJudgeAnswer(answer) {
  if (TRUE_VALUES.has(answer)) return '正确';
  if (FALSE_VALUES.has(answer)) return '错误';
  return answer;
}

module.exports = {
  parseQuestionParagraphs
};
