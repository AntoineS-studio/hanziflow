// Chinese Vocab Trainer - vanilla JS (offline)
// Data source: vocab.js (window.VOCAB)

const $ = (id) => document.getElementById(id);

const state = {
  vocab: [],
  current: null,
  mode: "cn_to_fr",
  difficulty: "normal",
  locked: false,
  stats: { correct: 0, wrong: 0, streak: 0 },

prefs: { showPinyin: true, theme: "dark" },
  pinyinRevealedOnce: false,

  // --- NEW: deck anti-répétition ---
  deck: { order: [], idx: 0 },
};



const sfx = {
  correct: new Audio("./sounds/correct.mp3"),
  wrong: new Audio("./sounds/wrong.mp3"),
};

Object.values(sfx).forEach(a => {
  a.preload = "auto";
  a.volume = 0.9;
});

function playSfx(kind) {
  const a = sfx[kind];
  if (!a) return;

  a.pause();
  a.currentTime = 0;

  a.play().catch((err) => {
    console.warn("[SFX] play() failed:", err);
    // Très utile pour savoir si c'est un NotAllowedError (policy) ou un autre souci.
  });
}


/* -----------------------
   Stats
------------------------ */
function loadStats() {
  try {
    const saved = JSON.parse(localStorage.getItem("cvt_stats") || "null");
    if (saved && typeof saved === "object") state.stats = { ...state.stats, ...saved };
  } catch {}
}
function saveStats() {
  localStorage.setItem("cvt_stats", JSON.stringify(state.stats));
}
function renderStats() {
  $("correct").textContent = String(state.stats.correct);
  $("wrong").textContent = String(state.stats.wrong);
  $("streak").textContent = String(state.stats.streak);
}

/* -----------------------
   Prefs
------------------------ */
function loadPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem("cvt_prefs") || "null");
    if (saved && typeof saved === "object") state.prefs = { ...state.prefs, ...saved };
  } catch {}
}
function savePrefs() {
  localStorage.setItem("cvt_prefs", JSON.stringify(state.prefs));
}
function applyTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = t; // => <html data-theme="light|dark">
}

/* -----------------------
   Utils
------------------------ */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildDeck() {
  const n = state.vocab.length;
  state.deck.order = shuffle(Array.from({ length: n }, (_, i) => i));
  state.deck.idx = 0;
  localStorage.setItem("cvt_deck", JSON.stringify(state.deck));
}

function loadDeck() {
  try {
    const saved = JSON.parse(localStorage.getItem("cvt_deck") || "null");
    if (
      saved &&
      Array.isArray(saved.order) &&
      typeof saved.idx === "number" &&
      saved.order.length === state.vocab.length
    ) {
      state.deck = saved;
      return;
    }
  } catch {}
  buildDeck();
}

function saveDeck() {
  localStorage.setItem("cvt_deck", JSON.stringify(state.deck));
}

function nextWordFromDeck() {
  if (!state.vocab.length) return null;

  if (!state.deck.order.length || state.deck.idx >= state.deck.order.length) {
    buildDeck();
  }

  const vocabIndex = state.deck.order[state.deck.idx];
  state.deck.idx++;
  saveDeck();

  return state.vocab[vocabIndex];
}


function sampleDistinct(n, pool, excludeFn) {
  const choices = [];
  let tries = 0;
  while (choices.length < n && tries < 5000) {
    tries++;
    const item = pool[Math.floor(Math.random() * pool.length)];
    if (excludeFn && excludeFn(item)) continue;
    if (choices.includes(item)) continue;
    choices.push(item);
  }
  return choices;
}

