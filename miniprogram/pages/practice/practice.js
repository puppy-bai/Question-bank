const MODE_ANSWER = 'answer';
const MODE_REVIEW = 'review';
const SESSION_PRACTICE = 'practice';
const SESSION_TEST = 'test';
const SESSION_EXAM = 'exam';

Page({
  data: {
    bankId: '',
    bankName: '',
    chapterIds: [],
    chapterName: '',
    sessionMode: SESSION_PRACTICE,
    sessionTitle: '章节练习',
    sessionSeed: '',
    questionLimit: 0,
    forceRandom: false,
    questionType: '',
    hideProgressCount: false,
    questions: [],
    currentIndex: 0,
    total: 0,
    loading: false,
    loadingText: '',
    backgroundLoading: false,
    allLoaded: false,
    nextOffset: 0,
    submitting: false,
    showAnalysis: false,
    selectedMap: {},
    textAnswer: '',
    submitResult: null,
    startedAt: 0,
    sessionStartedAt: 0,
    question: null,
    mode: MODE_ANSWER,
    answeredMap: {},
    correctCount: 0,
    wrongCount: 0,
    sheetOpen: false,
    resumeAvailable: false,
    forceRestart: false,
    targetQuestionId: '',
    examConfigKey: '',
    examTemplateOverride: null,
    emptyMessage: ''
  },

  onLoad(options) {
    const bankId = options.bankId || '';
    const sessionMode = normalizeSessionMode(options.sessionMode);
    const chapterIds = parseChapterIds(options.chapterIds);
    const chapterName = decodeURIComponent(options.chapterName || '');
    const sessionSeed = options.sessionSeed || (sessionMode === SESSION_PRACTICE ? '' : String(Date.now()));
    const questionLimit = normalizeQuestionLimit(options.questionLimit, sessionMode);
    const forceRandom = options.random === '1';
    const questionType = normalizeQuestionType(options.questionType);
    const examConfigKey = options.examConfigKey || '';
    const examTemplateOverride = examConfigKey ? wx.getStorageSync(examConfigKey) : null;

    this.setData({
      bankId,
      chapterIds,
      chapterName,
      sessionMode,
      sessionTitle: sessionModeTitle(sessionMode, chapterName, { forceRandom, questionType }),
      sessionSeed,
      questionLimit,
      forceRandom,
      questionType,
      hideProgressCount: forceRandom,
      forceRestart: options.restart === '1',
      targetQuestionId: options.questionId || '',
      examConfigKey,
      examTemplateOverride,
      sessionStartedAt: Date.now()
    });
    if (options.restart === '1') {
      this.clearProgress();
    }
    this.loadToken = Date.now();
    this.loadQuestions(this.loadToken);
  },

  onUnload() {
    this.saveProgress();
  },

  async loadQuestions(loadToken = Date.now()) {
    if (!this.data.bankId) {
      wx.showToast({ title: '缺少题库 ID', icon: 'none' });
      return;
    }

    this.setData({
      loading: true,
      loadingText: '正在加载首批题目...',
      backgroundLoading: false,
      allLoaded: false,
      nextOffset: 0
    });

    try {
      const { payload, questions } = await this.fetchQuestionsPage(0);
      if (loadToken !== this.loadToken) return;
      const saved = this.data.forceRestart ? null : this.readProgress(questions);
      const total = Number(payload.total || questions.length || 0);
      const nextOffset = questions.length;
      const hasMore = !!payload.hasMore;

      this.setData({
        bankName: payload.bank ? payload.bank.name : '',
        emptyMessage: payload.emptyMessage || '',
        questions,
        total,
        nextOffset,
        allLoaded: !hasMore,
        backgroundLoading: hasMore,
        loadingText: hasMore ? `已加载 ${nextOffset}/${total} 题` : '',
        currentIndex: this.resolveInitialIndex(questions, saved),
        answeredMap: saved ? saved.answeredMap : {},
        correctCount: saved ? saved.correctCount : 0,
        wrongCount: saved ? saved.wrongCount : 0,
        sessionStartedAt: saved ? saved.sessionStartedAt : Date.now(),
        resumeAvailable: !!saved
      });
      if (this.data.targetQuestionId && !this.data.questions.find((item) => item.id === this.data.targetQuestionId)) {
        await this.ensureQuestionIdLoaded(this.data.targetQuestionId);
        this.setData({
          currentIndex: this.resolveInitialIndex(this.data.questions, saved)
        });
      }
      this.setCurrentQuestion(this.data.currentIndex);
      if (hasMore) {
        this.loadRemainingQuestions(loadToken);
      }
    } catch (error) {
      console.error(error);
      wx.showToast({ title: error.message || '题目加载失败', icon: 'none' });
    } finally {
      this.setData({
        loading: false,
        loadingText: this.data.backgroundLoading ? this.data.loadingText : '',
        forceRestart: false
      });
    }
  },

  async fetchQuestionsPage(offset) {
    const limit = this.data.sessionMode === SESSION_EXAM ? 100 : 30;
    const result = await wx.cloud.callFunction({
      name: 'getQuestions',
      data: {
        bankId: this.data.bankId,
        includeAnswer: this.data.sessionMode !== SESSION_EXAM,
        chapterIds: this.data.chapterIds,
        random: (this.data.forceRandom || this.data.sessionMode !== SESSION_PRACTICE) && !this.data.targetQuestionId,
        seed: this.data.sessionSeed,
        questionLimit: this.data.questionLimit,
        questionType: this.data.questionType,
        examMode: this.data.sessionMode === SESSION_EXAM,
        examTemplateOverride: this.data.sessionMode === SESSION_EXAM ? this.data.examTemplateOverride : null,
        limit,
        offset
      }
    });
    const payload = result.result || {};
    const questions = Array.isArray(payload.questions) ? payload.questions : [];
    return { payload, questions };
  },

  async loadRemainingQuestions(loadToken) {
    let offset = this.data.nextOffset;

    while (loadToken === this.loadToken && !this.data.allLoaded) {
      try {
        const { payload, questions } = await this.fetchQuestionsPage(offset);
        if (loadToken !== this.loadToken) return;
        if (!questions.length) {
          this.setData({ allLoaded: true, backgroundLoading: false });
          return;
        }

        const nextQuestions = this.data.questions.concat(questions);
        offset += questions.length;
        this.setData({
          questions: nextQuestions,
          nextOffset: offset,
          total: Number(payload.total || this.data.total || nextQuestions.length),
          allLoaded: !payload.hasMore,
          backgroundLoading: !!payload.hasMore,
          loadingText: payload.hasMore ? `已加载 ${offset}/${payload.total || offset} 题` : ''
        });
        this.saveProgress();
      } catch (error) {
        console.error(error);
        this.setData({ backgroundLoading: false });
        return;
      }
    }
  },

  resolveInitialIndex(questions, saved) {
    if (this.data.targetQuestionId) {
      const index = questions.findIndex((item) => item.id === this.data.targetQuestionId);
      if (index >= 0) return index;
    }
    return saved ? saved.currentIndex : 0;
  },

  async changeMode(event) {
    const mode = event.currentTarget.dataset.mode;
    if (mode === this.data.mode) return;

    this.setData({
      mode,
      sheetOpen: false,
      showAnalysis: mode === MODE_REVIEW || (
        this.data.sessionMode === SESSION_PRACTICE &&
        !!(this.data.question && this.data.answeredMap[this.data.question.id])
      ),
      submitResult: mode === MODE_REVIEW
        ? buildReviewResult(this.data.question)
        : (this.data.question && this.data.answeredMap[this.data.question.id]
          ? this.data.answeredMap[this.data.question.id].result
          : null),
      question: decorateQuestion(
        this.data.question,
        this.data.selectedMap,
        mode === MODE_REVIEW
          ? buildReviewResult(this.data.question)
          : (this.data.question && this.data.answeredMap[this.data.question.id]
            ? this.data.answeredMap[this.data.question.id].result
            : null)
      )
    });
  },

  setCurrentQuestion(index) {
    const rawQuestion = this.data.questions[index] || null;
    const answered = rawQuestion ? this.data.answeredMap[rawQuestion.id] : null;
    const selectedMap = answered ? arrayToMap(answered.answer || []) : {};
    const submitResult = answered && answered.result ? answered.result : buildReviewResult(rawQuestion);
    const question = decorateQuestion(rawQuestion, selectedMap, submitResult);

    this.setData({
      currentIndex: index,
      question,
      selectedMap,
      textAnswer: answered && answered.answer ? answered.answer.join('\n') : '',
      showAnalysis: this.data.mode === MODE_REVIEW ||
        (this.data.sessionMode !== SESSION_EXAM && !!(answered && answered.result)),
      submitResult,
      startedAt: Date.now(),
      sheetOpen: false
    });

    this.saveProgress();
  },

  selectOption(event) {
    if (this.data.showAnalysis || !this.data.question || this.data.mode === MODE_REVIEW) return;
    if (this.data.submitting) return;

    const { key } = event.currentTarget.dataset;
    const question = this.data.question;
    const selectedMap = { ...this.data.selectedMap };

    if (question.type === 'multiple') {
      selectedMap[key] = !selectedMap[key];
    } else {
      Object.keys(selectedMap).forEach((item) => {
        selectedMap[item] = false;
      });
      selectedMap[key] = true;
    }

    this.setData({
      selectedMap,
      question: decorateQuestion(question, selectedMap, this.data.submitResult)
    }, () => {
      if (this.data.sessionMode === SESSION_EXAM) {
        this.saveExamCurrentAnswer();
        return;
      }

      if (question.type !== 'multiple') {
        this.submitAnswer();
      }
    });
  },

  onTextAnswer(event) {
    this.setData({ textAnswer: event.detail.value }, () => {
      if (this.data.sessionMode === SESSION_EXAM) {
        this.saveExamCurrentAnswer();
      }
    });
  },

  async submitAnswer() {
    if (!this.data.question) return;
    if (this.data.submitting) return;

    if (this.data.sessionMode === SESSION_EXAM) {
      this.saveExamCurrentAnswer();
      if (this.data.currentIndex + 1 >= this.data.total) {
        await this.finishPractice();
      } else {
        await this.nextQuestion();
      }
      return;
    }

    if (this.data.mode === MODE_REVIEW || this.data.showAnalysis) {
      this.nextQuestion();
      return;
    }

    if (this.data.sessionMode !== SESSION_PRACTICE && this.data.answeredMap[this.data.question.id]) {
      this.nextQuestion();
      return;
    }

    const answer = this.collectAnswer();
    if (!answer.length) {
      wx.showToast({ title: '请先作答', icon: 'none' });
      return;
    }

    const duration = Math.round((Date.now() - this.data.startedAt) / 1000);
    const localSubmitResult = buildLocalSubmitResult(this.data.question, answer);
    const localPreviousAnswered = this.data.answeredMap[this.data.question.id];
    const localAnsweredMap = {
      ...this.data.answeredMap,
      [this.data.question.id]: {
        answer,
        result: localSubmitResult
      }
    };
    const localCorrectDelta = scoreDelta(localPreviousAnswered, localSubmitResult, true);
    const localWrongDelta = scoreDelta(localPreviousAnswered, localSubmitResult, false);

    this.setData({
      answeredMap: localAnsweredMap,
      correctCount: Math.max(this.data.correctCount + localCorrectDelta, 0),
      wrongCount: Math.max(this.data.wrongCount + localWrongDelta, 0),
      submitResult: localSubmitResult,
      question: decorateQuestion(this.data.question, this.data.selectedMap, localSubmitResult),
      showAnalysis: true
    });
    this.saveProgress();
    this.persistAnswer(this.data.question.id, answer, duration);
    return;

    this.setData({ submitting: true });

    try {
      const result = await wx.cloud.callFunction({
        name: 'submitAnswer',
        data: {
          questionId: this.data.question.id,
          answer,
          duration: Math.round((Date.now() - this.data.startedAt) / 1000)
        }
      });

      const submitResult = result.result || {};
      const previousAnswered = this.data.answeredMap[this.data.question.id];
      const answeredMap = {
        ...this.data.answeredMap,
        [this.data.question.id]: {
          answer,
          result: submitResult
        }
      };
      const correctDelta = scoreDelta(previousAnswered, submitResult, true);
      const wrongDelta = scoreDelta(previousAnswered, submitResult, false);
      const immediateFeedback = this.data.sessionMode !== SESSION_EXAM;

      this.setData({
        answeredMap,
        correctCount: Math.max(this.data.correctCount + correctDelta, 0),
        wrongCount: Math.max(this.data.wrongCount + wrongDelta, 0),
        submitResult: immediateFeedback ? submitResult : null,
        question: decorateQuestion(this.data.question, this.data.selectedMap, immediateFeedback ? submitResult : null),
        showAnalysis: immediateFeedback
      });
      this.saveProgress();
      if (!immediateFeedback) {
        this.nextQuestion();
      }
    } catch (error) {
      console.error(error);
      wx.showToast({ title: error.message || '提交失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async persistAnswer(questionId, answer, duration) {
    try {
      await wx.cloud.callFunction({
        name: 'submitAnswer',
        data: { questionId, answer, duration }
      });
    } catch (error) {
      console.error(error);
      wx.showToast({ title: '答题记录同步失败', icon: 'none' });
    }
  },

  async toggleFavorite() {
    if (!this.data.question || this.data.submitting) return;

    const nextFavorited = !this.data.question.favorited;
    this.setData({
      question: {
        ...this.data.question,
        favorited: nextFavorited
      },
      questions: this.data.questions.map((item) => (
        item.id === this.data.question.id ? { ...item, favorited: nextFavorited } : item
      ))
    });

    try {
      const result = await wx.cloud.callFunction({
        name: 'toggleFavorite',
        data: {
          questionId: this.data.question.id,
          favorited: nextFavorited
        }
      });
      const favorited = !!(result.result && result.result.favorited);
      this.setData({
        question: {
          ...this.data.question,
          favorited
        },
        questions: this.data.questions.map((item) => (
          item.id === this.data.question.id ? { ...item, favorited } : item
        ))
      });
      wx.showToast({ title: favorited ? '已收藏' : '已取消', icon: 'success' });
    } catch (error) {
      console.error(error);
      this.setData({
        question: {
          ...this.data.question,
          favorited: !nextFavorited
        },
        questions: this.data.questions.map((item) => (
          item.id === this.data.question.id ? { ...item, favorited: !nextFavorited } : item
        ))
      });
      wx.showToast({ title: error.message || '收藏失败', icon: 'none' });
    }
  },

  collectAnswer() {
    const question = this.data.question;
    if (question.options && question.options.length) {
      return Object.keys(this.data.selectedMap).filter((key) => this.data.selectedMap[key]);
    }

    if (question.type === 'blank') {
      return this.data.textAnswer
        .split(/[,，\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return this.data.textAnswer.trim() ? [this.data.textAnswer.trim()] : [];
  },

  async nextQuestion() {
    if (this.data.submitting) {
      wx.showToast({ title: '正在判题，请稍后', icon: 'none' });
      return;
    }

    if (this.data.sessionMode === SESSION_EXAM) {
      this.saveExamCurrentAnswer();
    }

    const next = this.data.currentIndex + 1;
    if (next >= this.data.total) {
      await this.finishPractice();
      return;
    }
    if (!this.data.questions[next]) {
      wx.showLoading({ title: '正在加载下一题...' });
      await this.ensureQuestionLoaded(next);
      wx.hideLoading();
      if (!this.data.questions[next]) {
        wx.showToast({ title: '下一题还在加载，请稍后', icon: 'none' });
        return;
      }
    }
    this.setCurrentQuestion(next);
  },

  async ensureQuestionLoaded(index) {
    while (!this.data.questions[index] && !this.data.allLoaded) {
      const offset = this.data.nextOffset;
      const { payload, questions } = await this.fetchQuestionsPage(offset);
      if (!questions.length) {
        this.setData({ allLoaded: true, backgroundLoading: false });
        return;
      }
      const nextQuestions = this.data.questions.concat(questions);
      this.setData({
        questions: nextQuestions,
        nextOffset: offset + questions.length,
        total: Number(payload.total || this.data.total || nextQuestions.length),
        allLoaded: !payload.hasMore,
        backgroundLoading: !!payload.hasMore
      });
    }
  },

  async ensureQuestionIdLoaded(questionId) {
    while (questionId && !this.data.questions.find((item) => item.id === questionId) && !this.data.allLoaded) {
      const offset = this.data.nextOffset;
      const { payload, questions } = await this.fetchQuestionsPage(offset);
      if (!questions.length) {
        this.setData({ allLoaded: true, backgroundLoading: false });
        return;
      }
      const nextQuestions = this.data.questions.concat(questions);
      this.setData({
        questions: nextQuestions,
        nextOffset: offset + questions.length,
        total: Number(payload.total || this.data.total || nextQuestions.length),
        allLoaded: !payload.hasMore,
        backgroundLoading: !!payload.hasMore,
        loadingText: payload.hasMore ? `已加载 ${offset + questions.length}/${payload.total || offset + questions.length} 题` : ''
      });
    }
  },

  async finishPractice() {
    let correctCount = this.data.correctCount;
    let wrongCount = this.data.wrongCount;

    if (this.data.sessionMode === SESSION_EXAM) {
      this.saveExamCurrentAnswer();
      const answeredCount = Object.keys(this.data.answeredMap).filter((questionId) => {
        const item = this.data.answeredMap[questionId];
        return item && item.answer && item.answer.length;
      }).length;
      const ok = await confirmModal(`确认交卷吗？已作答 ${answeredCount}/${this.data.total} 题。`);
      if (!ok) return;
      const examResult = await this.submitExamAnswers();
      if (!examResult) return;
      correctCount = examResult.correctCount;
      wrongCount = examResult.wrongCount;
    }

    const duration = Math.round((Date.now() - this.data.sessionStartedAt) / 1000);
    this.clearProgress();
    const params = [
      `bankId=${this.data.bankId}`,
      `bankName=${encodeURIComponent(this.data.bankName || '')}`,
      `total=${this.data.total}`,
      `correctCount=${correctCount}`,
      `wrongCount=${wrongCount}`,
      `duration=${duration}`,
      `sessionMode=${this.data.sessionMode}`
    ];
    if (this.data.questionLimit) {
      params.push(`questionLimit=${this.data.questionLimit}`);
    }
    if (this.data.forceRandom) {
      params.push('random=1');
      params.push(`sessionSeed=${this.data.sessionSeed || Date.now()}`);
    }
    if (this.data.questionType) {
      params.push(`questionType=${this.data.questionType}`);
    }
    if (this.data.chapterIds.length) {
      params.push(`chapterIds=${encodeURIComponent(this.data.chapterIds.join(','))}`);
    }
    if (this.data.chapterName) {
      params.push(`chapterName=${encodeURIComponent(this.data.chapterName)}`);
    }
    wx.redirectTo({
      url: `/pages/practice-result/practice-result?${params.join('&')}`
    });
  },

  previousQuestion() {
    if (this.data.submitting) {
      wx.showToast({ title: '正在判题，请稍后', icon: 'none' });
      return;
    }

    if (this.data.sessionMode === SESSION_EXAM) {
      this.saveExamCurrentAnswer();
    }

    const previous = this.data.currentIndex - 1;
    if (previous < 0) {
      wx.showToast({ title: '已经是第一题', icon: 'none' });
      return;
    }
    this.setCurrentQuestion(previous);
  },

  jumpToQuestion(event) {
    if (this.data.submitting) {
      wx.showToast({ title: '正在判题，请稍后', icon: 'none' });
      return;
    }

    if (this.data.sessionMode === SESSION_EXAM) {
      this.saveExamCurrentAnswer();
    }

    const { index } = event.currentTarget.dataset;
    this.setCurrentQuestion(Number(index));
  },

  toggleSheet() {
    this.setData({ sheetOpen: !this.data.sheetOpen });
  },

  async clearRecord() {
    const ok = await confirmModal('确定清空本题库的本地练习进度吗？云端答题记录和错题不会删除。');
    if (!ok) return;

    this.clearProgress();
    this.setData({
      answeredMap: {},
      correctCount: 0,
      wrongCount: 0,
      currentIndex: 0,
      sessionStartedAt: Date.now(),
      resumeAvailable: false
    });
    this.setCurrentQuestion(0);
  },

  readProgress(questions) {
    const saved = wx.getStorageSync(this.progressKey());
    if (!saved) return null;
    if (!questions[saved.currentIndex]) return null;
    return {
      currentIndex: Number(saved.currentIndex) || 0,
      answeredMap: saved.answeredMap || {},
      correctCount: Number(saved.correctCount) || 0,
      wrongCount: Number(saved.wrongCount) || 0,
      sessionStartedAt: Number(saved.sessionStartedAt) || Date.now()
    };
  },

  saveProgress() {
    if (!this.data.bankId || !this.data.questions.length) return;
    wx.setStorageSync(this.progressKey(), {
      mode: this.data.mode,
      sessionMode: this.data.sessionMode,
      currentIndex: this.data.currentIndex,
      answeredMap: this.data.answeredMap,
      correctCount: this.data.correctCount,
      wrongCount: this.data.wrongCount,
      sessionStartedAt: this.data.sessionStartedAt,
      updatedAt: Date.now()
    });
  },

  clearProgress() {
    wx.removeStorageSync(this.progressKey());
  },

  saveExamCurrentAnswer() {
    if (!this.data.question || this.data.sessionMode !== SESSION_EXAM) return;

    const answer = this.collectAnswer();
    const answeredMap = { ...this.data.answeredMap };
    if (answer.length) {
      answeredMap[this.data.question.id] = {
        ...(answeredMap[this.data.question.id] || {}),
        answer,
        pending: true,
        duration: Math.round((Date.now() - this.data.startedAt) / 1000)
      };
    } else {
      delete answeredMap[this.data.question.id];
    }

    this.setData({ answeredMap });
    this.saveProgress();
  },

  async submitExamAnswers() {
    const answers = this.data.questions
      .map((question) => {
        const record = this.data.answeredMap[question.id] || {};
        return {
          questionId: question.id,
          answer: record.answer || [],
          duration: record.duration || 0
        };
      })
      .filter((item) => item.answer.length);

    if (!answers.length) {
      this.setData({ correctCount: 0, wrongCount: 0 });
      return { correctCount: 0, wrongCount: 0 };
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '正在交卷...' });
    try {
      const result = await wx.cloud.callFunction({
        name: 'submitExam',
        data: { answers }
      });
      const payload = result.result || {};
      const resultMap = {};
      (payload.results || []).forEach((item) => {
        resultMap[item.questionId] = item;
      });
      const answeredMap = { ...this.data.answeredMap };
      Object.keys(answeredMap).forEach((questionId) => {
        if (!resultMap[questionId]) return;
        answeredMap[questionId] = {
          ...answeredMap[questionId],
          pending: false,
          result: resultMap[questionId]
        };
      });

      this.setData({
        answeredMap,
        correctCount: Number(payload.correctCount) || 0,
        wrongCount: Number(payload.wrongCount) || 0
      });
      return {
        correctCount: Number(payload.correctCount) || 0,
        wrongCount: Number(payload.wrongCount) || 0
      };
    } catch (error) {
      console.error(error);
      wx.showToast({ title: error.message || '交卷失败', icon: 'none' });
      return null;
    } finally {
      wx.hideLoading();
      this.setData({ submitting: false });
    }
  },

  progressKey() {
    const chapterKey = this.data.chapterIds.length ? this.data.chapterIds.join('_') : 'all';
    const seedKey = this.data.sessionMode === SESSION_PRACTICE ? '' : `_${this.data.sessionSeed}`;
    const randomKey = this.data.forceRandom ? `_random_${this.data.sessionSeed}` : '';
    const typeKey = this.data.questionType ? `_type_${this.data.questionType}` : '';
    return `practice_progress_${this.data.bankId}_${this.data.sessionMode}_${chapterKey}${seedKey}${randomKey}${typeKey}`;
  }
});

function arrayToMap(answer) {
  const map = {};
  answer.forEach((item) => {
    map[item] = true;
  });
  return map;
}

function buildReviewResult(question) {
  if (!question || !question.answer) return null;
  return {
    correct: true,
    answer: question.answer,
    answerText: question.answerText || question.answer.join(''),
    analysis: question.analysis || ''
  };
}

function buildLocalSubmitResult(question, answer) {
  const rightAnswer = Array.isArray(question && question.answer) ? question.answer : [];
  const normalizedUser = normalizeAnswerList(answer);
  const normalizedRight = normalizeAnswerList(rightAnswer);
  const correct = question.type !== 'short' &&
    normalizedUser.length === normalizedRight.length &&
    normalizedUser.every((item, index) => item === normalizedRight[index]);

  return {
    correct,
    answer: rightAnswer,
    answerText: question.answerText || rightAnswer.join(''),
    analysis: question.analysis || ''
  };
}

function normalizeAnswerList(answer) {
  return (Array.isArray(answer) ? answer : [])
    .map((item) => String(item || '').trim().replace(/\s+/g, '').toUpperCase())
    .filter(Boolean)
    .sort();
}

function decorateQuestion(question, selectedMap = {}, submitResult = null) {
  if (!question) return null;
  const answer = submitResult && submitResult.answer ? submitResult.answer : [];
  const options = buildQuestionOptions(question);
  return {
    ...question,
    options: options.map((option) => ({
      ...option,
      isSelected: !!selectedMap[option.key],
      isRight: answer.indexOf(option.key) >= 0,
      isWrongSelected: !!selectedMap[option.key] && answer.length && answer.indexOf(option.key) < 0
    }))
  };
}

function buildQuestionOptions(question) {
  if (question.type === 'judge') {
    return [
      { key: '正确', text: '正确', plain: true },
      { key: '错误', text: '错误', plain: true }
    ];
  }

  const options = Array.isArray(question.options) ? question.options : [];
  if (options.length) return options;

  return [];
}

function confirmModal(content) {
  return new Promise((resolve) => {
    wx.showModal({
      title: '提示',
      content,
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false)
    });
  });
}

function parseChapterIds(value) {
  if (!value) return [];
  return decodeURIComponent(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSessionMode(mode) {
  if ([SESSION_PRACTICE, SESSION_TEST, SESSION_EXAM].includes(mode)) return mode;
  return SESSION_PRACTICE;
}

function normalizeQuestionLimit(limit, mode) {
  const value = Number(limit) || 0;
  if (value > 0) return Math.min(Math.max(value, 1), 200);
  if (mode === SESSION_TEST) return 30;
  if (mode === SESSION_EXAM) return 100;
  return 0;
}

function normalizeQuestionType(type) {
  const value = String(type || '').trim();
  return ['single', 'multiple', 'judge', 'blank', 'short'].includes(value) ? value : '';
}

function sessionModeTitle(mode, chapterName, options = {}) {
  if (options.forceRandom) {
    return chapterName ? `随机练习 · ${chapterName}` : '随机练习';
  }
  if (options.questionType) {
    const typeLabel = {
      single: '单选专项',
      multiple: '多选专项',
      judge: '判断专项',
      blank: '填空专项',
      short: '简答专项'
    }[options.questionType] || '专项练习';
    return chapterName ? `${typeLabel} · ${chapterName}` : typeLabel;
  }
  const prefix = {
    [SESSION_PRACTICE]: '章节练习',
    [SESSION_TEST]: '随机测试',
    [SESSION_EXAM]: '模拟考试'
  }[mode] || '章节练习';
  return chapterName ? `${prefix} · ${chapterName}` : prefix;
}

function scoreDelta(previousAnswered, nextResult, correct) {
  const nextHit = !!nextResult.correct === correct ? 1 : 0;
  const previousHit = previousAnswered && previousAnswered.result && !!previousAnswered.result.correct === correct ? 1 : 0;
  return nextHit - previousHit;
}
