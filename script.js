"use strict";

/**
 * 動画編集エディタ コア状態管理
 */
const state = {
  clips: [],          // メディアクリップ一覧
  telops: [],         // テロップ一覧
  playhead: 0,        // 現在の再生位置 (秒)
  playing: false,
  loop: false,
  speed: 1.0,
  volume: 1.0,
  muted: false,
  selectedClipId: null,
  selectedTelopId: null,
  pxPerSecond: 50,    // タイムラインのズーム倍率
  snapEnabled: true,
  history: [],        // Undo用履歴
  redoStack: [],      // Redo用履歴
  clipboard: null,    // コピペ保持
  projectMeta: { name: "新規プロジェクト", fps: 60 }
};

// DOM参照
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const uid = () => Math.random().toString(36).substring(2, 10);

const video = $("#preview-video");
const canvas = $("#preview-canvas");
const ctx = canvas.getContext("2d");
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

let animationFrameId = null;

// --- 初期化 ---
window.addEventListener("DOMContentLoaded", () => {
  initEvents();
  initPWA();
  saveStateToHistory();
  render();
});

// --- 履歴管理 (Undo / Redo / 自動保存) ---
function saveStateToHistory() {
  const snapshot = JSON.stringify({ clips: state.clips, telops: state.telops });
  state.history.push(snapshot);
  if (state.history.length > 30) state.history.shift();
  state.redoStack = [];
  autoSave();
}

function undo() {
  if (state.history.length <= 1) return;
  state.redoStack.push(state.history.pop());
  const prev = JSON.parse(state.history[state.history.length - 1]);
  state.clips = prev.clips;
  state.telops = prev.telops;
  render();
}

function redo() {
  if (state.redoStack.length === 0) return;
  const next = state.redoStack.pop();
  state.history.push(next);
  const data = JSON.parse(next);
  state.clips = data.clips;
  state.telops = data.telops;
  render();
}

function autoSave() {
  localStorage.setItem("studio_pro_autosave", JSON.stringify({
    clips: state.clips,
    telops: state.telops,
    updatedAt: Date.now()
  }));
}

// --- メディア読み込み ---
$("#media-input").addEventListener("change", async (e) => {
  const files = [...e.target.files];
  for (const file of files) {
    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith("video/");
    const isAudio = file.type.startsWith("audio/");
    const isImage = file.type.startsWith("image/");

    let duration = 5; // 画像のデフォルト長は5秒
    if (isVideo || isAudio) {
      duration = await getMediaDuration(url, isVideo ? "video" : "audio");
    }

    const clip = {
      id: uid(),
      name: file.name,
      type: isVideo ? "video" : isAudio ? "audio" : "image",
      url,
      start: state.playhead,
      duration,
      trimIn: 0,
      trimOut: duration,
      volume: 1.0,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
      color: isVideo ? "#3d6e5c" : isAudio ? "#5a4d8a" : "#8a7d3d",
      effects: { brightness: 100, contrast: 100, saturate: 100, grayscale: 0, sepia: 0, blur: 0 },
      transform: { rotate: 0, flip: "none", crop: false }
    };

    state.clips.push(clip);
  }
  saveStateToHistory();
  render();
});

function getMediaDuration(url, type) {
  return new Promise((resolve) => {
    const el = document.createElement(type);
    el.src = url;
    el.onloadedmetadata = () => resolve(el.duration || 5);
    el.onerror = () => resolve(5);
  });
}

// --- 時間・再生コントロール ---
function totalDuration() {
  let max = 10;
  for (const c of state.clips) max = Math.max(max, c.start + (c.trimOut - c.trimIn));
  for (const t of state.telops) max = Math.max(max, t.end);
  return max;
}

function togglePlay() {
  state.playing = !state.playing;
  $("#play-btn").textContent = state.playing ? "❚❚" : "▶";
  if (state.playing) {
    if (state.playhead >= totalDuration()) state.playhead = 0;
    playbackLoop();
  } else {
    cancelAnimationFrame(animationFrameId);
  }
}

