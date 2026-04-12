import { ready } from 'https://lsong.org/scripts/dom.js';
import { h, render, useState, useEffect } from 'https://lsong.org/scripts/react/index.js';

const loadJSON = async (url) => {
  const res = await fetch(url);
  return res.json();
};

const App = ({ questions, specialQuestions, typeDescriptions, typeImages, normalTypes, dimExplanations, dimensionOrder, dimensionMeta }) => {
  const [answers, setAnswers] = useState({});
  const [isStarted, setIsStarted] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [visibleQuestions, setVisibleQuestions] = useState([]);
  const [drinkGateAnswered, setDrinkGateAnswered] = useState(false);

  const shuffle = (array) => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const handleStart = () => {
    setIsStarted(true);
    setAnswers({});
    setIsComplete(false);
    setDrinkGateAnswered(false);
    
    const shuffledRegular = shuffle(questions);
    const insertIndex = Math.floor(Math.random() * shuffledRegular.length) + 1;
    const shuffled = [
      ...shuffledRegular.slice(0, insertIndex),
      specialQuestions[0],
      ...shuffledRegular.slice(insertIndex)
    ];
    setVisibleQuestions(shuffled);
    
    document.getElementById('topbar').classList.remove('hide');
    document.getElementById('navbar').style.display = 'none';
    
    // Reset progress
    document.getElementById('progressBar').style.width = '0';
    document.getElementById('progressText').textContent = '0 / 31';
  };

  const handleAnswer = (questionId, value) => {
    const newAnswers = { ...answers, [questionId]: value };

    if (questionId === 'drink_gate_q1') {
      if (value === 3) {
        setDrinkGateAnswered(true);
        delete newAnswers['drink_gate_q2'];
      } else {
        setDrinkGateAnswered(false);
        delete newAnswers['drink_gate_q2'];
      }
    }

    setAnswers(newAnswers);

    // Auto-scroll to next unanswered question
    const currentQs = getCurrentQuestions();
    const currentIndex = currentQs.findIndex(q => q.id === questionId);
    if (currentIndex === -1) return;

    const nextUnanswered = currentQs.slice(currentIndex + 1).find(q => newAnswers[q.id] === undefined);
    if (nextUnanswered) {
      setTimeout(() => {
        const el = document.getElementById('q-' + nextUnanswered.id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    }
  };

  const handleSubmit = () => {
    if (!allAnswered) {
      // Scroll to first unanswered question
      const currentQs = getCurrentQuestions();
      const unanswered = currentQs.find(q => answers[q.id] === undefined);
      if (unanswered) {
        const el = document.getElementById('q-' + unanswered.id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }
    setIsComplete(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getCurrentQuestions = () => {
    if (!drinkGateAnswered) {
      return visibleQuestions.filter(q => q.id !== 'drink_gate_q2');
    }
    
    const gateIndex = visibleQuestions.findIndex(q => q.id === 'drink_gate_q1');
    if (gateIndex === -1) return visibleQuestions;
    
    const hasDrinkQ2 = visibleQuestions.some(q => q.id === 'drink_gate_q2');
    if (!hasDrinkQ2) {
      const before = visibleQuestions.slice(0, gateIndex + 1);
      const after = visibleQuestions.slice(gateIndex + 1);
      return [...before, specialQuestions[1], ...after];
    }
    return visibleQuestions;
  };

  const sumToLevel = (score) => {
    if (score <= 3) return 'L';
    if (score === 4) return 'M';
    return 'H';
  };

  const levelNum = (level) => ({ L: 1, M: 2, H: 3 }[level]);

  const parsePattern = (pattern) => pattern.replace(/-/g, '').split('');

  const computeResult = () => {
    const rawScores = {};
    const levels = {};
    Object.keys(dimensionMeta).forEach(dim => { rawScores[dim] = 0; });

    questions.forEach(q => {
      rawScores[q.dim] += Number(answers[q.id] || 0);
    });

    Object.entries(rawScores).forEach(([dim, score]) => {
      levels[dim] = sumToLevel(score);
    });

    const userVector = dimensionOrder.map(dim => levelNum(levels[dim]));

    const ranked = normalTypes.map(type => {
      const vector = parsePattern(type.pattern).map(levelNum);
      let distance = 0;
      let exact = 0;
      for (let i = 0; i < vector.length; i++) {
        const diff = Math.abs(userVector[i] - vector[i]);
        distance += diff;
        if (diff === 0) exact += 1;
      }
      const similarity = Math.max(0, Math.round((1 - distance / 30) * 100));
      return { ...type, ...typeDescriptions[type.code], distance, exact, similarity };
    }).sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance;
      if (b.exact !== a.exact) return b.exact - a.exact;
      return b.similarity - a.similarity;
    });

    const bestNormal = ranked[0];
    const drinkTriggered = answers['drink_gate_q2'] === 2;

    let finalType;
    let modeKicker = '你的主类型';
    let badge = `匹配度 ${bestNormal.similarity}% · 精准命中 ${bestNormal.exact}/15 维`;
    let sub = '维度命中度较高，当前结果可视为你的第一人格画像。';
    let special = false;

    if (drinkTriggered) {
      finalType = typeDescriptions.DRUNK;
      modeKicker = '隐藏人格已激活';
      badge = '匹配度 100% · 酒精异常因子已接管';
      sub = '乙醇亲和性过强，系统已直接跳过常规人格审判。';
      special = true;
    } else if (bestNormal.similarity < 60) {
      finalType = typeDescriptions.HHHH;
      modeKicker = '系统强制兜底';
      badge = `标准人格库最高匹配仅 ${bestNormal.similarity}%`;
      sub = '标准人格库对你的脑回路集体罢工了。';
      special = true;
    } else {
      finalType = bestNormal;
    }

    return { rawScores, levels, ranked, bestNormal, finalType, modeKicker, badge, sub, special };
  };

  if (!isStarted) {
    return h('div', { className: 'sbti-container' }, [
      h('div', { className: 'sbti-start' }, [
        h('h3', null, 'MBTI 已经过时，SBTI 来了'),
        h('p', null, '30道题目，15个维度，27种人格。本测试仅供娱乐，别太当真。'),
        h('button', { 
          className: 'sbti-btn sbti-btn-primary',
          onClick: handleStart
        }, '开始测试'),
      ])
    ]);
  }

  if (isComplete) {
    // Hide topbar and show navbar on result page
    document.getElementById('topbar').classList.add('hide');
    document.getElementById('navbar').style.display = '';
    
    const result = computeResult();
    const type = result.finalType;
    const imageSrc = typeImages[type.code];

    const dimList = dimensionOrder.map(dim => {
      const level = result.levels[dim];
      const explanation = dimExplanations[dim][level];
      return h('div', { className: 'sbti-dimension-item' }, [
        h('div', { className: 'sbti-dimension-item-top' }, [
          h('div', { className: 'sbti-dimension-item-name' }, dimensionMeta[dim].name),
          h('div', { className: 'sbti-dimension-item-score' }, level + ' / ' + result.rawScores[dim] + '分')
        ]),
        h('p', null, explanation)
      ]);
    });

    return h('div', { className: 'sbti-container' }, [
      h('div', { className: 'sbti-result' }, [
        h('div', { className: 'sbti-result-top' }, [
          h('div', { className: 'sbti-poster-box' }, [
            imageSrc ? h('img', { src: imageSrc, className: 'sbti-poster-image', alt: type.code }) : null,
            h('div', { className: 'sbti-poster-caption' }, type.intro)
          ]),
          h('div', { className: 'sbti-type-box' }, [
            h('div', { className: 'sbti-type-kicker' }, result.modeKicker),
            h('div', { className: 'sbti-type-name' }, type.code + '（' + type.cn + '）'),
            h('div', { className: 'sbti-match' }, result.badge),
            h('div', { className: 'sbti-type-subname' }, result.sub)
          ])
        ]),
        h('div', { className: 'sbti-analysis-box' }, [
          h('h4', null, '该人格的简单解读'),
          h('p', null, type.desc)
        ]),
        h('div', { className: 'sbti-note-box' }, [
          h('p', null, result.special 
            ? '本测试仅供娱乐。隐藏人格和傻乐兜底都属于作者故意埋的损招，请勿把它当成医学、心理学或命理学依据。'
            : '本测试仅供娱乐，别拿它当诊断、面试、相亲、分手、招魂、算命或人生判决书。'
          )
        ]),
        h('div', { className: 'sbti-dim-box' }, [
          h('h4', null, '十五维度评分'),
          h('div', { className: 'sbti-dim-list' }, dimList)
        ]),
        h('button', { 
          className: 'sbti-btn sbti-btn-primary',
          onClick: handleStart
        }, '重新测试'),
      ])
    ]);
  }

  const currentQs = getCurrentQuestions();
  const total = currentQs.length;
  const done = currentQs.filter(q => answers[q.id] !== undefined).length;
  const allAnswered = done === total;
  const percent = total ? Math.round((done / total) * 100) : 0;

  // Update header progress bar
  const fill = document.getElementById('progressBar');
  const text = document.getElementById('progressText');
  if (fill) fill.style.width = percent + '%';
  if (text) text.textContent = done + ' / ' + total;

  const questionList = currentQs.map((q, idx) => {
    const isAnswered = answers[q.id] !== undefined;
    const metaLabel = q.special ? '补充题' : (dimensionMeta[q.dim] ? dimensionMeta[q.dim].name : '');
    
    return h('div', { 
      key: q.id,
      id: 'q-' + q.id,
      className: 'sbti-question-item' + (isAnswered ? ' answered' : '')
    }, [
      h('div', { className: 'sbti-question-meta' }, [
        h('div', { className: 'sbti-badge' }, '第 ' + (idx + 1) + ' 题'),
        h('div', null, metaLabel)
      ]),
      h('div', { className: 'sbti-question-title' }, q.text),
      h('div', { className: 'sbti-options' }, q.options.map((opt, i) => {
        const code = ['A', 'B', 'C', 'D'][i] || String(i + 1);
        return h('div', {
          key: opt.value,
          className: 'sbti-option',
          onClick: () => handleAnswer(q.id, opt.value)
        }, [
          h('input', {
            type: 'radio',
            name: q.id,
            checked: answers[q.id] === opt.value,
            onChange: () => handleAnswer(q.id, opt.value)
          }),
          h('div', { className: 'sbti-option-code' }, code),
          h('div', null, opt.label)
        ]);
      }))
    ]);
  });

  return h('div', { className: 'sbti-container' }, [
    h('div', { className: 'sbti-questions-list' }, questionList),
    h('button', { 
      className: 'sbti-btn sbti-btn-primary',
      onClick: handleSubmit
    }, allAnswered ? '提交并查看结果' : '全选完才会放行 (' + done + '/' + total + ')')
  ]);
};

ready(async () => {
  const app = document.getElementById('sbti-app');
  try {
    const res = await fetch('./data.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const { questions, specialQuestions, typeDescriptions, typeImages, normalTypes, dimExplanations, dimensionOrder, dimensionMeta } = data;
    render(h(App, { questions, specialQuestions, typeDescriptions, typeImages, normalTypes, dimExplanations, dimensionOrder, dimensionMeta }), app);
  } catch (e) {
    app.innerHTML = '<p style="color:red;padding:20px;">Error: ' + e.message + '</p>';
    console.error('SBTI load error:', e);
  }
});
