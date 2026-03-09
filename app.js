// ============================================================
// SUOMI ÖĞRENİYORUM - Ana Uygulama Motoru
// ============================================================

class FinnishApp {
  constructor() {
    this.state = {
      screen: 'home',
      level: null,
      mode: null,
      contentType: 'words', // 'words' or 'sentences'
      currentItems: [],
      currentIndex: 0,
      score: 0,
      streak: 0,
      maxStreak: 0,
      lives: 3,
      sessionCorrect: 0,
      sessionTotal: 0,
      xp: 0,
      dailyGoal: 20,
      dailyProgress: 0,
    };

    this.progress = this.loadProgress();
    this.audio = new SpeechSynthesisManager();
    this.init();
  }

  loadProgress() {
    try {
      const saved = localStorage.getItem('finnishAppProgress');
      return saved ? JSON.parse(saved) : {
        totalXP: 0,
        level: 1,
        wordsLearned: new Set(),
        sentencesLearned: new Set(),
        levelProgress: { A1: 0, A2: 0, B1: 0, B2: 0 },
        dailyStreak: 0,
        lastStudyDate: null,
        achievements: [],
        quizHistory: []
      };
    } catch(e) {
      return {
        totalXP: 0, level: 1,
        wordsLearned: new Set(), sentencesLearned: new Set(),
        levelProgress: { A1: 0, A2: 0, B1: 0, B2: 0 },
        dailyStreak: 0, lastStudyDate: null,
        achievements: [], quizHistory: []
      };
    }
  }

  saveProgress() {
    try {
      const toSave = {
        ...this.progress,
        wordsLearned: [...this.progress.wordsLearned],
        sentencesLearned: [...this.progress.sentencesLearned]
      };
      localStorage.setItem('finnishAppProgress', JSON.stringify(toSave));
    } catch(e) {}
  }

  init() {
    this.render();
    this.updateDailyStreak();
  }

  updateDailyStreak() {
    const today = new Date().toDateString();
    if (this.progress.lastStudyDate !== today) {
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      if (this.progress.lastStudyDate === yesterday) {
        this.progress.dailyStreak++;
      } else if (this.progress.lastStudyDate !== today) {
        this.progress.dailyStreak = 0;
      }
    }
  }

  navigate(screen, params = {}) {
    this.state = { ...this.state, screen, ...params };
    this.render();
  }

  startActivity(level, mode, contentType) {
    const data = contentType === 'words' ? VOCABULARY[level] : SENTENCES[level];
    const shuffled = [...data].sort(() => Math.random() - 0.5).slice(0, mode === 'flashcard' ? 20 : 10);

    this.state = {
      ...this.state,
      screen: 'activity',
      level,
      mode,
      contentType,
      currentItems: shuffled,
      currentIndex: 0,
      score: 0,
      streak: 0,
      lives: 3,
      sessionCorrect: 0,
      sessionTotal: 0,
      currentQuestion: this.generateQuestion(shuffled[0], mode, contentType, data)
    };
    this.render();
  }

  generateQuestion(item, mode, contentType, allData) {
    if (!item) return null;

    if (mode === 'flashcard') {
      return { type: 'flashcard', item, revealed: false };
    }

    if (mode === 'quiz') {
      // Multiple choice: pick 3 wrong answers from same level
      const others = allData.filter(i => i.id !== item.id);
      const wrong = others.sort(() => Math.random() - 0.5).slice(0, 3);
      const options = [item, ...wrong].sort(() => Math.random() - 0.5);
      const direction = Math.random() > 0.5 ? 'fi-to-tr' : 'tr-to-fi';
      return { type: 'quiz', item, options, direction, selected: null, answered: false };
    }

    if (mode === 'match') {
      const pool = allData.sort(() => Math.random() - 0.5).slice(0, 6);
      return { type: 'match', items: pool, matched: new Set(), selectedFi: null, selectedTr: null };
    }

    if (mode === 'listening') {
      const others = allData.filter(i => i.id !== item.id);
      const wrong = others.sort(() => Math.random() - 0.5).slice(0, 3);
      const options = [item, ...wrong].sort(() => Math.random() - 0.5);
      return { type: 'listening', item, options, selected: null, answered: false };
    }

    return null;
  }

