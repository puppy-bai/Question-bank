import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import JSZip from 'jszip';
import {
  BarChart3,
  BookOpen,
  Bookmark,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Database,
  Download,
  FileUp,
  Gift,
  Home,
  KeyRound,
  Library,
  Lock,
  LogOut,
  Plus,
  RotateCcw,
  Settings,
  Shuffle,
  Star,
  Trash2,
  Upload,
  User,
  Users,
  XCircle
} from 'lucide-react';
import { createStore, defaultExamTemplate, parseQuestionsFromText } from './store.js';
import { createCloudflareStore } from './store-cloudflare.js';
import './styles.css';

const useCloudflare = import.meta.env.VITE_USE_CLOUDFLARE === 'true';
const store = useCloudflare ? createCloudflareStore() : createStore();

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
  single: '单选题',
  multiple: '多选题',
  judge: '判断题',
  blank: '填空题',
  short: '简答题'
};

function getInitialScreen(currentUser, isAdminPath) {
  if (isAdminPath) return currentUser?.role === 'admin' ? 'admin' : 'admin-login';
  return currentUser?.role === 'user' ? 'app' : 'login';
}

function App() {
  const [snapshot, setSnapshot] = useState(store.snapshot());
  const isAdminPath = window.location.pathname.startsWith('/admin');
  const [screen, setScreen] = useState(() => getInitialScreen(snapshot.currentUser, isAdminPath));
  const [userAuthMode, setUserAuthMode] = useState('login');
  const [activeTab, setActiveTab] = useState('practice');
  const [adminTab, setAdminTab] = useState('banks');
  const [selectedMode, setSelectedMode] = useState('sequence');
  const [selectedType, setSelectedType] = useState('single');
  const [selectedBankId, setSelectedBankId] = useState('');
  const [practice, setPractice] = useState(null);
  const [examConfig, setExamConfig] = useState(null);
  const [loginForm, setLoginForm] = useState({ name: '', phone: '', password: '' });

  const refresh = () => setSnapshot(store.snapshot());
  const currentUser = snapshot.currentUser;
  const joinedBanks = snapshot.banks.filter((bank) => snapshot.userBankIds.includes(bank.id));
  const publishedBanks = snapshot.banks.filter((bank) => bank.status === 'published');

  useEffect(() => {
    if (!store.bootstrap) return;
    store.bootstrap()
      .then(() => refresh())
      .catch((error) => console.warn('bootstrap failed', error));
  }, []);

  async function loginUser() {
    if (!loginForm.name.trim() || !loginForm.phone.trim() || !loginForm.password.trim()) {
      alert('\u8bf7\u8f93\u5165\u59d3\u540d\u3001\u624b\u673a\u53f7\u548c\u5bc6\u7801');
      return;
    }
    try {
      await store.loginUser(loginForm.name.trim(), loginForm.phone.trim(), loginForm.password.trim());
      refresh();
      setScreen(isAdminPath ? 'admin-login' : 'app');
      setActiveTab('practice');
    } catch (error) {
      alert(error.message || '\u767b\u5f55\u5931\u8d25');
    }
  }

  async function registerUser() {
    if (!loginForm.name.trim() || !loginForm.phone.trim() || !loginForm.password.trim()) {
      alert('\u8bf7\u8f93\u5165\u59d3\u540d\u3001\u624b\u673a\u53f7\u548c\u5bc6\u7801');
      return;
    }
    try {
      await store.registerUser(loginForm.name.trim(), loginForm.phone.trim(), loginForm.password.trim());
      refresh();
      setScreen(isAdminPath ? 'admin-login' : 'app');
      setActiveTab('practice');
    } catch (error) {
      alert(error.message || '\u6ce8\u518c\u5931\u8d25');
    }
  }


  async function loginAdmin() {
    try {
      const ok = await store.loginAdmin(loginForm.password.trim());
      if (!ok) {
        alert('管理员密码错误，默认演示密码为 admin123');
        return;
      }
    } catch (error) {
      alert(error.message || '管理员登录失败');
      return;
    }
    refresh();
    setScreen('admin');
  }

  function logout() {
    store.logout();
    refresh();
    setScreen(isAdminPath ? 'admin-login' : 'login');
    setPractice(null);
  }

  async function startMode(bank, mode = selectedMode, extra = {}) {
    if (!bank) return;
    if (!store.hasAccess(bank.id)) {
      alert('该题库需要购买或使用激活码解锁');
      setActiveTab('profile');
      return;
    }
    if (!snapshot.userBankIds.includes(bank.id)) {
      const result = await store.joinBank(bank.id);
      if (!result.ok) {
        alert(result.message);
        return;
      }
      refresh();
    }

    if (mode === 'chapter') {
      setSelectedBankId(bank.id);
      setActiveTab('bank-detail');
      return;
    }
    if (mode === 'exam') {
      const template = store.getExamTemplate(bank.id);
      setExamConfig({ bankId: bank.id, useCustom: false, ...template });
      setActiveTab('exam-config');
      return;
    }

    let questions = store.getCachedQuestions ? store.getCachedQuestions(bank.id) : store.getQuestions(bank.id);
    if (store.getQuestions.constructor.name === 'AsyncFunction') questions = await store.getQuestions(bank.id);
    let title = modeTitle(mode);
    if (mode === 'random') questions = shuffle(questions);
    if (mode === 'special') questions = questions.filter((item) => item.type === selectedType);
    if (mode === 'wrong') questions = store.getWrongQuestions(bank.id, extra.chapterId || '');
    if (mode === 'favorite') questions = store.getFavoriteQuestions(bank.id, extra.chapterId || '');
    if (extra.chapterId) {
      questions = questions.filter((item) => item.chapterId === extra.chapterId);
      title = bank.chapters.find((item) => item.id === extra.chapterId)?.name || title;
    }
    if (!questions.length) {
      alert('当前范围暂无题目');
      return;
    }
    setPractice({ bank, questions, title, exam: false, randomNoNumber: mode === 'random' });
  }

  async function startExam(config) {
    const bank = snapshot.banks.find((item) => item.id === config.bankId);
    if (store.getQuestions?.constructor.name === 'AsyncFunction') await store.getQuestions(config.bankId);
    const questions = store.buildExamPaper(config.bankId, config);
    if (!questions.length) {
      alert('当前配置没有可用题目');
      return;
    }
    setPractice({ bank, questions, title: '模拟考试', exam: true, randomNoNumber: false });
    setExamConfig(null);
  }

  if (screen === 'login') {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="brand-mark">题</div>
          <h1>题库练习平台</h1>
          <p>登录后可加入题库，进行练习、考试、收藏和错题复习。</p>

          <div className="form-stack">
            <div className="segmented inline">
              <button className={userAuthMode === 'login' ? 'active' : ''} onClick={() => setUserAuthMode('login')}>登录</button>
              <button className={userAuthMode === 'register' ? 'active' : ''} onClick={() => setUserAuthMode('register')}>注册</button>
            </div>
            <input placeholder="姓名" value={loginForm.name} onChange={(event) => setLoginForm({ ...loginForm, name: event.target.value })} />
            <input placeholder="手机号" value={loginForm.phone} onChange={(event) => setLoginForm({ ...loginForm, phone: event.target.value })} />
            <input placeholder="密码（至少 6 位）" type="password" value={loginForm.password} onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })} />
            <button className="primary-btn" onClick={userAuthMode === 'login' ? loginUser : registerUser}>
              {userAuthMode === 'login' ? '登录并进入用户端' : '注册并进入用户端'}
            </button>
            <p className="tiny">{userAuthMode === 'login' ? '已注册用户使用姓名、手机号和密码登录。' : '首次使用请先注册；一个手机号对应一个独立用户。'}</p>
          </div>
        </section>
      </main>
    );
  }

  if (screen === 'admin-login') {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="brand-mark">管</div>
          <h1>管理后台</h1>
          <p>用于题库导入、题库管理、用户数据查看、授权和后台配置。</p>

          <div className="form-stack">
            <input placeholder="管理员密码" type="password" value={loginForm.password} onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })} />
            <button className="primary-btn" onClick={loginAdmin}>进入管理员后台</button>
            <p className="tiny">管理员入口已与用户端分离，请通过 /admin 访问后台。</p>
          </div>
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
          { key: 'codes', label: '激活码', icon: KeyRound },
          { key: 'users', label: '用户管理', icon: Users },
          { key: 'orders', label: '订单', icon: CreditCard },
          { key: 'backup', label: '备份', icon: Download },
          { key: 'stats', label: '数据', icon: BarChart3 }
        ]}
        activeTab={adminTab}
        onTab={setAdminTab}
        onLogout={logout}
      >
        {adminTab === 'banks' && <AdminBanks snapshot={snapshot} store={store} refresh={refresh} />}
        {adminTab === 'import' && <AdminImport store={store} refresh={refresh} />}
        {adminTab === 'templates' && <AdminTemplates snapshot={snapshot} store={store} refresh={refresh} />}
        {adminTab === 'codes' && <AdminCodes snapshot={snapshot} store={store} refresh={refresh} />}
        {adminTab === 'users' && <AdminUsers snapshot={snapshot} store={store} refresh={refresh} />}
        {adminTab === 'orders' && <AdminOrders snapshot={snapshot} store={store} refresh={refresh} />}
        {adminTab === 'backup' && <AdminBackup store={store} refresh={refresh} />}
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
        setSelectedBankId('');
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
          onStart={startMode}
          stats={snapshot.stats}
        />
      )}
      {activeTab === 'banks' && (
        <BankMarket
          banks={publishedBanks}
          joinedIds={snapshot.userBankIds}
          store={store}
          refresh={refresh}
          onOpen={(bank) => {
            setSelectedBankId(bank.id);
            setActiveTab('bank-detail');
          }}
          onProfile={() => setActiveTab('profile')}
        />
      )}
      {activeTab === 'bank-detail' && (
        <BankDetail
          bank={snapshot.banks.find((item) => item.id === selectedBankId)}
          store={store}
          refresh={refresh}
          onStart={startMode}
          onBack={() => setActiveTab('banks')}
        />
      )}
      {activeTab === 'exam-config' && (
        <ExamConfig snapshot={snapshot} config={examConfig} setConfig={setExamConfig} onStart={startExam} onCancel={() => setActiveTab('practice')} />
      )}
      {activeTab === 'profile' && <Profile snapshot={snapshot} store={store} refresh={refresh} onLogout={logout} />}
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
            return (
              <button key={tab.key} className={activeTab === tab.key ? 'active' : ''} onClick={() => onTab(tab.key)}>
                <Icon size={18} />{tab.label}
              </button>
            );
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
        <Metric value={stats.joinedBankCount} label="我的题库" />
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
        <Panel title="选择专项题型">
          <div className="chip-row">
            {['single', 'multiple', 'judge'].map((type) => (
              <button key={type} className={selectedType === type ? 'chip active' : 'chip'} onClick={() => setSelectedType(type)}>{typeLabels[type]}</button>
            ))}
          </div>
        </Panel>
      )}

      <BankList title="选择我的题库" banks={joinedBanks} actionText="开始" onAction={(bank) => onStart(bank)} empty="还没有加入题库，请先到题库页加入需要练习的题库。" />
    </div>
  );
}