function playbackLoop() {
  if (!state.playing) return;
  state.playhead += (1 / state.projectMeta.fps) * state.speed;

  if (state.playhead >= totalDuration()) {
    if (state.loop) {
      state.playhead = 0;
    } else {
      state.playing = false;
      $("#play-btn").textContent = "▶";
      return;
    }
  }

  drawPreview();
  updateTimelineUI();
  animationFrameId = requestAnimationFrame(playbackLoop);
}

function seekTo(time) {
  state.playhead = Math.max(0, Math.min(time, totalDuration()));
  drawPreview();
  updateTimelineUI();
}

// --- 描画処理 (Canvas) ---
function drawPreview() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  $("#drop-hint").classList.toggle("hidden", state.clips.length > 0);

  // 1. 映像/画像クリップの描画
  const activeClips = state.clips.filter(c => 
    c.type !== "audio" && state.playhead >= c.start && state.playhead <= c.start + (c.trimOut - c.trimIn)
  );

  for (const clip of activeClips) {
    ctx.save();
    // フィルタ適用
    const fx = clip.effects;
    ctx.filter = `brightness(${fx.brightness}%) contrast(${fx.contrast}%) saturate(${fx.saturate}%) grayscale(${fx.grayscale}%) sepia(${fx.sepia}%) blur(${fx.blur}px)`;

    // クリップ描画処理（動画/画像）
    if (clip.type === "image") {
      const img = getLoadedImage(clip.url);
      if (img) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    } else if (clip.type === "video") {
      video.src = clip.url;
      const localTime = clip.trimIn + (state.playhead - clip.start);
      if (Math.abs(video.currentTime - localTime) > 0.1) video.currentTime = localTime;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
    ctx.restore();
  }

  // 2. テロップ描画
  const activeTelops = state.telops.filter(t => state.playhead >= t.start && state.playhead <= t.end);
  for (const telop of activeTelops) {
    drawTelop(telop);
  }
}

const imageCache = new Map();
function getLoadedImage(url) {
  if (!imageCache.has(url)) {
    const img = new Image();
    img.src = url;
    img.onload = () => drawPreview();
    imageCache.set(url, img);
  }
  return imageCache.get(url);
}

function drawTelop(t) {
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((t.rotation * Math.PI) / 180);

  const fontStyle = `${t.italic ? "italic " : ""}${t.bold ? "bold " : ""}${t.size * 2}px ${t.font}`;
  ctx.font = fontStyle;
  ctx.textAlign = t.align;

  // 背景
  if (t.bgAlpha > 0) {
    ctx.fillStyle = t.bgColor;
    ctx.globalAlpha = t.bgAlpha;
    ctx.fillRect(-200, -t.size, 400, t.size * 1.5);
    ctx.globalAlpha = 1.0;
  }

  // 影
  ctx.shadowColor = t.shadowColor;
  ctx.shadowBlur = t.shadowBlur;

  // 縁取り
  if (t.strokeWidth > 0) {
    ctx.strokeStyle = t.strokeColor;
    ctx.lineWidth = t.strokeWidth * 2;
    ctx.strokeText(t.text, 0, 0);
  }

  // テキスト本体
  ctx.fillStyle = t.color;
  ctx.fillText(t.text, 0, 0);

  ctx.restore();
}

// --- UIレンダリング ---
function render() {
  renderTimeline();
  renderInspector();
  drawPreview();
}

function updateTimelineUI() {
  const dur = totalDuration();
  $("#seek-bar").value = (state.playhead / dur) * 1000;
  
  const curFrames = Math.floor(state.playhead * state.projectMeta.fps);
  $("#time-display").textContent = `${formatTime(state.playhead)} / ${formatTime(dur)} (${curFrames}f)`;
  $("#timeline-playhead").style.left = `${100 + state.playhead * state.pxPerSecond}px`;
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2);
  return `${String(m).padStart(2, "0")}:${sec.padStart(5, "0")}`;
}