  handleFlashcard(rating) {
    // rating: 'easy', 'ok', 'hard'
    const xpMap = { easy: 10, ok: 7, hard: 3 };
    const xp = xpMap[rating] || 5;
    this.addXP(xp);

    if (rating !== 'hard') {
      this.state.sessionCorrect++;
      this.state.streak++;
    } else {
      this.state.streak = 0;
    }
    this.state.sessionTotal++;
    this.nextItem();
  }

  handleQuizAnswer(selectedIndex) {
    const q = this.state.currentQuestion;
    if (q.answered) return;

    const correct = q.options[selectedIndex].id === q.item.id;
    q.selected = selectedIndex;
    q.answered = true;
    q.correct = correct;

    if (correct) {
      this.state.sessionCorrect++;
      this.state.streak++;
      this.state.score += 10;
      this.addXP(10);
    } else {
      this.state.streak = 0;
      this.state.lives = Math.max(0, this.state.lives - 1);
    }
    this.state.sessionTotal++;
    this.render();

    setTimeout(() => this.nextItem(), 1500);
  }

  handleMatchSelect(type, id) {
    const q = this.state.currentQuestion;
    if (q.matched.has(id)) return;

    if (type === 'fi') {
      q.selectedFi = q.selectedFi === id ? null : id;
    } else {
      q.selectedTr = q.selectedTr === id ? null : id;
    }

    // Check for match
    if (q.selectedFi !== null && q.selectedTr !== null) {
      const fiItem = q.items.find(i => i.id === q.selectedFi);
      const trItem = q.items.find(i => i.id === q.selectedTr);

      if (fiItem && trItem && fiItem.id === trItem.id) {
        q.matched.add(fiItem.id);
        q.selectedFi = null;
        q.selectedTr = null;
        this.state.sessionCorrect++;
        this.state.streak++;
        this.addXP(15);

        if (q.matched.size === q.items.length) {
          setTimeout(() => this.nextItem(), 800);
        }
      } else {
        // Wrong match - flash red
        this.state.streak = 0;
        setTimeout(() => {
          q.selectedFi = null;
          q.selectedTr = null;
          this.render();
        }, 600);
      }
    }
    this.state.sessionTotal++;
    this.render();
  }

  handleListeningAnswer(selectedIndex) {
    const q = this.state.currentQuestion;
    if (q.answered) return;

    const correct = q.options[selectedIndex].id === q.item.id;
    q.selected = selectedIndex;
    q.answered = true;
    q.correct = correct;

    if (correct) {
      this.state.sessionCorrect++;
      this.state.streak++;
      this.addXP(12);
    } else {
      this.state.streak = 0;
      this.state.lives = Math.max(0, this.state.lives - 1);
    }
    this.state.sessionTotal++;
    this.render();
    setTimeout(() => this.nextItem(), 1500);
  }

  nextItem() {
    const next = this.state.currentIndex + 1;
    if (next >= this.state.currentItems.length || this.state.lives === 0) {
      this.endSession();
      return;
    }
    this.state.currentIndex = next;
    const nextItem = this.state.currentItems[next];
    const allData = this.state.contentType === 'words'
      ? VOCABULARY[this.state.level]
      : SENTENCES[this.state.level];
    this.state.currentQuestion = this.generateQuestion(nextItem, this.state.mode, this.state.contentType, allData);
    this.render();
  }

  endSession() {
    const accuracy = this.state.sessionTotal > 0
      ? Math.round((this.state.sessionCorrect / this.state.sessionTotal) * 100) : 0;

    this.progress.lastStudyDate = new Date().toDateString();
    this.saveProgress();

    this.navigate('results', {
      accuracy,
      xpEarned: this.state.score || this.state.sessionCorrect * 10
    });
  }

  addXP(amount) {
    this.progress.totalXP = (this.progress.totalXP || 0) + amount;
    this.state.score = (this.state.score || 0) + amount;
    const newLevel = Math.floor(this.progress.totalXP / 500) + 1;
    this.progress.level = newLevel;
    this.saveProgress();
  }

  speak(text) {
    this.audio.speak(text, 'fi-FI');
  }

