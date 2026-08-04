"use strict";

const state = {
  clips: [],
  telops: [],
  bgm: null,
  playhead: 0,
  selectedClipId: null,
  selectedTelopId: null,
  pxPerSecond: 60,
  playing: false
};

const $ = (selector) => document.querySelector(selector);
const uid = () => Math.random().toString(36).slice(2, 10);

const videoInput = $("#video-input");
const bgmInput = $("#bgm-input");
const previewStage = $("#preview-stage");
const video = $("#preview-video");
const canvas = $("#preview-canvas");
const ctx = canvas.getContext("2d");
const dropHint = $("#drop-hint");
const playBtn = $("#play-btn");
const seekBar = $("#seek-bar");
const timeDisplay = $("#time-display");
const videoTrack = $("#video-track");
const telopTrack = $("#telop-track");
const bgmTrack = $("#bgm-track");
const ruler = $("#timeline-ruler");
const playhead = $("#timeline-playhead");
const zoomSlider = $("#zoom-slider");
const telopList = $("#telop-list");
const telopEditor = $("#telop-editor");
const telopText = $("#telop-text");
const telopStart = $("#telop-start");
const telopEnd = $("#telop-end");
const telopPosition = $("#telop-position");
const telopColor = $("#telop-color");
const telopSize = $("#telop-size");
const bgmAudio = new Audio();

let currentClipId = null;
let animationId = null;

function totalDuration() {
  const videoDuration = state.clips.reduce((sum, clip) => sum + clip.trimOut - clip.trimIn, 0);
  const telopDuration = state.telops.reduce((max, telop) => Math.max(max, telop.end), 0);
  const bgmDuration = state.bgm ? state.bgm.duration : 0;
  return Math.max(videoDuration, telopDuration, bgmDuration, 0.1);
}

function formatTime(seconds) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safe / 60);
  const secs = (safe % 60).toFixed(1).padStart(4, "0");
  return `${String(minutes).padStart(2, "0")}:${secs}`;
}

function clipAtTime(time) {
  let cursor = 0;
  for (const clip of state.clips) {
    const length = clip.trimOut - clip.trimIn;
    if (time < cursor + length) {
      return {
        clip,
        clipStart: cursor,
        localTime: clip.trimIn + (time - cursor)
      };
    }
    cursor += length;
  }
  return null;
}

function clipStartTime(id) {
  let cursor = 0;
  for (const clip of state.clips) {
    if (clip.id === id) return cursor;
    cursor += clip.trimOut - clip.trimIn;
  }
  return 0;
}

function loadMediaDuration(url, type) {
  return new Promise((resolve, reject) => {
    const element = document.createElement(type);
    element.preload = "metadata";
    element.src = url;
    element.onloadedmetadata = () => resolve(element.duration);
    element.onerror = () => reject(new Error("メディアを読み込めませんでした"));
  });
}

async function addVideos(fileList) {
  const files = [...fileList].filter((file) => file.type.startsWith("video/"));

  for (const file of files) {
    const url = URL.createObjectURL(file);
    try {
      const duration = await loadMediaDuration(url, "video");
      state.clips.push({
        id: uid(),
        file,
        url,
        name: file.name,
        duration,
        trimIn: 0,
        trimOut: duration
      });
    } catch (error) {
      URL.revokeObjectURL(url);
      alert(`${file.name} を読み込めませんでした。非対応の形式（HEVCやMOV等）の可能性があります。`);
      console.error(error);
    }
  }

  refreshAll();
  seekTo(state.playhead);
}

async function addBgm(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);

  try {
    const duration = await loadMediaDuration(url, "audio");
    if (state.bgm) URL.revokeObjectURL(state.bgm.url);
    state.bgm = { file, url, duration, volume: 0.6 };
    bgmAudio.src = url;
    bgmAudio.volume = state.bgm.volume;
    refreshAll();
  } catch (error) {
    URL.revokeObjectURL(url);
    alert("BGMを読み込めませんでした。");
    console.error(error);
  }
}

// 修正点: 動画ソース切替・シーク時の読み込み処理を強化
function loadCurrentClip(found) {
  if (!found) return;

  if (currentClipId !== found.clip.id) {
    video.src = found.clip.url;
    currentClipId = found.clip.id;
    video.load(); // 明示的に動画データを読み込み開始
  }

  if (Math.abs(video.currentTime - found.localTime) > 0.05) {
    video.currentTime = found.localTime;
  } else {
    drawFrame();
  }
}