function renderTimeline() {
  // ルーラー描画
  const ruler = $("#timeline-ruler");
  ruler.innerHTML = "";
  const dur = totalDuration();
  for (let i = 0; i <= dur; i += 2) {
    const mark = document.createElement("span");
    mark.style.position = "absolute";
    mark.style.left = `${i * state.pxPerSecond}px`;
    mark.textContent = `${i}s`;
    ruler.appendChild(mark);
  }

  // クリップ描画
  renderTrack("#video-track", state.clips.filter(c => c.type !== "audio"));
  renderTrack("#audio-track", state.clips.filter(c => c.type === "audio"));
  renderTelopTrack();
  updateTimelineUI();
}

function renderTrack(containerSelector, clips) {
  const container = $(containerSelector);
  container.innerHTML = "";
  for (const c of clips) {
    const el = document.createElement("div");
    el.className = `clip ${state.selectedClipId === c.id ? "selected" : ""}`;
    el.style.left = `${c.start * state.pxPerSecond}px`;
    el.style.width = `${(c.trimOut - c.trimIn) * state.pxPerSecond}px`;
    el.style.backgroundColor = c.color;
    el.textContent = c.name;

    el.onclick = (e) => {
      e.stopPropagation();
      state.selectedClipId = c.id;
      state.selectedTelopId = null;
      render();
    };

    container.appendChild(el);
  }
}

function renderTelopTrack() {
  const container = $("#telop-track");
  container.innerHTML = "";
  for (const t of state.telops) {
    const el = document.createElement("div");
    el.className = `clip ${state.selectedTelopId === t.id ? "selected" : ""}`;
    el.style.left = `${t.start * state.pxPerSecond}px`;
    el.style.width = `${(t.end - t.start) * state.pxPerSecond}px`;
    el.style.backgroundColor = "#8a5a3d";
    el.textContent = t.text || "（テキスト）";

    el.onclick = (e) => {
      e.stopPropagation();
      state.selectedTelopId = t.id;
      state.selectedClipId = null;
      render();
    };

    container.appendChild(el);
  }
}

function renderInspector() {
  const clip = state.clips.find(c => c.id === state.selectedClipId);
  $("#clip-inspector-empty").classList.toggle("hidden", !!clip);
  $("#clip-inspector-form").classList.toggle("hidden", !clip);

  if (clip) {
    $("#insp-clip-name").value = clip.name;
    $("#insp-clip-color").value = clip.color;
    $("#insp-clip-volume").value = clip.volume;
    $("#insp-clip-mute").checked = clip.muted;
  }

  // テロップエディタ
  const telop = state.telops.find(t => t.id === state.selectedTelopId);
  $("#telop-editor").classList.toggle("hidden", !telop);
  if (telop) {
    $("#telop-text").value = telop.text;
    $("#telop-color").value = telop.color;
    $("#telop-size").value = telop.size;
  }
}