  // ============================================================
  // RENDER ENGINE
  // ============================================================
  render() {
    const app = document.getElementById('app');
    if (!app) return;

    switch (this.state.screen) {
      case 'home': app.innerHTML = this.renderHome(); break;
      case 'levelSelect': app.innerHTML = this.renderLevelSelect(); break;
      case 'modeSelect': app.innerHTML = this.renderModeSelect(); break;
      case 'activity': app.innerHTML = this.renderActivity(); break;
      case 'results': app.innerHTML = this.renderResults(); break;
      case 'profile': app.innerHTML = this.renderProfile(); break;
      case 'wordList': app.innerHTML = this.renderWordList(); break;
      default: app.innerHTML = this.renderHome();
    }

    this.attachEventListeners();
  }

  renderHome() {
    const streak = this.progress.dailyStreak || 0;
    const totalXP = this.progress.totalXP || 0;
    const userLevel = this.progress.level || 1;

    return `
    <div class="screen home-screen">
      <div class="home-header">
        <div class="app-logo">
          <span class="logo-fi">FI</span>
          <span class="logo-nce">nce</span>
        </div>
        <button class="icon-btn" data-action="profile">👤</button>
      </div>

      <div class="hero-section">
        <div class="hero-text">
          <h1>Merhaba! 👋</h1>
          <p>Fince öğrenmeye devam et</p>
        </div>
        <div class="stats-row">
          <div class="stat-pill">🔥 ${streak} gün</div>
          <div class="stat-pill">⭐ ${totalXP} XP</div>
          <div class="stat-pill">🏆 Seviye ${userLevel}</div>
        </div>
      </div>

      <div class="section-title">📚 Kelimeler ile Başla</div>
      <div class="level-cards">
        ${['A1', 'A2', 'B1', 'B2'].map(lvl => `
          <button class="level-card" data-action="selectLevel" data-level="${lvl}" data-type="words">
            <div class="level-badge level-${lvl.toLowerCase()}">${lvl}</div>
            <div class="level-info">
              <div class="level-name">${this.getLevelName(lvl)}</div>
              <div class="level-count">${VOCABULARY[lvl].length} kelime</div>
            </div>
            <div class="level-arrow">›</div>
          </button>
        `).join('')}
      </div>

      <div class="section-title">💬 Kalıp Cümleler</div>
      <div class="level-cards">
        ${['A1', 'A2', 'B1', 'B2'].map(lvl => `
          <button class="level-card" data-action="selectLevel" data-level="${lvl}" data-type="sentences">
            <div class="level-badge level-${lvl.toLowerCase()}">${lvl}</div>
            <div class="level-info">
              <div class="level-name">${this.getLevelName(lvl)}</div>
              <div class="level-count">${SENTENCES[lvl].length} cümle</div>
            </div>
            <div class="level-arrow">›</div>
          </button>
        `).join('')}
      </div>

      <div class="bottom-nav">
        <button class="nav-btn active" data-action="home">🏠<span>Ana Sayfa</span></button>
        <button class="nav-btn" data-action="wordList">📖<span>Kelimeler</span></button>
        <button class="nav-btn" data-action="profile">👤<span>Profil</span></button>
      </div>
    </div>`;
  }

  renderModeSelect() {
    const { level, contentType } = this.state;
    const typeLabel = contentType === 'words' ? 'Kelime' : 'Cümle';
    const modes = [
      { id: 'flashcard', icon: '🃏', name: 'Flashcard', desc: 'Kartları çevir, öğren' },
      { id: 'quiz', icon: '✅', name: 'Quiz', desc: 'Çoktan seçmeli sorular' },
      { id: 'match', icon: '🔗', name: 'Eşleştir', desc: 'Kelimeleri çiftleştir' },
      { id: 'listening', icon: '🎧', name: 'Dinleme', desc: 'Sesi duyup tanı' },
    ];

    return `
    <div class="screen">
      <div class="screen-header">
        <button class="back-btn" data-action="home">‹</button>
        <h2>${level} - ${typeLabel} Aktiviteleri</h2>
      </div>

      <div class="mode-grid">
        ${modes.map(m => `
          <button class="mode-card" data-action="startActivity" data-mode="${m.id}">
            <div class="mode-icon">${m.icon}</div>
            <div class="mode-name">${m.name}</div>
            <div class="mode-desc">${m.desc}</div>
          </button>
        `).join('')}
      </div>
    </div>`;
  }

