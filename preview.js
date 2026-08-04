import { state, totalDuration, clipAtGlobalTime } from "./state.js";

const videoEl = document.getElementById("preview-video");
const canvas = document.getElementById("preview-canvas");
const ctx = canvas.getContext("2d");
const playBtn = document.getElementById("play-btn");
const seekBar = document.getElementById("seek-bar");
const timeDisplay = document.getElementById("time-display");
const dropHint = document.getElementById("drop-hint");
const bgmAudio = new Audio();

let isPlaying = false;
let rafId = null;
let currentClipId = null;
let onSeekExternal = () => {};

canvas.width = 960;
canvas.height = 540;

export function initPreview({ onSeek }) {
  onSeekExternal = onSeek;

  playBtn.addEventListener("click", togglePlay);

  seekBar.addEventListener("input", () => {
    const dur = totalDuration();
    const t = (seekBar.value / 1000) * dur;
    seekTo(t);
  });

  videoEl.addEventListener("ended", () => {
    // 次のクリップへ、または全体終了
    if (isPlaying) advanceOrStop();
  });
}

function formatT(sec) {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1).padStart(4, "0");
  return `${String(m).padStart(2, "0")}:${s}`;
}

function loadClipIfNeeded(clip, localTime) {
  if (currentClipId !== clip.id) {
    videoEl.src = clip.url;
    currentClipId = clip.id;
  }
  if (Math.abs(videoEl.currentTime - localTime) > 0.15) {
    videoEl.currentTime = localTime;
  }
}

export function seekTo(t) {
  const dur = totalDuration();
  state.playhead = Math.max(0, Math.min(t, dur));

  const found = clipAtGlobalTime(state.playhead);
  if (found) {
    loadClipIfNeeded(found.clip, found.localTime);
  }

  if (state.bgm) {
    bgmAudio.src = state.bgm.url;
    bgmAudio.volume = state.bgm.volume;
    if (Math.abs(bgmAudio.currentTime - state.playhead) > 0.15) {
      bgmAudio.currentTime = Math.min(state.playhead, state.bgm.duration);
    }
  }

  updateUI();
  drawFrame();
  onSeekExternal();
}

function togglePlay() {
  if (state.clips.length === 0) return;
  isPlaying = !isPlaying;
  playBtn.textContent = isPlaying ? "❚❚" : "▶";
  if (isPlaying) {
    videoEl.play().catch(() => {});
    if (state.bgm) bgmAudio.play().catch(() => {});
    loop();
  } else {
    videoEl.pause();
    bgmAudio.pause();
    cancelAnimationFrame(rafId);
  }
}

function advanceOrStop() {
  const dur = totalDuration();
  if (state.playhead >= dur - 0.05) {
    isPlaying = false;
    playBtn.textContent = "▶";
    cancelAnimationFrame(rafId);
    state.playhead = 0;
    seekTo(0);
  }
}

function loop() {
  if (!isPlaying) return;

  const found = clipAtGlobalTime(state.playhead);
  if (found) {
    loadClipIfNeeded(found.clip, found.localTime);
    const clipGlobalStart = state.playhead - (videoEl.currentTime - found.clip.trimIn);
    state.playhead = clipGlobalStart + (videoEl.currentTime - found.clip.trimIn);

    if (videoEl.currentTime >= found.clip.trimOut - 0.03) {
      // このクリップの終わりに到達 → 次のクリップへ切り替え
      const nextGlobal = state.playhead + 0.05;
      state.playhead = nextGlobal;
      const nextFound = clipAtGlobalTime(state.playhead);
      if (nextFound) {
        loadClipIfNeeded(nextFound.clip, nextFound.localTime);
        videoEl.play().catch(() => {});
      }
    }
  }

  updateUI();
  drawFrame();
  advanceOrStop();

  if (isPlaying) rafId = requestAnimationFrame(loop);
}

function updateUI() {
  const dur = totalDuration();
  seekBar.value = Math.round((state.playhead / dur) * 1000);
  timeDisplay.textContent = `${formatT(state.playhead)} / ${formatT(dur)}`;
}

function drawFrame() {
  const hasContent = state.clips.length > 0;
  dropHint.classList.toggle("hidden", hasContent);
  if (!hasContent) return;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (videoEl.readyState >= 2) {
    const vw = videoEl.videoWidth || 16;
    const vh = videoEl.videoHeight || 9;
    const scale = Math.min(canvas.width / vw, canvas.height / vh);
    const w = vw * scale;
    const h = vh * scale;
    ctx.drawImage(videoEl, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  }

  // テロップ描画
  for (const t of state.telops) {
    if (state.playhead >= t.start && state.playhead <= t.end) {
      drawTelop(t);
    }
  }
}

function drawTelop(t) {
  ctx.font = `600 ${t.size}px sans-serif`;
  ctx.fillStyle = t.color;
  ctx.textAlign = "center";
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = Math.max(2, t.size / 12);

  const lines = t.text.split("\n");
  let y;
  if (t.position === "top") y = canvas.height * 0.12 + t.size;
  else if (t.position === "bottom") y = canvas.height * 0.88 - (lines.length - 1) * t.size * 1.2;
  else y = canvas.height / 2 - ((lines.length - 1) * t.size * 1.2) / 2;

  for (const line of lines) {
    ctx.strokeText(line, canvas.width / 2, y);
    ctx.fillText(line, canvas.width / 2, y);
    y += t.size * 1.2;
  }
}

export function refreshPreviewStatic() {
  // タイムライン編集直後などに、再生していなくても現在フレームを再描画する
  const found = clipAtGlobalTime(state.playhead);
  if (found) loadClipIfNeeded(found.clip, found.localTime);
  updateUI();
  drawFrame();
}

videoEl.addEventListener("seeked", drawFrame);
videoEl.addEventListener("loadeddata", drawFrame);