function BankMarket({ banks, joinedIds, store, refresh, onOpen, onProfile }) {
  async function join(bank) {
    const result = await store.joinBank(bank.id);
    refresh();
    if (!result.ok) {
      alert(result.message);
      onProfile();
    }
  }

  return (
    <div className="page-stack">
      <div className="section-title"><h3>题库中心</h3><p>管理员发布的题库会显示在这里，用户加入后才会出现在练习页。</p></div>
      <div className="bank-grid">
        {banks.map((bank) => (
          <article className="bank-card" key={bank.id}>
            <div className="card-heading">
              <h3>{bank.name}</h3>
              <span className={bank.accessType === 'free' ? 'badge free' : 'badge paid'}>{bank.accessType === 'free' ? '免费' : `¥${bank.price}`}</span>
            </div>
            <p>{bank.description}</p>
            <div className="bank-meta">{bank.chapterCount} 个章节 · {bank.questionCount} 道题</div>
            {!bank.hasAccess && <p className="lock-note"><Lock size={15} /> 需要激活码或后续支付解锁</p>}
            <div className="card-actions">
              <button className="ghost-btn" onClick={() => onOpen(bank)}>详情</button>
              <button className="primary-btn small" disabled={joinedIds.includes(bank.id)} onClick={() => join(bank)}>
                {joinedIds.includes(bank.id) ? '已加入' : bank.hasAccess ? '加入' : '去解锁'}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function BankDetail({ bank, store, refresh, onStart, onBack }) {
  if (!bank) return <Empty text="请选择题库" />;
  const joined = store.snapshot().userBankIds.includes(bank.id);
  const questions = store.getCachedQuestions ? store.getCachedQuestions(bank.id) : store.getQuestions(bank.id);

  async function join() {
    const result = await store.joinBank(bank.id);
    refresh();
    alert(result.message);
  }

  return (
    <div className="page-stack">
      <div className="hero-panel">
        <div>
          <button className="text-btn" onClick={onBack}>返回题库中心</button>
          <h2>{bank.name}</h2>
          <p>{bank.description}</p>
          <div className="bank-meta">{bank.chapterCount} 个章节 · {bank.questionCount} 道题</div>
        </div>
        <div className="hero-actions">
          {!joined && <button className="primary-btn" onClick={join}>{bank.hasAccess ? '加入我的题库' : '解锁后加入'}</button>}
          {joined && <button className="ghost-btn" onClick={() => { store.leaveBank(bank.id); refresh(); }}>移出我的题库</button>}
        </div>
      </div>
      {joined && (
        <div className="quick-actions">
          <button onClick={() => onStart(bank, 'sequence')}>顺序练习</button>
          <button onClick={() => onStart(bank, 'random')}>随机练习</button>
          <button onClick={() => onStart(bank, 'exam')}>模拟考试</button>
        </div>
      )}
      <Panel title="章节练习">
        <div className="chapter-list">
          {bank.chapters.map((chapter) => (
            <button key={chapter.id} onClick={() => joined ? onStart(bank, 'sequence', { chapterId: chapter.id }) : alert('请先加入题库')}>
              <span>{chapter.name}</span>
              <em>{questions.filter((item) => item.chapterId === chapter.id).length} 题</em>
            </button>
          ))}
        </div>
      </Panel>
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
      <div className="section-title"><h3>模拟考试配置</h3><p>{bank.name} · 满分 100 分，提交后统一批卷。</p></div>
      <Panel>
        <div className="segmented inline">
          <button className={!current.useCustom ? 'active' : ''} onClick={() => update({ useCustom: false })}>管理员默认模板</button>
          <button className={current.useCustom ? 'active' : ''} onClick={() => update({ useCustom: true })}>自定义配比</button>
        </div>
        <div className="config-grid">
          <label>总题数<input type="number" value={current.totalQuestions || 30} onChange={(event) => update({ totalQuestions: Number(event.target.value) || 30 })} disabled={!current.useCustom} /></label>
          {['single', 'multiple', 'judge'].map((type) => (
            <label key={type}>{typeLabels[type]}占比<input type="number" value={(current.typeRatios || {})[type] || 0} disabled={!current.useCustom} onChange={(event) => update({ typeRatios: { ...(current.typeRatios || {}), [type]: Number(event.target.value) || 0 } })} /></label>
          ))}
        </div>
      </Panel>
      <Panel title="逐章节手动占比配置">
        <div className="config-grid">
          {bank.chapters.map((chapter) => (
            <label key={chapter.id}>{chapter.name}<input type="number" value={(current.chapterRatios || {})[chapter.id] || 0} disabled={!current.useCustom} onChange={(event) => update({ chapterRatios: { ...(current.chapterRatios || {}), [chapter.id]: Number(event.target.value) || 0 } })} /></label>
          ))}
        </div>
      </Panel>
      <div className="button-row">
        <button className="ghost-btn" onClick={onCancel}>取消</button>
        <button className="primary-btn" onClick={() => onStart(current)}>开始考试</button>
      </div>
    </div>
  );
}

function PracticeScreen({ session, store, refresh, onExit }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [selected, setSelected] = useState({});
  const [textAnswer, setTextAnswer] = useState('');
  const [reviewMode, setReviewMode] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [examResult, setExamResult] = useState(null);
  const question = session.questions[index];
  const record = answers[question.id];
  const result = session.exam ? examResult?.results?.[question.id] : record?.result;
  const showAnswer = reviewMode || Boolean(result);
  const options = question.type === 'judge'
    ? [{ key: '正确', text: '正确', plain: true }, { key: '错误', text: '错误', plain: true }]
    : question.options;

  function syncCurrentAnswer(answer = collectAnswer()) {
    setAnswers((prev) => ({ ...prev, [question.id]: { ...(prev[question.id] || {}), answer } }));
  }

  function collectAnswer(forcedSelected = selected) {
    if (options?.length) return Object.keys(forcedSelected).filter((key) => forcedSelected[key]);
    return textAnswer.split(/[,，、\n]/).map((item) => item.trim()).filter(Boolean);
  }

  function choose(key) {
    if (!session.exam && result) return;
    const next = question.type === 'multiple' ? { ...selected, [key]: !selected[key] } : { [key]: true };
    setSelected(next);
    const answer = collectAnswer(next);
    setAnswers((prev) => ({ ...prev, [question.id]: { ...(prev[question.id] || {}), answer } }));
    if (!session.exam && question.type !== 'multiple') submit(answer);
  }

  async function submit(answer = collectAnswer()) {
    if (!answer.length) {
      alert('请先作答');
      return;
    }
    if (session.exam) {
      syncCurrentAnswer(answer);
      return;
    }
    const nextResult = await store.submitAnswer(question.id, answer);
    setAnswers((prev) => ({ ...prev, [question.id]: { answer, result: nextResult } }));
    refresh();
  }

  function go(nextIndex) {
    syncCurrentAnswer();
    const safeIndex = Math.max(0, Math.min(nextIndex, session.questions.length - 1));
    const nextQuestion = session.questions[safeIndex];
    const nextRecord = answers[nextQuestion.id] || {};
    setIndex(safeIndex);
    setSelected(arrayToMap(nextRecord.answer || []));
    setTextAnswer((nextRecord.answer || []).join('\n'));
    setReviewMode(false);
  }

  function next() {
    if (index + 1 >= session.questions.length) {
      if (session.exam) setConfirmSubmit(true);
      else onExit();
      return;
    }
    go(index + 1);
  }

  async function finishExam() {
    const latest = { ...answers, [question.id]: { ...(answers[question.id] || {}), answer: collectAnswer() } };
    const resultValue = await store.submitExam(session.questions, latest);
    setAnswers(latest);
    setExamResult(resultValue);
    setConfirmSubmit(false);
    refresh();
  }

  if (confirmSubmit) {
    return (
      <div className="practice-shell center-shell">
        <div className="result-card">
          <h2>确认交卷？</h2>
          <p>已作答 {Object.values(answers).filter((item) => item.answer?.length).length} / {session.questions.length} 题。交卷后会统一批卷并记录错题。</p>
          <div className="button-row">
            <button className="ghost-btn" onClick={() => setConfirmSubmit(false)}>继续检查</button>
            <button className="primary-btn" onClick={finishExam}>提交批卷</button>
          </div>
        </div>
      </div>
    );
  }

  if (examResult) {
    return <ResultScreen result={examResult} onExit={onExit} />;
  }

  return (
    <div className="practice-shell">
      <header className="practice-top">
        <div>
          <button className="ghost-btn" onClick={onExit}>返回</button>
          <h2>{session.title}</h2>
          <p>{session.bank.name}{session.randomNoNumber ? '' : ` · ${index + 1} / ${session.questions.length}`}</p>
        </div>
        {!session.exam && <button className="ghost-btn" onClick={() => setReviewMode(!reviewMode)}>{reviewMode ? '答题' : '背题'}</button>}
      </header>

      <main className="question-layout">
        <section className="question-card">
          <div className="question-meta"><span>{typeLabels[question.type] || '题目'}</span><em>{question.chapterName}</em></div>
          <h1>{question.stem}</h1>
          {!!options?.length && (
            <div className="option-list">
              {options.map((option) => {
                const right = showAnswer && question.answer.includes(option.key);
                const wrong = Boolean(result) && selected[option.key] && !question.answer.includes(option.key);
                return (
                  <button key={option.key} className={`${selected[option.key] ? 'selected' : ''} ${right ? 'right' : ''} ${wrong ? 'wrong' : ''}`} onClick={() => choose(option.key)}>
                    {!option.plain && <strong>{option.key}</strong>}
                    <span>{option.text}</span>
                  </button>
                );
              })}
            </div>
          )}
          {!options?.length && !showAnswer && (
            <textarea value={textAnswer} onChange={(event) => setTextAnswer(event.target.value)} placeholder="请输入答案" />
          )}
          {showAnswer && (
            <div className={`analysis ${result?.correct === false ? 'bad' : 'ok'}`}>
              <h3>{reviewMode && !result ? '参考答案' : result?.correct ? '回答正确' : '回答错误'}</h3>
              <p>正确答案：{question.answerText || question.answer.join('、')}</p>
              <p>{question.analysis || '暂无解析'}</p>
            </div>
          )}
          <div className="button-row">
            <button className="ghost-btn" disabled={index === 0} onClick={() => go(index - 1)}>上一题</button>
            {question.type === 'multiple' && !session.exam && !result && !reviewMode && <button className="primary-btn" onClick={() => submit()}>确认答案</button>}
            {!options?.length && !session.exam && !result && !reviewMode && <button className="primary-btn" onClick={() => submit()}>提交答案</button>}
            <button className="primary-btn" onClick={next}>{index + 1 >= session.questions.length ? (session.exam ? '交卷' : '完成') : '下一题'}</button>
            <button className="ghost-btn" onClick={async () => { await store.toggleFavorite(question.id); refresh(); }}><Star size={17} />{store.isFavorite(question.id) ? '已收藏' : '收藏'}</button>
          </div>
        </section>
        <aside className="answer-sheet">
          {session.questions.map((item, itemIndex) => {
            const itemRecord = answers[item.id];
            const itemResult = session.exam ? examResult?.results?.[item.id] : itemRecord?.result;
            return (
              <button key={item.id} className={`${itemIndex === index ? 'current' : ''} ${itemResult?.correct ? 'ok' : ''} ${itemResult && !itemResult.correct ? 'bad' : ''} ${session.exam && itemRecord?.answer?.length ? 'done' : ''}`} onClick={() => go(itemIndex)}>
                {itemIndex + 1}
              </button>
            );
          })}
        </aside>
      </main>
    </div>
  );
}

function ResultScreen({ result, onExit }) {
  const total = result.correctCount + result.wrongCount;
  const score = total ? Math.round((result.correctCount / total) * 100) : 0;
  return (
    <div className="practice-shell center-shell">
      <div className="result-card">
        <CheckCircle2 size={42} color="#0f9f6e" />
        <h2>考试完成</h2>
        <p>本次得分</p>
        <div className="score-number">{score}</div>
        <div className="stats-grid compact">
          <Metric value={result.correctCount} label="正确" />
          <Metric value={result.wrongCount} label="错误" danger />
        </div>
        <button className="primary-btn" onClick={onExit}>返回练习</button>
      </div>
    </div>
  );
}

function AdminBanks({ snapshot, store, refresh }) {
  return (
    <div className="page-stack">
      <div className="section-title"><h3>题库管理</h3><p>发布、隐藏、重命名、删除题库，并配置免费或付费属性。</p></div>
      <div className="bank-grid">
        {snapshot.banks.map((bank) => (
          <article className="bank-card" key={bank.id}>
            <div className="card-heading">
              <h3>{bank.name}</h3>
              <span className={bank.accessType === 'free' ? 'badge free' : 'badge paid'}>{bank.accessType === 'free' ? '免费' : `¥${bank.price}`}</span>
            </div>
            <p>{bank.description}</p>
            <div className="bank-meta">{bank.status === 'published' ? '已发布' : '已隐藏'} · {bank.chapterCount} 个章节 · {bank.questionCount} 题</div>
            <div className="card-actions">
              <button className="ghost-btn" onClick={() => editBank(bank, store, refresh)}>编辑</button>
              <button className="ghost-btn" onClick={() => { store.updateBank(bank.id, { status: bank.status === 'published' ? 'hidden' : 'published' }); refresh(); }}>{bank.status === 'published' ? '隐藏' : '发布'}</button>
              <button className="danger-btn" onClick={() => { if (confirm('确定删除该题库及其题目吗？')) { store.deleteBank(bank.id); refresh(); } }}><Trash2 size={16} />删除</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function AdminImport({ store, refresh }) {
  const [form, setForm] = useState({ name: '', description: '', accessType: 'free', price: 0, text: '' });
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState('');

  function parse() {
    const parsed = parseQuestionsFromText(form.text);
    setPreview(parsed);
    setStatus(`解析到 ${parsed.questions.length} 道题、${parsed.chapters.length} 个章节`);
  }

  async function readFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = file.name.toLowerCase().endsWith('.docx') ? await extractDocxText(file) : await file.text();
    setForm((prev) => ({ ...prev, text, name: prev.name || file.name.replace(/\.[^.]+$/, '') }));
  }

  async function importBank() {
    const parsed = preview || parseQuestionsFromText(form.text);
    const result = await store.importBank({ ...form, chapters: parsed.chapters, questions: parsed.questions });
    if (!result.ok) {
      alert(result.message);
      return;
    }
    refresh();
    setStatus(`导入成功：${result.count} 道题`);
  }

  return (
    <div className="page-stack">
      <div className="section-title"><h3>题库导入</h3><p>网站静态版先支持 TXT/复制文本导入。Word 模板解析后续迁移到后端接口更稳定。</p></div>
      <Panel>
        <div className="config-grid">
          <label>题库名称<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>收费方式<select value={form.accessType} onChange={(event) => setForm({ ...form, accessType: event.target.value })}><option value="free">免费</option><option value="paid">付费/授权</option></select></label>
          <label>价格<input type="number" value={form.price} onChange={(event) => setForm({ ...form, price: Number(event.target.value) || 0 })} /></label>
        </div>
        <label className="block-label">题库简介<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
        <div className="upload-row">
          <label className="file-btn"><Upload size={17} />选择 Word/TXT 文件<input type="file" accept=".docx,.txt,.md,.csv" onChange={readFile} /></label>
          <button className="ghost-btn" onClick={() => { store.importSampleBank(); refresh(); setStatus('已导入演示题库'); }}><Plus size={17} />导入演示题库</button>
        </div>
        <textarea className="import-textarea" value={form.text} onChange={(event) => setForm({ ...form, text: event.target.value })} placeholder={'可粘贴如下格式：\n第一章 基础知识\n1. 电流的单位是？（单选）\nA. 伏特\nB. 安培\n答案：B\n解析：安培是电流单位。'} />
        <div className="button-row">
          <button className="ghost-btn" onClick={parse}>解析预览</button>
          <button className="primary-btn" onClick={importBank}>确认导入题库</button>
        </div>
        {status && <p className="success-text">{status}</p>}
      </Panel>
      {preview && (
        <Panel title="解析预览">
          <div className="table-list">
            {preview.questions.slice(0, 8).map((item, index) => (
              <div key={`${item.stem}-${index}`}><span>{item.chapterName}</span><span>{typeLabels[item.type] || item.type}</span><strong>{item.answerText}</strong></div>
            ))}
          </div>
        </Panel>
      )}
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
      <div className="section-title"><h3>考试模板</h3><p>管理员设置默认模拟考试配比，用户也可以在考试前选择自定义。</p></div>
      <Panel>
        <select value={bankId} onChange={(event) => changeBank(event.target.value)}>
          {snapshot.banks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <div className="config-grid">
          <label>总题数<input type="number" value={template.totalQuestions} onChange={(event) => setTemplate({ ...template, totalQuestions: Number(event.target.value) || 30 })} /></label>
          {['single', 'multiple', 'judge'].map((type) => <label key={type}>{typeLabels[type]}占比<input type="number" value={template.typeRatios[type] || 0} onChange={(event) => setTemplate({ ...template, typeRatios: { ...template.typeRatios, [type]: Number(event.target.value) || 0 } })} /></label>)}
        </div>
      </Panel>
      {bank && (
        <Panel title="章节占比">
          <div className="config-grid">
            {bank.chapters.map((chapter) => <label key={chapter.id}>{chapter.name}<input type="number" value={template.chapterRatios[chapter.id] || 0} onChange={(event) => setTemplate({ ...template, chapterRatios: { ...template.chapterRatios, [chapter.id]: Number(event.target.value) || 0 } })} /></label>)}
          </div>
          <button className="primary-btn" onClick={() => { store.saveExamTemplate(bankId, template); refresh(); alert('模板已保存'); }}>保存模板</button>
        </Panel>
      )}
    </div>
  );
}

function AdminCodes({ snapshot, store, refresh }) {
  const [planId, setPlanId] = useState(snapshot.plans[0]?.id || '');
  const [count, setCount] = useState(10);
  const [latest, setLatest] = useState([]);
  return (
    <div className="page-stack">
      <div className="section-title"><h3>激活码管理</h3><p>早期收费可先采用激活码模式：用户付款后，你把对应激活码发给用户。</p></div>
      <Panel>
        <div className="config-grid">
          <label>套餐<select value={planId} onChange={(event) => setPlanId(event.target.value)}>{snapshot.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
          <label>生成数量<input type="number" value={count} onChange={(event) => setCount(Number(event.target.value) || 1)} /></label>
        </div>
        <button className="primary-btn" onClick={async () => { const codes = await store.createActivationCodes(planId, count); setLatest(codes); refresh(); }}>生成激活码</button>
      </Panel>
      {!!latest.length && <CodeBox codes={latest.map((item) => item.code)} />}
      <Panel title="全部激活码">
        <div className="table-list code-table">
          {snapshot.activationCodes.slice().reverse().map((item) => {
            const plan = snapshot.plans.find((planItem) => planItem.id === item.planId);
            const user = snapshot.users.find((userItem) => userItem.id === item.usedBy);
            return <div key={item.id}><span>{item.code}</span><span>{plan?.name || '套餐'}</span><strong>{item.usedBy ? `已用：${user?.name || '用户'}` : '未使用'}</strong></div>;
          })}
        </div>
      </Panel>
    </div>
  );
}

function AdminUsers({ snapshot, store, refresh }) {
  const normalUsers = snapshot.users.filter((item) => item.role === 'user');
  const [userId, setUserId] = useState(normalUsers[0]?.id || '');
  const [planId, setPlanId] = useState(snapshot.plans[0]?.id || '');
  const selectedUser = normalUsers.find((user) => user.id === userId);

  async function deleteUser(user) {
    const label = `${user.name || '未命名用户'} / ${user.phone || '无手机号'}`;
    if (!confirm(`确定删除用户「${label}」吗？\n该用户的加入题库、答题记录、错题、收藏、授权和订单记录都会同步删除。`)) return;
    const result = await store.deleteUser?.(user.id);
    if (!result) {
      alert('删除失败，当前环境暂不支持删除用户');
      return;
    }
    if (user.id === userId) {
      const nextUser = normalUsers.find((item) => item.id !== user.id);
      setUserId(nextUser?.id || '');
    }
    if (store.refreshAdminUsers) await store.refreshAdminUsers();
    refresh();
    alert('用户已删除');
  }

  return (
    <div className="page-stack">
      <div className="section-title"><h3>用户管理</h3><p>查看已注册用户、加入题库、答题次数、错题和收藏数据，并可手动授权。</p></div>
      <Panel title="用户信息">
        {!normalUsers.length && <p className="muted">暂无注册用户。</p>}
        <div className="user-admin-list">
          {normalUsers.map((user) => (
            <article className="user-admin-row" key={user.id}>
              <div className="user-main">
                <strong>{user.name || '未命名用户'}</strong>
                <span>{user.phone || '未填写手机号'}</span>
              </div>
              <div className="user-stats">
                <span>题库 <strong>{user.joined_bank_count ?? 0}</strong></span>
                <span>答题 <strong>{user.attempt_count ?? 0}</strong></span>
                <span>错题 <strong>{user.wrong_count ?? 0}</strong></span>
                <span>收藏 <strong>{user.favorite_count ?? 0}</strong></span>
                <span>授权 <strong>{user.grant_count ?? 0}</strong></span>
              </div>
              <div className="user-extra">
                <span>加入题库：{user.joined_bank_names || '暂无'}</span>
                <span>注册时间：{formatDate(user.created_at || user.createdAt) || '未知'}</span>
                <span>最近答题：{formatDate(user.last_attempt_at || user.lastAttemptAt) || '暂无'}</span>
              </div>
              <button className="danger-btn small" onClick={() => deleteUser(user)}><Trash2 size={16} />删除</button>
            </article>
          ))}
        </div>
      </Panel>
      <Panel title="手动授权">
        <div className="config-grid">
          <label>用户<select value={userId} onChange={(event) => setUserId(event.target.value)}>{normalUsers.map((user) => <option key={user.id} value={user.id}>{user.name} / {user.phone}</option>)}</select></label>
          <label>套餐<select value={planId} onChange={(event) => setPlanId(event.target.value)}>{snapshot.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
        </div>
        {selectedUser && <p className="muted">当前用户：{selectedUser.name}，注册时间：{formatDate(selectedUser.created_at || selectedUser.createdAt)}</p>}
        <button className="primary-btn" onClick={() => { if (store.grantUserPlan(userId, planId)) { refresh(); alert('授权成功'); } }}>手动授权</button>
      </Panel>
      <Panel title="授权记录">
        <div className="table-list">
          {snapshot.entitlementsView.slice().reverse().map((item) => <div key={item.id}><span>{item.userName}</span><span>{item.planName}</span><strong>{formatDate(item.expiresAt) || '永久'}</strong></div>)}
        </div>
      </Panel>
    </div>
  );
}

function AdminOrders({ snapshot, store, refresh }) {
  return (
    <div className="page-stack">
      <div className="section-title"><h3>订单记录</h3><p>当前是支付预留订单，后续接入真实支付后由支付回调自动标记已支付。</p></div>
      <Panel>
        <div className="table-list">
          {snapshot.orders.slice().reverse().map((item) => (
            <div key={item.id}>
              <span>{item.userName}</span>
              <span>{item.planName} · ¥{item.amount}</span>
              <strong>{item.status === 'paid' ? '已支付' : <button className="mini-btn" onClick={() => { store.markOrderPaid(item.id); refresh(); }}>标记支付</button>}</strong>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function AdminBackup({ store, refresh }) {
  const [text, setText] = useState('');
  return (
    <div className="page-stack">
      <div className="section-title"><h3>数据备份</h3><p>静态版数据存放在当前浏览器，建议经常导出备份。正式版会迁移到云数据库。</p></div>
      <Panel>
        <div className="button-row">
          <button className="primary-btn" onClick={() => setText(store.exportState())}><Download size={17} />导出数据</button>
          <button className="danger-btn" onClick={() => { if (confirm('确定恢复演示数据吗？当前浏览器数据会被覆盖。')) { store.resetDemoData(); refresh(); setText(''); } }}><RotateCcw size={17} />恢复演示数据</button>
        </div>
        <textarea className="import-textarea" value={text} onChange={(event) => setText(event.target.value)} placeholder="导出的 JSON 会显示在这里，也可以粘贴备份 JSON 后导入。" />
        <button className="ghost-btn" onClick={() => { store.importState(text); refresh(); alert('导入成功'); }}>导入备份 JSON</button>
      </Panel>
    </div>
  );
}

function AdminStats({ snapshot }) {
  const correct = snapshot.attempts.filter((item) => item.correct).length;
  const total = snapshot.attempts.length;
  return (
    <div className="page-stack">
      <div className="stats-grid">
        <Metric value={snapshot.banks.length} label="题库数" />
        <Metric value={snapshot.users.filter((item) => item.role === 'user').length} label="用户数" />
        <Metric value={total ? `${Math.round((correct / total) * 100)}%` : '0%'} label="正确率" />
      </div>
      <Panel title="最近答题记录">
        <div className="table-list">
          {snapshot.attempts.slice(-12).reverse().map((item) => <div key={item.id}><span>{item.userName}</span><span>{item.bankName}</span><strong className={item.correct ? 'ok-text' : 'bad-text'}>{item.correct ? '正确' : '错误'}</strong></div>)}
        </div>
      </Panel>
    </div>
  );
}

function Profile({ snapshot, store, refresh, onLogout }) {
  const [code, setCode] = useState('');
  const [feedback, setFeedback] = useState('');
  const userGrants = snapshot.entitlements[snapshot.currentUser.id] || [];
  const myBanks = snapshot.banks.filter((bank) => snapshot.userBankIds.includes(bank.id));

  function redeem() {
    const result = store.redeemActivationCode(code);
    refresh();
    alert(result.message);
    if (result.ok) setCode('');
  }

  function createOrder(planId) {
    const result = store.createOrder(planId);
    refresh();
    alert(result.ok ? `已生成预留订单：${result.order.orderNo}。后续接入收款码或支付接口后可继续完成支付。` : result.message);
  }

  return (
    <div className="page-stack">
      <div className="hero-panel">
        <div>
          <h2>{snapshot.currentUser.name}</h2>
          <p>{snapshot.currentUser.phone}</p>
        </div>
        <button className="ghost-btn" onClick={onLogout}>退出 / 切换登录</button>
      </div>
      <div className="stats-grid">
        <Metric value={snapshot.userBankIds.length} label="我的题库" />
        <Metric value={snapshot.stats.wrongCount} label="错题" danger />
        <Metric value={snapshot.stats.favoriteCount} label="收藏" />
      </div>
      <Panel title="我的题库">
        {!myBanks.length && <p className="muted">还没有加入题库。</p>}
        {myBanks.map((bank) => <div className="bank-row" key={bank.id}><div><strong>{bank.name}</strong><p>{bank.chapterCount} 个章节 · {bank.questionCount} 题</p></div></div>)}
      </Panel>
      <Panel title="激活码解锁">
        <div className="inline-form">
          <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="输入管理员发放的激活码" />
          <button className="primary-btn" onClick={redeem}><Gift size={17} />激活</button>
        </div>
      </Panel>
      <Panel title="会员与题库授权">
        <div className="plan-grid">
          {snapshot.plans.filter((plan) => plan.enabled !== false).map((plan) => (
            <article className="plan-card" key={plan.id}>
              <strong>{plan.name}</strong>
              <span>¥{plan.price}</span>
              <p>{plan.type === 'membership' ? `${plan.durationDays} 天内解锁全部付费题库` : `${plan.durationDays} 天单题库授权`}</p>
              <button className="ghost-btn" onClick={() => createOrder(plan.id)}>支付接口预留</button>
            </article>
          ))}
        </div>
        <div className="grant-list">
          {userGrants.map((grant) => <span key={grant.id}>{grant.type === 'membership' ? '会员' : '题库授权'} · 到期：{formatDate(grant.expiresAt) || '永久'}</span>)}
        </div>
      </Panel>
      <Panel title="练习统计与意见反馈">
        <p className="muted">已答题 {snapshot.stats.attemptCount} 次。你可以把使用问题或题库建议发给管理员。</p>
        <textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="请输入反馈内容" />
        <button className="primary-btn" onClick={() => { if (feedback.trim()) { store.saveFeedback(feedback.trim()); setFeedback(''); alert('反馈已提交'); } }}>提交反馈</button>
      </Panel>
    </div>
  );
}

function BankList({ title, banks, actionText, onAction, empty }) {
  return (
    <Panel title={title}>
      {!banks.length && <p className="muted">{empty}</p>}
      {banks.map((bank) => (
        <div className="bank-row" key={bank.id}>
          <div><strong>{bank.name}</strong><p>{bank.chapterCount} 个章节 · {bank.questionCount} 道题</p></div>
          <button className="primary-btn small" onClick={() => onAction(bank)}>{actionText}</button>
        </div>
      ))}
    </Panel>
  );
}

function Panel({ title, children }) {
  return <section className="panel">{title && <h3>{title}</h3>}{children}</section>;
}

function Metric({ value, label, danger }) {
  return <div className="metric"><strong className={danger ? 'danger' : ''}>{value}</strong><span>{label}</span></div>;
}

function Empty({ text }) {
  return <div className="panel empty-panel">{text}</div>;
}

function CodeBox({ codes }) {
  return (
    <Panel title="本次生成">
      <div className="code-box">{codes.join('\n')}</div>
    </Panel>
  );
}

function editBank(bank, store, refresh) {
  const name = prompt('题库名称', bank.name);
  if (!name) return;
  const price = prompt('价格，免费题库填 0', bank.price || 0);
  const accessType = Number(price) > 0 ? 'paid' : 'free';
  store.updateBank(bank.id, { name, price: Number(price) || 0, accessType });
  refresh();
}

function modeTitle(mode) {
  return practiceModes.find((item) => item.key === mode)?.title || '练习';
}

function arrayToMap(answer) {
  const map = {};
  (answer || []).forEach((item) => { map[item] = true; });
  return map;
}

function shuffle(list) {
  return [...list].sort(() => Math.random() - 0.5);
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleDateString('zh-CN');
}

async function extractDocxText(file) {
  const zip = await JSZip.loadAsync(file);
  const documentXml = await zip.file('word/document.xml')?.async('text');
  if (!documentXml) throw new Error('未找到 Word 正文内容');
  const parser = new DOMParser();
  const doc = parser.parseFromString(documentXml, 'application/xml');
  const paragraphs = [...doc.getElementsByTagName('w:p')].map((paragraph) => {
    const texts = [...paragraph.getElementsByTagName('w:t')].map((node) => node.textContent || '');
    return texts.join('').trim();
  }).filter(Boolean);
  return paragraphs.join('\n');
}

createRoot(document.getElementById('root')).render(<App />);