  renderActivity() {
    const { mode, currentQuestion, currentIndex, currentItems, score, streak, lives, level } = this.state;
    if (!currentQuestion) return '<div class="screen"><p>Yükleniyor...</p></div>';

    const progress = ((currentIndex + 1) / currentItems.length) * 100;

    let activityHTML = '';
    if (mode === 'flashcard') activityHTML = this.renderFlashcard(currentQuestion);
    else if (mode === 'quiz') activityHTML = this.renderQuiz(currentQuestion);
    else if (mode === 'match') activityHTML = this.renderMatch(currentQuestion);
    else if (mode === 'listening') activityHTML = this.renderListening(currentQuestion);

    return `
    <div class="screen activity-screen">
      <div class="activity-header">
        <button class="back-btn" data-action="home">✕</button>
        <div class="progress-bar-wrap">
          <div class="progress-bar" style="width:${progress}%"></div>
        </div>
        <div class="lives">${'❤️'.repeat(lives)}${'🖤'.repeat(3 - lives)}</div>
      </div>

      <div class="activity-stats">
        <span class="level-tag level-${level.toLowerCase()}">${level}</span>
        <span class="score-tag">⭐ ${score}</span>
        ${streak > 1 ? `<span class="streak-tag">🔥 ${streak}x</span>` : ''}
      </div>

      ${activityHTML}
    </div>`;
  }

  renderFlashcard(q) {
    const { item, revealed } = q;
    return `
    <div class="flashcard-container">
      <div class="flashcard ${revealed ? 'revealed' : ''}" data-action="revealCard">
        <div class="card-front">
          <div class="card-lang">FİNCE</div>
          <div class="card-word">${item.fi}</div>
          <div class="card-hint">${item.category}</div>
          <div class="tap-hint">${revealed ? '' : '👆 Çevirmek için dokun'}</div>
        </div>
        ${revealed ? `
        <div class="card-back-content">
          <div class="translation-label">TÜRKÇE</div>
          <div class="translation">${item.tr}</div>
          ${item.en ? `<div class="english-hint">${item.en}</div>` : ''}
          <button class="speak-btn" data-action="speak" data-text="${item.fi}">🔊 Telaffuz</button>
        </div>
        ` : ''}
      </div>

      ${revealed ? `
      <div class="rating-buttons">
        <button class="rating-btn hard" data-action="rateCard" data-rating="hard">😟 Zor</button>
        <button class="rating-btn ok" data-action="rateCard" data-rating="ok">🙂 Tamam</button>
        <button class="rating-btn easy" data-action="rateCard" data-rating="easy">😄 Kolay</button>
      </div>
      ` : ''}
    </div>`;
  }

  renderQuiz(q) {
    const { item, options, direction, answered, correct, selected } = q;
    const question = direction === 'fi-to-tr' ? item.fi : item.tr;
    const questionLang = direction === 'fi-to-tr' ? 'Fince kelimeyi Türkçeye çevir' : 'Türkçe kelimeyi Fincede bul';

    return `
    <div class="quiz-container">
      <div class="quiz-prompt">
        <div class="prompt-label">${questionLang}</div>
        <div class="prompt-word">${question}</div>
        ${direction === 'fi-to-tr' ? `<button class="speak-mini" data-action="speak" data-text="${item.fi}">🔊</button>` : ''}
      </div>

      <div class="quiz-options">
        ${options.map((opt, i) => {
          const optText = direction === 'fi-to-tr' ? opt.tr : opt.fi;
          const isCorrect = opt.id === item.id;
          let cls = 'option-btn';
          if (answered) {
            if (i === selected && isCorrect) cls += ' correct';
            else if (i === selected && !isCorrect) cls += ' wrong';
            else if (isCorrect) cls += ' correct';
          }
          return `<button class="${cls}" data-action="quizAnswer" data-index="${i}" ${answered ? 'disabled' : ''}>${optText}</button>`;
        }).join('')}
      </div>

      ${answered ? `
      <div class="answer-feedback ${correct ? 'correct' : 'wrong'}">
        ${correct ? '✅ Doğru!' : `❌ Yanlış! Doğrusu: ${direction === 'fi-to-tr' ? item.tr : item.fi}`}
      </div>` : ''}
    </div>`;
  }

