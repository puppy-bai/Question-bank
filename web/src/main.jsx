import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BarChart3,
  BookOpen,
  Bookmark,
  CheckCircle2,
  ClipboardList,
  Database,
  FileUp,
  Home,
  Library,
  Lock,
  LogOut,
  Menu,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Shuffle,
  Star,
  Trash2,
  User,
  XCircle
} from 'lucide-react';
import { createStore, defaultExamTemplate } from './store.js';
import './styles.css';

const store = createStore();

const practiceModes = [
  { key: 'sequence', title: '顺序练习', icon: BookOpen },
  { key: 'random', title: '随机练习', icon: Shuffle },
  { key: 'special', title: '专项练习', icon: ClipboardList },
  { key: 'chapter', title: '章节练习', icon: Library },
  { key: 'exam', title: '模拟考试', icon: BarChart3 },
  { key: 'wrong', title: '答错的题', icon: XCircle },
  { key: 'favorite', title: '收藏的题', icon: Bookmark }
];

const typeLabels = {
  single: '单选',
  multiple: '多选',
  judge: '判断',
  blank: '填空',
  short: '简答'
};

function App() {
  const [snapshot, setSnapshot] = useState(store.snapshot());
  const [screen, setScreen] = useState('login');
  const [roleTab, setRoleTab] = useState('user');
  const [activeTab, setActiveTab] = useState('practice');
  const [adminTab, setAdminTab] = useState('banks');
  const [selectedMode, setSelectedMode] = useState('sequence');
  const [selectedType, setSelectedType] = useState('single');
  const [practice, setPractice] = useState(null);
  const [loginForm, setLoginForm] = useState({ name: '', phone: '', password: '' });
  const [examConfig, setExamConfig] = useState(null);
  const [query, setQuery] = useState('');

  const refresh = () => setSnapshot(store.snapshot());
  const currentUser = snapshot.currentUser;
  const joinedBanks = snapshot.banks.filter((bank) => snapshot.userBankIds.includes(bank.id));
  const publicBanks = snapshot.banks.filter((bank) => bank.status === 'published');

  function loginUser() {
    if (!loginForm.name.trim() || !loginForm.phone.trim()) {
      alert('请输入姓名和手机号');
      return;
    }
    store.loginUser(loginForm.name.trim(), loginForm.phone.trim());
    refresh();
    setScreen('app');
    setActiveTab('practice');
  }

  function loginAdmin() {
    if (!loginForm.password.trim()) {
      alert('请输入管理员密码');
      return;
    }
    if (!store.loginAdmin(loginForm.password.trim())) {
      alert('管理员密码错误，默认演示密码为 admin123');
      return;
    }
    refresh();
    setScreen('admin');
  }

  function logout() {
    store.logout();
    refresh();
    setScreen('login');
    setPractice(null);
  }

  function startBank(bank, mode = selectedMode) {
    if (mode === 'wrong') {
      const questions = store.getWrongQuestions(bank.id);
      if (!questions.length) return alert('当前题库暂无错题');
      setPractice(buildPracticeSession(bank, questions, '错题复习', false));
      return;
    }
    if (mode === 'favorite') {
      const questions = store.getFavoriteQuestions(bank.id);
      if (!questions.length) return alert('当前题库暂无收藏题');
      setPractice(buildPracticeSession(bank, questions, '收藏复习', false));
      return;
    }
    if (mode === 'chapter') {
      setActiveTab('bank-detail');
      setQuery(bank.id);
      return;
    }
    if (mode === 'exam') {
      setExamConfig({ bankId: bank.id, useCustom: false, totalQuestions: 100, typeRatios: defaultExamTemplate.typeRatios, chapterRatios: {} });
      setActiveTab('exam-config');
      return;
    }

    let questions = store.getQuestions(bank.id);
    if (mode === 'special') questions = questions.filter((item) => item.type === selectedType);
    if (mode === 'random') questions = shuffle(questions);
    if (!questions.length) return alert('当前范围暂无题目');
    setPractice(buildPracticeSession(bank, questions, mode === 'random' ? '随机练习' : mode === 'special' ? '专项练习' : '顺序练习', false));
  }

  function startChapter(bank, chapterId) {
    const chapter = bank.chapters.find((item) => item.id === chapterId);
    const questions = store.getQuestions(bank.id).filter((item) => item.chapterId === chapterId);
    if (!questions.length) return alert('该章节暂无题目');
    setPractice(buildPracticeSession(bank, questions, chapter ? chapter.name : '章节练习', false));
  }

  function startExam(config) {
    const bank = snapshot.banks.find((item) => item.id === config.bankId);
    const questions = store.buildExamPaper(config.bankId, config);
    if (!questions.length) return alert('当前配置没有可用题目');
    setPractice(buildPracticeSession(bank, questions, '模拟考试', true));
    setExamConfig(null);
  }

  if (screen === 'login') {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="brand-mark">题</div>
          <h1>题库练习平台</h1>
          <p>Web/H5 版本，保留题库练习、考试、错题收藏和管理员管理能力。</p>

          <div className="segmented">
            <button className={roleTab === 'user' ? 'active' : ''} onClick={() => setRoleTab('user')}>用户登录</button>
            <button className={roleTab === 'admin' ? 'active' : ''} onClick={() => setRoleTab('admin')}>管理员</button>
          </div>

          {roleTab === 'user' ? (
            <div className="form-stack">
              <input placeholder="姓名" value={loginForm.name} onChange={(event) => setLoginForm({ ...loginForm, name: event.target.value })} />
              <input placeholder="手机号" value={loginForm.phone} onChange={(event) => setLoginForm({ ...loginForm, phone: event.target.value })} />
              <button className="primary-btn" onClick={loginUser}>进入用户端</button>
            </div>
          ) : (
            <div className="form-stack">
              <input placeholder="管理员密码" type="password" value={loginForm.password} onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })} />
              <button className="primary-btn" onClick={loginAdmin}>进入管理端</button>
              <p className="tiny">演示密码：admin123。正式部署后请在后端环境变量中配置。</p>
            </div>
          )}
        </section>
      </main>
    );
  }

  if (practice) {
    return <PracticeScreen session={practice} store={store} refresh={refresh} onExit={() => setPractice(null)} />;
  }

  if (screen === 'admin') {
    return (
      <Shell
        title="管理后台"
        currentUser={currentUser}
        tabs={[
          { key: 'banks', label: '题库', icon: Database },
          { key: 'import', label: '导入', icon: FileUp },
          { key: 'templates', label: '考试模板', icon: Settings },
          { key: 'stats', label: '数据', icon: BarChart3 }
        ]}
        activeTab={adminTab}
        onTab={setAdminTab}
        onLogout={logout}
      >
        {adminTab === 'banks' && <AdminBanks snapshot={snapshot} store={store} refresh={refresh} />}
        {adminTab === 'import' && <AdminImport store={store} refresh={refresh} />}
        {adminTab === 'templates' && <AdminTemplates snapshot={snapshot} store={store} refresh={refresh} />}
        {adminTab === 'stats' && <AdminStats snapshot={snapshot} />}
      </Shell>
    );
  }

  return (
    <Shell
      title="题库练习"
      currentUser={currentUser}
      tabs={[
        { key: 'practice', label: '练习', icon: Home },
        { key: 'banks', label: '题库', icon: Library },
        { key: 'profile', label: '我的', icon: User }
      ]}
      activeTab={activeTab}
      onTab={(tab) => {
        setActiveTab(tab);
        setQuery('');
      }}
      onLogout={logout}
    >
      {activeTab === 'practice' && (
        <PracticeHome
          joinedBanks={joinedBanks}
          selectedMode={selectedMode}
          selectedType={selectedType}
          setSelectedMode={setSelectedMode}
          setSelectedType={setSelectedType}
          onStart={startBank}
          stats={snapshot.stats}
        />
      )}
      {activeTab === 'banks' && (
        <BankMarket banks={publicBanks} joinedIds={snapshot.userBankIds} store={store} refresh={refresh} onOpen={(bank) => {
          setQuery(bank.id);
          setActiveTab('bank-detail');
        }} />
      )}
      {activeTab === 'bank-detail' && (
        <BankDetail bank={snapshot.banks.find((item) => item.id === query)} store={store} refresh={refresh} onChapter={startChapter} onStart={startBank} />
      )}
      {activeTab === 'exam-config' && (
        <ExamConfig snapshot={snapshot} config={examConfig} setConfig={setExamConfig} onStart={startExam} onCancel={() => setActiveTab('practice')} />
      )}
      {activeTab === 'profile' && <Profile snapshot={snapshot} onLogout={logout} />}
    </Shell>
  );
}