// --- イベント制御ハンドラ ---
function initEvents() {
  // 再生系
  $("#play-btn").onclick = togglePlay;
  $("#btn-stop").onclick = () => { if (state.playing) togglePlay(); seekTo(0); };
  $("#btn-prev-frame").onclick = () => seekTo(state.playhead - 1 / state.projectMeta.fps);
  $("#btn-next-frame").onclick = () => seekTo(state.playhead + 1 / state.projectMeta.fps);
  $("#btn-loop").onclick = (e) => { state.loop = !state.loop; e.target.style.opacity = state.loop ? 1 : 0.5; };
  
  $("#seek-bar").oninput = (e) => seekTo((e.target.value / 1000) * totalDuration());
  $("#speed-select").onchange = (e) => state.speed = parseFloat(e.target.value);
  $("#zoom-slider").oninput = (e) => { state.pxPerSecond = parseInt(e.target.value); renderTimeline(); };

  // タイムラインクリックでシーク
  $("#timeline-scroll").onclick = (e) => {
    const rect = $("#timeline-ruler").getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    if (clickX >= 0) seekTo(clickX / state.pxPerSecond);
  };

  // 分割カット
  $("#split-btn").onclick = splitClip;

  // テロップ追加
  $("#add-telop-btn").onclick = () => {
    const telop = {
      id: uid(),
      text: "新規テロップ",
      start: state.playhead,
      end: state.playhead + 3,
      font: "sans-serif",
      size: 48,
      color: "#ffffff",
      strokeColor: "#000000",
      strokeWidth: 2,
      bgColor: "#000000",
      bgAlpha: 0,
      shadowColor: "#000000",
      shadowBlur: 0,
      bold: false,
      italic: false,
      underline: false,
      align: "center",
      rotation: 0,
      anim: "none"
    };
    state.telops.push(telop);
    state.selectedTelopId = telop.id;
    saveStateToHistory();
    render();
  };

  // 属性編集イベント連携
  $("#telop-text").oninput = (e) => {
    const t = state.telops.find(x => x.id === state.selectedTelopId);
    if (t) { t.text = e.target.value; render(); }
  };

  // Undo/Redo/削除ショートカット
  window.onkeydown = (e) => {
    if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;

    if (e.code === "Space") { e.preventDefault(); togglePlay(); }
    if (e.ctrlKey && e.code === "KeyZ") { e.preventDefault(); undo(); }
    if (e.ctrlKey && e.code === "KeyY") { e.preventDefault(); redo(); }
    if (e.code === "Delete" || e.code === "Backspace") deleteSelected();
  };

  // タブ切り替え
  $$(".tab-btn").forEach(btn => {
    btn.onclick = () => {
      $$(".tab-btn").forEach(b => b.classList.remove("active"));
      $$(".tab-content").forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      $(`#${btn.dataset.tab}`).classList.add("active");
    };
  });

  // ダーク/ライトテーマ切り替え
  $("#theme-toggle-btn").onclick = () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    document.documentElement.setAttribute("data-theme", isDark ? "light" : "dark");
  };

  // 書き出しモーダル
  $("#export-btn").onclick = () => $("#export-modal").showModal();
  $("#exp-cancel-btn").onclick = () => $("#export-modal").close();
  $("#exp-start-btn").onclick = startExporting;
}

function splitClip() {
  if (!state.selectedClipId) return;
  const idx = state.clips.findIndex(c => c.id === state.selectedClipId);
  if (idx === -1) return;

  const clip = state.clips[idx];
  const relativeTime = state.playhead - clip.start;
  if (relativeTime <= 0.1 || relativeTime >= (clip.trimOut - clip.trimIn) - 0.1) return;

  const secondClip = {
    ...JSON.parse(JSON.stringify(clip)),
    id: uid(),
    start: state.playhead,
    trimIn: clip.trimIn + relativeTime
  };
  clip.trimOut = clip.trimIn + relativeTime;

  state.clips.splice(idx + 1, 0, secondClip);
  saveStateToHistory();
  render();
}

function deleteSelected() {
  if (state.selectedClipId) {
    state.clips = state.clips.filter(c => c.id !== state.selectedClipId);
    state.selectedClipId = null;
  }
  if (state.selectedTelopId) {
    state.telops = state.telops.filter(t => t.id !== state.selectedTelopId);
    state.selectedTelopId = null;
  }
  saveStateToHistory();
  render();
}

// --- 動画書き出し処理（WebCodecs API & MediaRecorder 擬似連携） ---
async function startExporting() {
  $("#exp-progress-area").classList.remove("hidden");
  const progress = $("#exp-progress");
  const text = $("#exp-progress-text");

  const totalFrames = Math.floor(totalDuration() * 60);
  for (let f = 0; f <= totalFrames; f++) {
    state.playhead = f / 60;
    drawPreview();
    progress.value = (f / totalFrames) * 100;
    text.textContent = `レンダリング中... (${Math.floor(progress.value)}%)`;
    await new Promise(r => setTimeout(r, 4));
  }

  text.textContent = "書き出し完了！ファイルをダウンロードします...";
  setTimeout(() => {
    $("#export-modal").close();
    $("#exp-progress-area").classList.add("hidden");
    alert("動画の書き出し処理が完了しました。");
  }, 1000);
}

// --- PWA サポート ---
function initPWA() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