  renderMatch(q) {
    const { items, matched, selectedFi, selectedTr } = q;

    return `
    <div class="match-container">
      <div class="match-instruction">Kelimeleri eşleştir</div>
      <div class="match-columns">
        <div class="match-col">
          ${items.map(item => {
            const isMatched = matched.has(item.id);
            const isSelected = selectedFi === item.id;
            return `<button class="match-btn fi-btn ${isMatched ? 'matched' : ''} ${isSelected ? 'selected' : ''}"
              data-action="matchSelect" data-type="fi" data-id="${item.id}"
              ${isMatched ? 'disabled' : ''}>
              ${item.fi}
            </button>`;
          }).join('')}
        </div>
        <div class="match-col">
          ${items.map(item => {
            const isMatched = matched.has(item.id);
            const isSelected = selectedTr === item.id;
            return `<button class="match-btn tr-btn ${isMatched ? 'matched' : ''} ${isSelected ? 'selected' : ''}"
              data-action="matchSelect" data-type="tr" data-id="${item.id}"
              ${isMatched ? 'disabled' : ''}>
              ${item.tr}
            </button>`;
          }).join('')}
        </div>
      </div>
      <div class="match-progress">${matched.size} / ${items.length} eşleşti</div>
    </div>`;
  }

  renderListening(q) {
    const { item, options, answered, selected } = q;
    return `
    <div class="listening-container">
      <div class="listen-prompt">
        <div class="prompt-label">Duyduğun kelimeyi seç</div>
        <button class="big-speak-btn" data-action="speak" data-text="${item.fi}">🔊</button>
        <div class="listen-hint">Fince sesi dinle</div>
      </div>

      <div class="quiz-options">
        ${options.map((opt, i) => {
          const isCorrect = opt.id === item.id;
          let cls = 'option-btn';
          if (answered) {
            if (i === selected && isCorrect) cls += ' correct';
            else if (i === selected && !isCorrect) cls += ' wrong';
            else if (isCorrect) cls += ' correct';
          }
          return `<button class="${cls}" data-action="listenAnswer" data-index="${i}" ${answered ? 'disabled' : ''}>${opt.fi}</button>`;
        }).join('')}
      </div>

      ${answered ? `
      <div class="answer-feedback ${q.correct ? 'correct' : 'wrong'}">
        ${q.correct ? '✅ Doğru!' : `❌ Yanlış! Doğru kelime: ${item.fi}`}
      </div>` : ''}
    </div>`;
  }

  renderResults() {
    const { sessionCorrect, sessionTotal, accuracy, xpEarned } = this.state;

    let stars = '⭐⭐⭐';
    if ((accuracy || 0) < 70) stars = '⭐';
    else if ((accuracy || 0) < 90) stars = '⭐⭐';

    return `
    <div class="screen results-screen">
      <div class="results-hero">
        <div class="results-stars">${stars}</div>
        <h1 class="results-title">
          ${(accuracy || 0) >= 80 ? 'Harika!' : (accuracy || 0) >= 60 ? 'İyi İş!' : 'Devam Et!'}
        </h1>
      </div>

      <div class="results-stats">
        <div class="result-stat">
          <div class="stat-value">${accuracy || 0}%</div>
          <div class="stat-label">Doğruluk</div>
        </div>
        <div class="result-stat">
          <div class="stat-value">${sessionCorrect || 0}</div>
          <div class="stat-label">Doğru</div>
        </div>
        <div class="result-stat">
          <div class="stat-value">+${xpEarned || 0}</div>
          <div class="stat-label">XP Kazandı</div>
        </div>
      </div>

      <div class="results-actions">
        <button class="btn-primary" data-action="home">🏠 Ana Sayfa</button>
        <button class="btn-secondary" data-action="retryActivity">🔄 Tekrar</button>
      </div>
    </div>`;
  }