function Shell({ title, currentUser, tabs, activeTab, onTab, onLogout, children }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="side-brand"><span>题</span><strong>{title}</strong></div>
        <nav>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return <button key={tab.key} className={activeTab === tab.key ? 'active' : ''} onClick={() => onTab(tab.key)}><Icon size={18} />{tab.label}</button>;
          })}
        </nav>
        <button className="ghost-btn side-logout" onClick={onLogout}><LogOut size={17} />退出</button>
      </aside>
      <section className="content">
        <header className="topbar">
          <div>
            <h2>{title}</h2>
            <p>{currentUser ? `${currentUser.name || '用户'} · ${currentUser.phone || currentUser.role}` : '未登录'}</p>
          </div>
          <Menu className="mobile-menu" size={22} />
        </header>
        {children}
      </section>
    </div>
  );
}

function PracticeHome({ joinedBanks, selectedMode, selectedType, setSelectedMode, setSelectedType, onStart, stats }) {
  return (
    <div className="page-stack">
      <div className="stats-grid">
        <Metric value={joinedBanks.length} label="我的题库" />
        <Metric value={stats.wrongCount} label="错题" danger />
        <Metric value={stats.favoriteCount} label="收藏" />
      </div>

      <div className="mode-grid">
        {practiceModes.map((mode, index) => {
          const Icon = mode.icon;
          return (
            <button key={mode.key} className={`mode-card ${selectedMode === mode.key ? 'active' : ''}`} onClick={() => setSelectedMode(mode.key)}>
              <span>0{index + 1}</span>
              <Icon size={24} />
              <strong>{mode.title}</strong>
            </button>
          );
        })}
      </div>

      {selectedMode === 'special' && (
        <div className="panel">
          <h3>选择专项题型</h3>
          <div className="chip-row">
            {['single', 'multiple', 'judge'].map((type) => <button key={type} className={selectedType === type ? 'chip active' : 'chip'} onClick={() => setSelectedType(type)}>{typeLabels[type]}</button>)}
          </div>
        </div>
      )}

      <BankList title="选择我的题库" banks={joinedBanks} actionText="开始" onAction={(bank) => onStart(bank)} empty="还没有加入题库，请先到题库页加入。" />
    </div>
  );
}