function seekTo(time) {
  const duration = totalDuration();
  state.playhead = Math.max(0, Math.min(time, duration));

  const found = clipAtTime(state.playhead);
  if (found) {
    loadCurrentClip(found);
  } else {
    currentClipId = null;
    video.removeAttribute("src");
    video.load();
  }

  if (state.bgm) {
    bgmAudio.currentTime = Math.min(state.playhead, Math.max(0, state.bgm.duration - 0.01));
  }

  updatePreviewUi();
  drawFrame();
  renderTimeline();
}

function drawFrame() {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const hasVideo = state.clips.length > 0;
  dropHint.classList.toggle("hidden", hasVideo);
  if (!hasVideo) return;

  // 動画データの準備（readyState >= 2: HAVE_CURRENT_DATA）ができている場合に描画
  if (video.readyState >= 2) {
    const videoWidth = video.videoWidth || 16;
    const videoHeight = video.videoHeight || 9;
    const scale = Math.min(canvas.width / videoWidth, canvas.height / videoHeight);
    const width = videoWidth * scale;
    const height = videoHeight * scale;
    ctx.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  }

  for (const telop of state.telops) {
    if (state.playhead >= telop.start && state.playhead <= telop.end) {
      drawTelop(telop);
    }
  }
}

function drawTelop(telop) {
  ctx.font = `700 ${telop.size}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillStyle = telop.color;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
  ctx.lineWidth = Math.max(3, telop.size / 10);
  ctx.lineJoin = "round";

  const lines = telop.text.split("\n");
  const lineHeight = telop.size * 1.2;
  let y;

  if (telop.position === "top") {
    y = canvas.height * 0.12 + telop.size;
  } else if (telop.position === "bottom") {
    y = canvas.height * 0.88 - (lines.length - 1) * lineHeight;
  } else {
    y = canvas.height / 2 - ((lines.length - 1) * lineHeight) / 2;
  }

  for (const line of lines) {
    ctx.strokeText(line, canvas.width / 2, y);
    ctx.fillText(line, canvas.width / 2, y);
    y += lineHeight;
  }
}

function updatePreviewUi() {
  const duration = totalDuration();
  seekBar.value = Math.round((state.playhead / duration) * 1000);
  timeDisplay.textContent = `${formatTime(state.playhead)} / ${formatTime(duration)}`;
  playBtn.textContent = state.playing ? "❚❚" : "▶";
}

function togglePlayback() {
  if (state.clips.length === 0) return;
  state.playing = !state.playing;

  if (state.playing) {
    const found = clipAtTime(state.playhead) || clipAtTime(0);
    if (!found) return;
    loadCurrentClip(found);
    video.play().catch(console.error);
    if (state.bgm) bgmAudio.play().catch(() => {});
    playbackLoop();
  } else {
    stopPlayback(false);
  }

  updatePreviewUi();
}

function stopPlayback(reset) {
  state.playing = false;
  video.pause();
  bgmAudio.pause();
  cancelAnimationFrame(animationId);
  if (reset) seekTo(0);
  updatePreviewUi();
}

function playbackLoop() {
  if (!state.playing) return;

  const found = clipAtTime(state.playhead);
  if (!found) {
    stopPlayback(true);
    return;
  }

  if (currentClipId !== found.clip.id) {
    loadCurrentClip(found);
    video.play().catch(console.error);
  }

  state.playhead = found.clipStart + Math.max(0, video.currentTime - found.clip.trimIn);

  if (video.currentTime >= found.clip.trimOut - 0.03) {
    const nextTime = found.clipStart + (found.clip.trimOut - found.clip.trimIn) + 0.001;
    const next = clipAtTime(nextTime);

    if (next) {
      state.playhead = nextTime;
      loadCurrentClip(next);
      video.play().catch(console.error);
    } else {
      stopPlayback(true);
      return;
    }
  }

  updatePreviewUi();
  drawFrame();
  renderTimeline();
  animationId = requestAnimationFrame(playbackLoop);
}

function renderTimeline() {
  renderRuler();
  renderVideoTrack();
  renderTelopTrack();
  renderBgmTrack();
  playhead.style.left = `${102 + state.playhead * state.pxPerSecond}px`;
}

function renderRuler() {
  ruler.innerHTML = "";
  const duration = totalDuration();
  const step = state.pxPerSecond < 40 ? 10 : state.pxPerSecond < 100 ? 5 : 1;

  for (let second = 0; second <= duration + step; second += step) {
    const mark = document.createElement("span");
    mark.style.position = "absolute";
    mark.style.left = `${second * state.pxPerSecond}px`;
    mark.style.top = "2px";
    mark.textContent = formatTime(second).slice(0, 5);
    ruler.appendChild(mark);
  }

  ruler.style.width = `${Math.max(600, duration * state.pxPerSecond + 40)}px`;
}

function renderVideoTrack() {
  videoTrack.innerHTML = "";
  let cursor = 0;

  for (const clip of state.clips) {
    const length = clip.trimOut - clip.trimIn;
    const element = document.createElement("div");
    element.className = `clip video-clip${state.selectedClipId === clip.id ? " selected" : ""}`;
    element.style.left = `${cursor * state.pxPerSecond}px`;
    element.style.width = `${Math.max(5, length * state.pxPerSecond)}px`;
    element.textContent = clip.name;
    element.title = `${clip.name}\n${formatTime(length)}`;

    element.addEventListener("click", (event) => {
      event.stopPropagation();
      state.selectedClipId = clip.id;
      state.selectedTelopId = null;
      renderTimeline();
      renderTelopPanel();
    });

    videoTrack.appendChild(element);
    cursor += length;
  }

  videoTrack.style.width = `${Math.max(600, cursor * state.pxPerSecond + 40)}px`;
}

function renderTelopTrack() {
  telopTrack.innerHTML = "";

  for (const telop of state.telops) {
    const element = document.createElement("div");
    element.className = `clip telop-clip${state.selectedTelopId === telop.id ? " selected" : ""}`;
    element.style.left = `${telop.start * state.pxPerSecond}px`;
    element.style.width = `${Math.max(5, (telop.end - telop.start) * state.pxPerSecond)}px`;
    element.textContent = telop.text || "（空）";

    element.addEventListener("click", (event) => {
      event.stopPropagation();
      state.selectedTelopId = telop.id;
      state.selectedClipId = null;
      renderTimeline();
      renderTelopPanel();
    });

    telopTrack.appendChild(element);
  }

  telopTrack.style.width = `${Math.max(600, totalDuration() * state.pxPerSecond + 40)}px`;
}

function renderBgmTrack() {
  bgmTrack.innerHTML = "";
  if (!state.bgm) return;

  const element = document.createElement("div");
  element.className = "clip bgm-clip";
  element.style.left = "0px";
  element.style.width = `${Math.max(5, state.bgm.duration * state.pxPerSecond)}px`;
  element.textContent = state.bgm.file.name;
  bgmTrack.appendChild(element);
  bgmTrack.style.width = `${Math.max(600, state.bgm.duration * state.pxPerSecond + 40)}px`;
}

function addTelop() {
  const telop = {
    id: uid(),
    text: "テキストを入力",
    start: state.playhead,
    end: state.playhead + 3,
    position: "center",
    color: "#ffffff",
    size: 48
  };

  state.telops.push(telop);
  state.selectedTelopId = telop.id;
  state.selectedClipId = null;
  refreshAll();
}

function selectedTelop() {
  return state.telops.find((telop) => telop.id === state.selectedTelopId) || null;
}

function renderTelopPanel() {
  telopList.innerHTML = "";

  for (const telop of state.telops) {
    const item = document.createElement("div");
    item.className = `telop-item${state.selectedTelopId === telop.id ? " selected" : ""}`;
    item.textContent = `${telop.text.slice(0, 18) || "（空）"}  ${telop.start.toFixed(1)}〜${telop.end.toFixed(1)}秒`;

    item.addEventListener("click", () => {
      state.selectedTelopId = telop.id;
      state.selectedClipId = null;
      renderTelopPanel();
      renderTimeline();
    });

    telopList.appendChild(item);
  }

  const telop = selectedTelop();
  telopEditor.classList.toggle("hidden", !telop);
  if (!telop) return;

  telopText.value = telop.text;
  telopStart.value = telop.start.toFixed(1);
  telopEnd.value = telop.end.toFixed(1);
  telopPosition.value = telop.position;
  telopColor.value = telop.color;
  telopSize.value = telop.size;
}

function updateSelectedTelop() {
  const telop = selectedTelop();
  if (!telop) return;

  telop.text = telopText.value;
  telop.start = Math.max(0, Number(telopStart.value) || 0);
  telop.end = Math.max(telop.start + 0.1, Number(telopEnd.value) || telop.start + 1);
  telop.position = telopPosition.value;
  telop.color = telopColor.value;
  telop.size = Number(telopSize.value) || 48;

  renderTelopPanel();
  renderTimeline();
  drawFrame();
  updatePreviewUi();
}

function splitSelectedClip() {
  if (!state.selectedClipId) {
    alert("先に映像トラックの動画を選択してください。");
    return;
  }

  const index = state.clips.findIndex((clip) => clip.id === state.selectedClipId);
  if (index === -1) return;

  const clip = state.clips[index];
  const localPosition = state.playhead - clipStartTime(clip.id);
  const splitPoint = clip.trimIn + localPosition;

  if (splitPoint <= clip.trimIn + 0.05 || splitPoint >= clip.trimOut - 0.05) {
    alert("動画の途中に再生位置を移動してからカットしてください。");
    return;
  }

  const secondHalf = {
    ...clip,
    id: uid(),
    trimIn: splitPoint
  };

  clip.trimOut = splitPoint;
  state.clips.splice(index + 1, 0, secondHalf);
  state.selectedClipId = secondHalf.id;
  refreshAll();
}

function deleteSelectedClip() {
  if (!state.selectedClipId) {
    alert("削除する動画を選択してください。");
    return;
  }

  state.clips = state.clips.filter((clip) => clip.id !== state.selectedClipId);
  state.selectedClipId = null;
  state.playhead = Math.min(state.playhead, totalDuration());
  currentClipId = null;
  refreshAll();
  seekTo(state.playhead);
}

function deleteSelectedTelop() {
  if (!state.selectedTelopId) return;
  state.telops = state.telops.filter((telop) => telop.id !== state.selectedTelopId);
  state.selectedTelopId = null;
  refreshAll();
}

function refreshAll() {
  renderTimeline();
  renderTelopPanel();
  updatePreviewUi();
  drawFrame();
}

videoInput.addEventListener("change", (event) => {
  addVideos(event.target.files);
  videoInput.value = "";
});

bgmInput.addEventListener("change", (event) => {
  addBgm(event.target.files[0]);
  bgmInput.value = "";
});

playBtn.addEventListener("click", togglePlayback);
seekBar.addEventListener("input", () => seekTo((Number(seekBar.value) / 1000) * totalDuration()));
zoomSlider.addEventListener("input", () => {
  state.pxPerSecond = Number(zoomSlider.value);
  renderTimeline();
});

ruler.addEventListener("click", (event) => {
  const rect = ruler.getBoundingClientRect();
  seekTo((event.clientX - rect.left) / state.pxPerSecond);
});

$("#add-telop-btn").addEventListener("click", addTelop);
$("#delete-telop-btn").addEventListener("click", deleteSelectedTelop);
$("#split-btn").addEventListener("click", splitSelectedClip);
$("#delete-clip-btn").addEventListener("click", deleteSelectedClip);
$("#export-btn").addEventListener("click", () => alert("MP4書き出し機能は次の段階で追加します。"));

[telopText, telopStart, telopEnd, telopPosition, telopColor, telopSize].forEach((input) => {
  input.addEventListener("input", updateSelectedTelop);
});

["dragenter", "dragover"].forEach((eventName) => {
  previewStage.addEventListener(eventName, (event) => {
    event.preventDefault();
    previewStage.classList.add("drag-active");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  previewStage.addEventListener(eventName, (event) => {
    event.preventDefault();
    previewStage.classList.remove("drag-active");
  });
});

previewStage.addEventListener("drop", (event) => {
  if (event.dataTransfer.files.length) addVideos(event.dataTransfer.files);
});

// 修正点: 動画読み込み・シーク完了時のイベントハンドラを網羅・補強
video.addEventListener("loadedmetadata", drawFrame);
video.addEventListener("loadeddata", drawFrame);
video.addEventListener("canplay", drawFrame);
video.addEventListener("seeked", drawFrame);

window.addEventListener("keydown", (event) => {
  const active = document.activeElement;
  const editingText = active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName);
  if (editingText) return;

  if (event.code === "Space") {
    event.preventDefault();
    togglePlayback();
  }

  if (event.key === "Delete" || event.key === "Backspace") {
    if (state.selectedClipId) deleteSelectedClip();
    else if (state.selectedTelopId) deleteSelectedTelop();
  }
});

refreshAll();