  renderProfile() {
    const { totalXP, level, dailyStreak } = this.progress;
    const xpToNext = (level * 500) - (totalXP || 0);

    return `
    <div class="screen profile-screen">
      <div class="screen-header">
        <button class="back-btn" data-action="home">‹</button>
        <h2>Profilim</h2>
      </div>

      <div class="profile-hero">
        <div class="avatar">🦁</div>
        <div class="user-level">Seviye ${level || 1}</div>
        <div class="xp-bar-wrap">
          <div class="xp-bar" style="width:${Math.min(100, ((totalXP || 0) % 500) / 5)}%"></div>
        </div>
        <div class="xp-label">${totalXP || 0} XP • ${xpToNext} XP sonraki seviye</div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon">🔥</div>
          <div class="stat-num">${dailyStreak || 0}</div>
          <div class="stat-label">Gün Serisi</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">📚</div>
          <div class="stat-num">${Object.values(VOCABULARY).flat().length}</div>
          <div class="stat-label">Toplam Kelime</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">💬</div>
          <div class="stat-num">${Object.values(SENTENCES).flat().length}</div>
          <div class="stat-label">Toplam Cümle</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">⭐</div>
          <div class="stat-num">${totalXP || 0}</div>
          <div class="stat-label">Toplam XP</div>
        </div>
      </div>

      <div class="level-progress-section">
        <h3>Seviye İlerlemem</h3>
        ${['A1', 'A2', 'B1', 'B2'].map(lvl => `
          <div class="level-progress-item">
            <div class="level-badge level-${lvl.toLowerCase()}">${lvl}</div>
            <div class="level-bar-wrap">
              <div class="level-bar" style="width:${this.progress.levelProgress?.[lvl] || 0}%"></div>
            </div>
            <div class="level-pct">${this.progress.levelProgress?.[lvl] || 0}%</div>
          </div>
        `).join('')}
      </div>
    </div>`;
  }

  renderWordList() {
    const allWords = Object.entries(VOCABULARY).flatMap(([level, words]) =>
      words.slice(0, 20).map(w => ({ ...w, level }))
    );

    return `
    <div class="screen wordlist-screen">
      <div class="screen-header">
        <button class="back-btn" data-action="home">‹</button>
        <h2>Kelime Listesi</h2>
      </div>

      <div class="filter-tabs">
        ${['Tümü', 'A1', 'A2', 'B1', 'B2'].map(f => `
          <button class="filter-tab ${f === 'Tümü' ? 'active' : ''}" data-filter="${f}">${f}</button>
        `).join('')}
      </div>

      <div class="word-list">
        ${allWords.map(w => `
          <div class="word-item">
            <div class="word-fi">
              ${w.fi}
              <button class="speak-tiny" data-action="speak" data-text="${w.fi}">🔊</button>
            </div>
            <div class="word-tr">${w.tr}</div>
            <div class="word-level level-${w.level.toLowerCase()}">${w.level}</div>
          </div>
        `).join('')}
      </div>
    </div>`;
  }

  getLevelName(lvl) {
    return { A1: 'Başlangıç', A2: 'Temel', B1: 'Orta', B2: 'Üst Orta' }[lvl] || lvl;
  }

  attachEventListeners() {
    document.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', (e) => {
        const action = el.dataset.action;
        switch(action) {
          case 'home': this.navigate('home'); break;
          case 'profile': this.navigate('profile'); break;
          case 'wordList': this.navigate('wordList'); break;
          case 'selectLevel':
            this.state.level = el.dataset.level;
            this.state.contentType = el.dataset.type;
            this.navigate('modeSelect', { level: el.dataset.level, contentType: el.dataset.type });
            break;
          case 'startActivity':
            this.startActivity(this.state.level, el.dataset.mode, this.state.contentType);
            break;
          case 'revealCard':
            if (!this.state.currentQuestion.revealed) {
              this.state.currentQuestion.revealed = true;
              this.speak(this.state.currentQuestion.item.fi);
              this.render();
            }
            break;
          case 'rateCard':
            this.handleFlashcard(el.dataset.rating);
            break;
          case 'quizAnswer':
            this.handleQuizAnswer(parseInt(el.dataset.index));
            break;
          case 'matchSelect':
            this.handleMatchSelect(el.dataset.type, parseInt(el.dataset.id));
            break;
          case 'listenAnswer':
            this.handleListeningAnswer(parseInt(el.dataset.index));
            break;
          case 'speak':
            this.speak(el.dataset.text);
            break;
          case 'retryActivity':
            this.startActivity(this.state.level, this.state.mode, this.state.contentType);
            break;
        }
      });
    });
  }
}

// Speech Synthesis wrapper
class SpeechSynthesisManager {
  speak(text, lang = 'fi-FI') {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = 0.85;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    }
  }
}

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new FinnishApp();
});