function BankMarket({ banks, joinedIds, store, refresh, onOpen }) {
  return (
    <div className="page-stack">
      <div className="section-title"><h3>题库</h3><p>选择需要的题库加入后即可练习。</p></div>
      <div className="bank-grid">
        {banks.map((bank) => (
          <article className="bank-card" key={bank.id}>
            <h3>{bank.name}</h3>
            <p>{bank.description}</p>
            <div className="bank-meta">{bank.chapters.length} 个章节 · {store.getQuestions(bank.id).length} 道题</div>
            <div className="card-actions">
              <button className="ghost-btn" onClick={() => onOpen(bank)}>详情</button>
              <button className="primary-btn small" disabled={joinedIds.includes(bank.id)} onClick={() => { store.joinBank(bank.id); refresh(); }}>
                {joinedIds.includes(bank.id) ? '已加入' : '加入'}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function BankDetail({ bank, store, refresh, onChapter, onStart }) {
  if (!bank) return <Empty text="请选择题库" />;
  const joined = store.snapshot().userBankIds.includes(bank.id);
  return (
    <div className="page-stack">
      <div className="hero-panel">
        <div>
          <h2>{bank.name}</h2>
          <p>{bank.description}</p>
          <div className="bank-meta">{bank.chapters.length} 个章节 · {store.getQuestions(bank.id).length} 道题</div>
        </div>
        {!joined && <button className="primary-btn" onClick={() => { store.joinBank(bank.id); refresh(); }}>加入我的题库</button>}
      </div>
      {joined && (
        <div className="quick-actions">
          <button onClick={() => onStart(bank, 'sequence')}>顺序练习</button>
          <button onClick={() => onStart(bank, 'random')}>随机练习</button>
          <button onClick={() => onStart(bank, 'exam')}>模拟考试</button>
        </div>
      )}
      <div className="panel">
        <h3>章节练习</h3>
        <div className="chapter-list">
          {bank.chapters.map((chapter) => (
            <button key={chapter.id} onClick={() => joined ? onChapter(bank, chapter.id) : alert('请先加入题库')}>
              <span>{chapter.name}</span>
              <em>{store.getQuestions(bank.id).filter((item) => item.chapterId === chapter.id).length} 题</em>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExamConfig({ snapshot, config, setConfig, onStart, onCancel }) {
  const bank = snapshot.banks.find((item) => item.id === config?.bankId);
  const current = config || {};
  if (!bank) return <Empty text="请选择题库" />;
  const update = (patch) => setConfig({ ...current, ...patch });
  return (
    <div className="page-stack">
      <div className="section-title"><h3>模拟考试</h3><p>{bank.name} · 满分 100 分，提交后统一批卷。</p></div>
      <div className="panel">
        <div className="segmented inline">
          <button className={!current.useCustom ? 'active' : ''} onClick={() => update({ useCustom: false })}>默认模板</button>
          <button className={current.useCustom ? 'active' : ''} onClick={() => update({ useCustom: true })}>自定义配比</button>
        </div>
        {current.useCustom && (
          <div className="config-grid">
            <label>总题数<input type="number" value={current.totalQuestions || 100} onChange={(event) => update({ totalQuestions: Number(event.target.value) || 100 })} /></label>
            {Object.keys(typeLabels).map((type) => (
              <label key={type}>{typeLabels[type]}比例<input type="number" value={(current.typeRatios || {})[type] || 0} onChange={(event) => update({ typeRatios: { ...(current.typeRatios || {}), [type]: Number(event.target.value) || 0 } })} /></label>
            ))}
          </div>
        )}
      </div>
      {current.useCustom && (
        <div className="panel">
          <h3>章节比例</h3>
          <div className="config-grid">
            {bank.chapters.map((chapter) => (
              <label key={chapter.id}>{chapter.name}<input type="number" value={(current.chapterRatios || {})[chapter.id] || ''} onChange={(event) => update({ chapterRatios: { ...(current.chapterRatios || {}), [chapter.id]: Number(event.target.value) || 0 } })} /></label>
            ))}
          </div>
        </div>
      )}
      <div className="button-row">
        <button className="ghost-btn" onClick={onCancel}>取消</button>
        <button className="primary-btn" onClick={() => onStart(current)}>开始考试</button>
      </div>
    </div>
  );
}

function PracticeScreen({ session, store, refresh, onExit }) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState({});
  const [textAnswer, setTextAnswer] = useState('');
  const [answers, setAnswers] = useState({});
  const [reviewMode, setReviewMode] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [examDone, setExamDone] = useState(null);
  const question = session.questions[index];
  const record = answers[question.id];
  const visibleResult = session.exam ? examDone?.results[question.id] : record?.result;
  const options = question.type === 'judge'
    ? [{ key: '正确', text: '正确', plain: true }, { key: '错误', text: '错误', plain: true }]
    : question.options;

  function collectAnswer() {
    if (options?.length) return Object.keys(selected).filter((key) => selected[key]);
    if (question.type === 'blank') return textAnswer.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean);
    return textAnswer.trim() ? [textAnswer.trim()] : [];
  }

  function choose(key) {
    if (!session.exam && visibleResult) return;
    const next = question.type === 'multiple' ? { ...selected, [key]: !selected[key] } : { [key]: true };
    setSelected(next);
    if (!session.exam && question.type !== 'multiple') submit(next);
  }

  function submit(forcedSelected = selected) {
    const answer = options?.length ? Object.keys(forcedSelected).filter((key) => forcedSelected[key]) : collectAnswer();
    if (!answer.length) return alert('请先作答');
    if (session.exam) {
      setAnswers({ ...answers, [question.id]: { answer } });
      return next();
    }
    const result = store.submitAnswer(question.id, answer);
    setAnswers({ ...answers, [question.id]: { answer, result } });
    refresh();
  }

  function next() {
    if (session.exam) {
      const answer = collectAnswer();
      if (answer.length) setAnswers((prev) => ({ ...prev, [question.id]: { answer } }));
    }
    if (index + 1 >= session.questions.length) {
      if (session.exam) setSubmitted(true);
      return;
    }
    const nextIndex = index + 1;
    const nextQuestion = session.questions[nextIndex];
    const nextRecord = answers[nextQuestion.id] || {};
    setIndex(nextIndex);
    setSelected(arrayToMap(nextRecord.answer || []));
    setTextAnswer(nextRecord.answer?.join('\n') || '');
  }

  function previous() {
    if (index <= 0) return;
    const prevIndex = index - 1;
    const prevQuestion = session.questions[prevIndex];
    const prevRecord = answers[prevQuestion.id] || {};
    setIndex(prevIndex);
    setSelected(arrayToMap(prevRecord.answer || []));
    setTextAnswer(prevRecord.answer?.join('\n') || '');
  }

  function finishExam() {
    const latest = { ...answers };
    const answer = collectAnswer();
    if (answer.length) latest[question.id] = { answer };
    const result = store.submitExam(session.questions, latest);
    setAnswers(latest);
    setExamDone(result);
    setSubmitted(false);
    refresh();
  }

  if (submitted) {
    return (
      <div className="practice-shell">
        <div className="result-card">
          <h2>确认交卷？</h2>
          <p>已作答 {Object.keys(answers).length} / {session.questions.length} 题。</p>
          <div className="button-row">
            <button className="ghost-btn" onClick={() => setSubmitted(false)}>继续检查</button>
            <button className="primary-btn" onClick={finishExam}>提交批卷</button>
          </div>
        </div>
      </div>
    );
  }

  if (examDone) {
    return <ResultScreen result={examDone} onExit={onExit} />;
  }

  return (
    <div className="practice-shell">
      <header className="practice-top">
        <div>
          <button className="ghost-btn" onClick={onExit}>返回</button>
          <h2>{session.title}</h2>
          <p>{session.bank.name} · {index + 1} / {session.questions.length}</p>
        </div>
        {!session.exam && <button className="ghost-btn" onClick={() => setReviewMode(!reviewMode)}>{reviewMode ? '答题' : '背题'}</button>}
      </header>

      <main className="question-layout">
        <section className="question-card">
          <div className="question-meta"><span>{typeLabels[question.type]}</span><em>{question.chapterName}</em></div>
          <h1>{question.stem}</h1>
          {!!options?.length && (
            <div className="option-list">
              {options.map((option) => {
                const isRight = (visibleResult?.answer || (reviewMode ? question.answer : [])).includes(option.key);
                const isWrong = selected[option.key] && visibleResult && !isRight;
                return (
                  <button key={option.key} className={`${selected[option.key] ? 'selected' : ''} ${isRight ? 'right' : ''} ${isWrong ? 'wrong' : ''}`} onClick={() => choose(option.key)}>
                    {!option.plain && <strong>{option.key}</strong>}
                    <span>{option.text}</span>
                  </button>
                );
              })}
            </div>
          )}
          {!options?.length && !visibleResult && !reviewMode && <textarea value={textAnswer} onChange={(event) => setTextAnswer(event.target.value)} placeholder="请输入答案" />}
          {(visibleResult || reviewMode) && (
            <div className={`analysis ${visibleResult?.correct === false ? 'bad' : 'ok'}`}>
              <h3>{reviewMode ? '参考答案' : visibleResult.correct ? '回答正确' : '回答错误'}</h3>
              <p>正确答案：{question.answerText || question.answer.join('')}</p>
              <p>{question.analysis || '暂无解析'}</p>
            </div>
          )}
          <div className="button-row">
            <button className="ghost-btn" onClick={previous}>上一题</button>
            {question.type === 'multiple' && !visibleResult && !reviewMode && !session.exam && <button className="primary-btn" onClick={() => submit()}>确认答案</button>}
            {!options?.length && !visibleResult && !reviewMode && !session.exam && <button className="primary-btn" onClick={() => submit()}>提交答案</button>}
            <button className="primary-btn" onClick={next}>{index + 1 >= session.questions.length ? (session.exam ? '交卷' : '完成') : '下一题'}</button>
            <button className="ghost-btn" onClick={() => { store.toggleFavorite(question.id); refresh(); }}><Star size={17} />收藏</button>
          </div>
        </section>
        <aside className="answer-sheet">
          {session.questions.map((item, itemIndex) => {
            const state = answers[item.id]?.result;
            return <button key={item.id} className={`${itemIndex === index ? 'current' : ''} ${state?.correct ? 'ok' : ''} ${state && !state.correct ? 'bad' : ''} ${session.exam && answers[item.id] ? 'done' : ''}`} onClick={() => setIndex(itemIndex)}>{itemIndex + 1}</button>;
          })}
        </aside>
      </main>
    </div>
  );
}

function ResultScreen({ result, onExit }) {
  const total = result.correctCount + result.wrongCount;
  const score = total ? Math.round(result.correctCount / total * 100) : 0;
  return (
    <div className="practice-shell">
      <div className="result-card">
        <CheckCircle2 size={42} color="#10b981" />
        <h2>考试完成</h2>
        <p>本次得分</p>
        <div className="score-number">{score}</div>
        <div className="stats-grid compact">
          <Metric value={result.correctCount} label="正确" />
          <Metric value={result.wrongCount} label="错误" danger />
        </div>
        <div className="button-row">
          <button className="primary-btn" onClick={onExit}>返回练习</button>
        </div>
      </div>
    </div>
  );
}

function AdminBanks({ snapshot, store, refresh }) {
  return (
    <div className="page-stack">
      <div className="section-title"><h3>题库管理</h3><p>发布、重命名、删除题库。</p></div>
      <div className="bank-grid">
        {snapshot.banks.map((bank) => (
          <article className="bank-card" key={bank.id}>
            <h3>{bank.name}</h3>
            <p>{bank.description}</p>
            <div className="bank-meta">{bank.status} · {bank.chapters.length} 个章节</div>
            <div className="card-actions">
              <button className="ghost-btn" onClick={() => {
                const name = prompt('题库名称', bank.name);
                if (name) { store.renameBank(bank.id, name); refresh(); }
              }}>重命名</button>
              <button className="danger-btn" onClick={() => { if (confirm('确定删除该题库吗？')) { store.deleteBank(bank.id); refresh(); } }}><Trash2 size={16} />删除</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function AdminImport({ store, refresh }) {
  const [status, setStatus] = useState('');
  function importSample() {
    store.importSampleBank();
    refresh();
    setStatus('已导入演示题库。正式版会把这里替换为 Word 模板解析接口。');
  }
  return (
    <div className="page-stack">
      <div className="section-title"><h3>题库导入</h3><p>网站版保留导入入口，后续接后端 Word 解析服务。</p></div>
      <div className="panel import-panel">
        <FileUp size={36} />
        <h3>Word 模板导入接口已预留</h3>
        <p>静态免费部署不能直接跑安全的服务器端解析。后续接 Supabase Edge Function、Cloudflare Worker 或自有服务器后，把小程序解析器迁到这里即可。</p>
        <button className="primary-btn" onClick={importSample}>导入演示题库</button>
        {status && <p className="success-text">{status}</p>}
      </div>
    </div>
  );
}

function AdminTemplates({ snapshot, store, refresh }) {
  const [bankId, setBankId] = useState(snapshot.banks[0]?.id || '');
  const [template, setTemplate] = useState(store.getExamTemplate(bankId));
  const bank = snapshot.banks.find((item) => item.id === bankId);
  function changeBank(nextId) {
    setBankId(nextId);
    setTemplate(store.getExamTemplate(nextId));
  }
  return (
    <div className="page-stack">
      <div className="section-title"><h3>考试模板</h3><p>配置用户默认模拟考试规则。</p></div>
      <div className="panel">
        <select value={bankId} onChange={(event) => changeBank(event.target.value)}>
          {snapshot.banks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <div className="config-grid">
          <label>总题数<input type="number" value={template.totalQuestions} onChange={(event) => setTemplate({ ...template, totalQuestions: Number(event.target.value) || 100 })} /></label>
          {Object.keys(typeLabels).map((type) => <label key={type}>{typeLabels[type]}比例<input type="number" value={template.typeRatios[type] || 0} onChange={(event) => setTemplate({ ...template, typeRatios: { ...template.typeRatios, [type]: Number(event.target.value) || 0 } })} /></label>)}
        </div>
      </div>
      {bank && (
        <div className="panel">
          <h3>章节比例</h3>
          <div className="config-grid">
            {bank.chapters.map((chapter) => <label key={chapter.id}>{chapter.name}<input type="number" value={template.chapterRatios[chapter.id] || ''} onChange={(event) => setTemplate({ ...template, chapterRatios: { ...template.chapterRatios, [chapter.id]: Number(event.target.value) || 0 } })} /></label>)}
          </div>
          <button className="primary-btn" onClick={() => { store.saveExamTemplate(bankId, template); refresh(); alert('模板已保存'); }}>保存模板</button>
        </div>
      )}
    </div>
  );
}

function AdminStats({ snapshot }) {
  return (
    <div className="page-stack">
      <div className="stats-grid">
        <Metric value={snapshot.banks.length} label="题库数" />
        <Metric value={snapshot.users.length} label="用户数" />
        <Metric value={snapshot.attempts.length} label="答题记录" />
      </div>
      <div className="panel">
        <h3>最近答题</h3>
        <div className="table-list">
          {snapshot.attempts.slice(-10).reverse().map((item) => <div key={item.id}><span>{item.userName}</span><span>{item.bankName}</span><strong className={item.correct ? 'ok-text' : 'bad-text'}>{item.correct ? '正确' : '错误'}</strong></div>)}
        </div>
      </div>
    </div>
  );
}

function Profile({ snapshot, onLogout }) {
  return (
    <div className="page-stack">
      <div className="hero-panel">
        <div>
          <h2>{snapshot.currentUser.name}</h2>
          <p>{snapshot.currentUser.phone}</p>
        </div>
        <button className="ghost-btn" onClick={onLogout}>退出登录</button>
      </div>
      <div className="stats-grid">
        <Metric value={snapshot.userBankIds.length} label="我的题库" />
        <Metric value={snapshot.stats.wrongCount} label="错题" danger />
        <Metric value={snapshot.stats.favoriteCount} label="收藏" />
      </div>
      <div className="panel">
        <h3>支付接口预留</h3>
        <p>后续可接入微信支付、支付宝、激活码或收款码核销。当前页面不会真实收费。</p>
        <button className="primary-btn" onClick={() => alert('支付接口已预留，后续接入收款配置。')}><Lock size={17} />查看会员方案</button>
      </div>
    </div>
  );
}

function BankList({ title, banks, actionText, onAction, empty }) {
  return (
    <div className="panel">
      <h3>{title}</h3>
      {!banks.length && <p className="muted">{empty}</p>}
      {banks.map((bank) => <div className="bank-row" key={bank.id}><div><strong>{bank.name}</strong><p>{bank.chapters.length} 个章节 · {bank.questionCount} 道题</p></div><button className="primary-btn small" onClick={() => onAction(bank)}>{actionText}</button></div>)}
    </div>
  );
}

function Metric({ value, label, danger }) {
  return <div className="metric"><strong className={danger ? 'danger' : ''}>{value}</strong><span>{label}</span></div>;
}

function Empty({ text }) {
  return <div className="panel empty-panel">{text}</div>;
}

function buildPracticeSession(bank, questions, title, exam) {
  return { bank, questions, title, exam };
}

function arrayToMap(answer) {
  const map = {};
  (answer || []).forEach((item) => { map[item] = true; });
  return map;
}

function shuffle(list) {
  return [...list].sort(() => Math.random() - 0.5);
}

createRoot(document.getElementById('root')).render(<App />);