function normalizeForHard(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* -----------------------
   Pinyin helpers
------------------------ */
function pinyinAllowedNow() {
  return !!state.prefs.showPinyin || !!state.pinyinRevealedOnce;
}

function cnLabel(v, allowPinyin) {
  if (!v) return "";
  if (!allowPinyin) return v.hanzi;
  return v.pinyin ? `${v.hanzi} — ${v.pinyin}` : v.hanzi;
}

/* -----------------------
   Question builder
------------------------ */
function buildQuestion() {
  if (!state.vocab.length) return;

  const mode =
    state.mode === "mixed" ? (Math.random() < 0.5 ? "cn_to_fr" : "fr_to_cn") : state.mode;

const correct = nextWordFromDeck();
if (!correct) return;


  const prompt =
    mode === "cn_to_fr"
      ? { main: correct.hanzi, sub: correct.pinyin || "", label: "Traduction en français" }
      : { main: correct.fr, sub: "", label: "Traduction en chinois" };

  let distractors = [];
  const pool = state.vocab;

  if (state.difficulty === "hard") {
    if (mode === "cn_to_fr") {
      const tgt = (correct.fr || "").slice(0, 1).toLowerCase();
      const close = pool.filter(
        (v) => v !== correct && (v.fr || "").slice(0, 1).toLowerCase() === tgt
      );
      distractors = sampleDistinct(3, close.length ? close : pool, (v) => v === correct);
    } else {
      const tgt = normalizeForHard(correct.pinyin).slice(0, 1);
      const close = pool.filter(
        (v) => v !== correct && normalizeForHard(v.pinyin).slice(0, 1) === tgt
      );
      distractors = sampleDistinct(3, close.length ? close : pool, (v) => v === correct);
    }
  } else {
    distractors = sampleDistinct(3, pool, (v) => v === correct);
  }

  let options;
  let correctKey;

  if (mode === "cn_to_fr") {
    correctKey = correct.fr;
    options = shuffle([
      { kind: "fr", text: correct.fr, key: correct.fr },
      ...distractors.map((v) => ({ kind: "fr", text: v.fr, key: v.fr })),
    ]);
  } else {
    correctKey = `${correct.hanzi}|${correct.pinyin || ""}`;
    options = shuffle([
      { kind: "cn", v: correct, key: `${correct.hanzi}|${correct.pinyin || ""}` },
      ...distractors.map((v) => ({ kind: "cn", v, key: `${v.hanzi}|${v.pinyin || ""}` })),
    ]);
  }

  state.current = { mode, correct, prompt, options, correctKey };
}

/* -----------------------
   UI: pinyin line + reveal button (NO SHIFT)
------------------------ */
function updatePinyinArea() {
  const q = state.current;
  const pinyinText = $("pinyinText");
  const btn = $("revealPinyin");

  if (!q || !pinyinText || !btn) return;

  const allow = !!state.prefs.showPinyin || !!state.pinyinRevealedOnce;

  // Reset "safe"
  pinyinText.textContent = "";
  pinyinText.hidden = true;
  btn.hidden = true;

  // CN -> FR : pinyin sous le hanzi
  if (q.mode === "cn_to_fr") {
    const pinyin = q.prompt.sub || "";
    if (!pinyin) return;

    if (allow) {
      pinyinText.textContent = pinyin;
      pinyinText.hidden = false;
      btn.hidden = true; // IMPORTANT: le bouton disparait
    } else {
      btn.hidden = false; // bouton visible à la place du pinyin
    }
    return;
  }

  // FR -> CN : pas de pinyin sous le titre, juste un reveal global (answers)
  btn.hidden = allow; // si allow => on cache le bouton
}


function renderAnswers() {
  const q = state.current;
  if (!q) return;

  const answers = $("answers");
  answers.innerHTML = "";

  const allow = pinyinAllowedNow();

  q.options.forEach((opt, i) => {
    const b = document.createElement("button");
    b.className = "answer";
    b.type = "button";
    b.dataset.key = opt.key;

    const label = opt.kind === "fr" ? opt.text : cnLabel(opt.v, allow);
    b.textContent = `${i + 1}. ${label}`;

    b.addEventListener("click", () => onAnswer(opt.key));
    answers.appendChild(b);
  });
}

/* -----------------------
   Rendering
------------------------ */
function setFeedback(kind, text) {
  const el = $("feedback");
  el.classList.remove("good", "bad");
  if (kind) el.classList.add(kind);
  el.textContent = text || "";
}

function renderQuestion() {
  const q = state.current;
  if (!q) return;

  state.locked = false;
  $("next").disabled = true;

  $("qLabel").textContent = q.prompt.label;
  $("qText").textContent = q.prompt.main;

  updatePinyinArea();
  renderAnswers();

  setFeedback(null, "Choisis une réponse.");

  const ttsBtn = document.getElementById("ttsBtn");

if (ttsBtn) {
  // visible uniquement quand on a du chinois
  ttsBtn.style.display =
    state.current.mode === "cn_to_fr" ? "inline-flex" : "none";

  ttsBtn.onclick = () => {
    speakChinese(state.current.correct.hanzi);
  };
}

}

/* -----------------------
   Answer handling
------------------------ */
function lockAnswers() {
  state.locked = true;
  document.querySelectorAll(".answer").forEach((b) => (b.disabled = true));
}

function markOptions(correctKey, chosenKey) {
  document.querySelectorAll(".answer").forEach((b) => {
    const k = b.dataset.key;
    if (k === correctKey) b.classList.add("good");
    if (chosenKey && k === chosenKey && chosenKey !== correctKey) b.classList.add("bad");
  });
}

function onAnswer(chosenKey) {
  if (!state.current || state.locked) return;

  unlockAudioOnce(); // ✅ assure que c'est débloqué dès la 1ère réponse

  const q = state.current;
  const ok = chosenKey === q.correctKey;

  lockAnswers();
  markOptions(q.correctKey, chosenKey);

  if (ok) {
    state.stats.correct++;
    state.stats.streak++;
    setFeedback("good", `Correct. ${q.correct.hanzi} (${q.correct.pinyin}) = ${q.correct.fr}`);
    playSfx("correct");
  } else {
    state.stats.wrong++;
    state.stats.streak = 0;
    setFeedback("bad", `Faux. Réponse : ${q.correct.hanzi} (${q.correct.pinyin}) = ${q.correct.fr}`);
    playSfx("wrong");
  }

  saveStats();
  renderStats();
  $("next").disabled = false;
}


/* -----------------------
   Navigation
------------------------ */
function nextQuestion() {
  state.pinyinRevealedOnce = false;
  buildQuestion();
  renderQuestion();
}

function skipQuestion() {
  nextQuestion();
}

let audioUnlocked = false;

function unlockAudioOnce() {
  if (audioUnlocked) return;
  audioUnlocked = true;

  // Prime silencieux pour autoriser l'audio dès la 1ère interaction
  Object.values(sfx).forEach((a) => {
    try {
      a.pause();
      a.currentTime = 0;
      const prevVol = a.volume;
      a.volume = 0;

      a.play()
        .then(() => {
          a.pause();
          a.currentTime = 0;
          a.volume = prevVol;
        })
        .catch(() => {
          a.volume = prevVol;
        });
    } catch {}
  });
}

// IMPORTANT : pointerdown + capture => avant le click sur ta réponse
document.addEventListener("pointerdown", unlockAudioOnce, { once: true, capture: true });

/* -----------------------
   Init
------------------------ */
function init() {
  loadStats();
  loadPrefs();
  renderStats();
// 1) Applique le thème dès le chargement
applyTheme(state.prefs.theme);

// 2) Initialise + écoute le switch
if ($("toggleTheme")) {
  $("toggleTheme").checked = state.prefs.theme === "light";

  $("toggleTheme").addEventListener("change", (e) => {
    state.prefs.theme = e.target.checked ? "light" : "dark";
    savePrefs();
    applyTheme(state.prefs.theme);
  });
}

  if ($("togglePinyin")) {
    $("togglePinyin").checked = !!state.prefs.showPinyin;

    $("togglePinyin").addEventListener("change", (e) => {
      state.prefs.showPinyin = !!e.target.checked;
      state.pinyinRevealedOnce = false;
      savePrefs();

      updatePinyinArea();
      renderAnswers();
    });
  }

  if ($("revealPinyin")) {
    $("revealPinyin").addEventListener("click", () => {
      state.pinyinRevealedOnce = true;
      updatePinyinArea();
      renderAnswers();
    });
  }

  $("mode").addEventListener("change", (e) => {
    state.mode = e.target.value;
    state.pinyinRevealedOnce = false;
    nextQuestion();
  });

  $("difficulty").addEventListener("change", (e) => {
    state.difficulty = e.target.value;
    state.pinyinRevealedOnce = false;
    nextQuestion();
  });

  $("next").addEventListener("click", nextQuestion);
  if ($("skip")) $("skip").addEventListener("click", skipQuestion);

$("reset").addEventListener("click", () => {
  state.stats = { correct: 0, wrong: 0, streak: 0 };
  saveStats();
  renderStats();

  buildDeck(); // 🔁 reset aussi le paquet de mots

  nextQuestion();
});


  document.addEventListener("keydown", (e) => {
    if (!state.current || state.locked) return;
    const n = Number(e.key);
    if (n >= 1 && n <= 4) {
      const opt = state.current.options[n - 1];
      if (opt) onAnswer(opt.key);
    }
  });

  state.vocab = Array.isArray(window.VOCAB) ? window.VOCAB : [];
  loadDeck();

  if ($("total")) $("total").textContent = String(state.vocab.length);

  if ($("mode")) state.mode = $("mode").value;
  if ($("difficulty")) state.difficulty = $("difficulty").value;

  nextQuestion();
}
function speakChinese(text) {
  if (!text) return;

  const u = new SpeechSynthesisUtterance(text);
  u.lang = "zh-CN";      // chinois mandarin
  u.rate = 0.9;          // vitesse (0.7–1 conseillé)
  u.pitch = 1;

  speechSynthesis.cancel(); // stoppe toute lecture en cours
  speechSynthesis.speak(u);
}

init();
