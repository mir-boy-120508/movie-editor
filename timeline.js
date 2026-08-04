import { state, totalDuration, splitClipAt, removeClip, removeTelop, globalStartOfClip } from "./state.js";

const videoTrack = document.getElementById("video-track");
const telopTrack = document.getElementById("telop-track");
const bgmTrack = document.getElementById("bgm-track");
const ruler = document.getElementById("timeline-ruler");
const playheadEl = document.getElementById("timeline-playhead");
const scrollEl = document.getElementById("timeline-scroll");
const zoomSlider = document.getElementById("zoom-slider");

let onSeek = () => {};
let onSelectionChange = () => {};

export function initTimeline({ seekCallback, selectionCallback }) {
  onSeek = seekCallback;
  onSelectionChange = selectionCallback;

  zoomSlider.addEventListener("input", () => {
    state.pxPerSecond = Number(zoomSlider.value);
    renderTimeline();
  });

  ruler.addEventListener("click", (e) => {
    const rect = ruler.getBoundingClientRect();
    const t = (e.clientX - rect.left) / state.pxPerSecond;
    onSeek(Math.max(0, t));
  });
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function px(sec) {
  return sec * state.pxPerSecond;
}

function makeResizable(el, clip, side) {
  const handle = document.createElement("div");
  handle.className = `clip-handle ${side}`;
  handle.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startIn = clip.trimIn;
    const startOut = clip.trimOut;

    function onMove(ev) {
      const dx = (ev.clientX - startX) / state.pxPerSecond;
      if (side === "left") {
        clip.trimIn = Math.min(Math.max(0, startIn + dx), clip.trimOut - 0.1);
      } else {
        clip.trimOut = Math.max(Math.min(clip.sourceDuration, startOut + dx), clip.trimIn + 0.1);
      }
      renderTimeline();
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
  el.appendChild(handle);
}

function renderVideoTrack() {
  videoTrack.innerHTML = "";
  let cursor = 0;
  for (const clip of state.clips) {
    const len = clip.trimOut - clip.trimIn;
    const el = document.createElement("div");
    el.className = "clip video-clip" + (state.selectedClipId === clip.id ? " selected" : "");
    el.style.left = px(cursor) + "px";
    el.style.width = Math.max(4, px(len)) + "px";
    el.textContent = clip.name;
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      state.selectedClipId = clip.id;
      state.selectedTelopId = null;
      renderTimeline();
      onSelectionChange();
    });
    makeResizable(el, clip, "left");
    makeResizable(el, clip, "right");
    videoTrack.appendChild(el);
    cursor += len;
  }
  videoTrack.style.width = Math.max(600, px(cursor) + 40) + "px";
}

function renderTelopTrack() {
  telopTrack.innerHTML = "";
  for (const t of state.telops) {
    const el = document.createElement("div");
    el.className = "clip telop-clip" + (state.selectedTelopId === t.id ? " selected" : "");
    el.style.left = px(t.start) + "px";
    el.style.width = Math.max(4, px(t.end - t.start)) + "px";
    el.textContent = t.text.slice(0, 20);
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      state.selectedTelopId = t.id;
      state.selectedClipId = null;
      renderTimeline();
      onSelectionChange();
    });

    const leftHandle = document.createElement("div");
    leftHandle.className = "clip-handle left";
    leftHandle.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const startX = e.clientX;
      const startVal = t.start;
      function onMove(ev) {
        const dx = (ev.clientX - startX) / state.pxPerSecond;
        t.start = Math.max(0, Math.min(startVal + dx, t.end - 0.1));
        renderTimeline();
      }
      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        onSelectionChange();
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });

    const rightHandle = document.createElement("div");
    rightHandle.className = "clip-handle right";
    rightHandle.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const startX = e.clientX;
      const startVal = t.end;
      function onMove(ev) {
        const dx = (ev.clientX - startX) / state.pxPerSecond;
        t.end = Math.max(t.start + 0.1, startVal + dx);
        renderTimeline();
      }
      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        onSelectionChange();
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });

    el.appendChild(leftHandle);
    el.appendChild(rightHandle);
    telopTrack.appendChild(el);
  }
}

function renderBgmTrack() {
  bgmTrack.innerHTML = "";
  if (!state.bgm) return;
  const el = document.createElement("div");
  el.className = "clip bgm-clip";
  el.style.left = "0px";
  el.style.width = Math.max(4, px(state.bgm.duration)) + "px";
  el.textContent = state.bgm.file.name;
  bgmTrack.appendChild(el);
}

function renderRuler() {
  ruler.innerHTML = "";
  const dur = totalDuration();
  const step = state.pxPerSecond < 40 ? 10 : state.pxPerSecond < 100 ? 5 : 1;
  for (let s = 0; s <= dur + step; s += step) {
    const mark = document.createElement("span");
    mark.style.position = "absolute";
    mark.style.left = px(s) + "px";
    mark.style.top = "2px";
    mark.textContent = formatTime(s);
    ruler.appendChild(mark);
  }
  ruler.style.width = Math.max(600, px(dur) + 40) + "px";
}

export function renderTimeline() {
  renderRuler();
  renderVideoTrack();
  renderTelopTrack();
  renderBgmTrack();
  playheadEl.style.left = 90 + px(state.playhead) + "px";
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Delete" || e.key === "Backspace") {
    const active = document.activeElement;
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
    if (state.selectedClipId) {
      removeClip(state.selectedClipId);
      renderTimeline();
      onSelectionChange();
    } else if (state.selectedTelopId) {
      removeTelop(state.selectedTelopId);
      renderTimeline();
      onSelectionChange();
    }
  }
});

export function splitSelectedClipAtPlayhead() {
  if (!state.selectedClipId) {
    alert("先に映像トラックのクリップを選択してください。");
    return;
  }
  const clip = state.clips.find((c) => c.id === state.selectedClipId);
  const clipStart = globalStartOfClip(clip.id);
  const localTime = state.playhead - clipStart;
  splitClipAt(clip.id, localTime);
  renderTimeline();
}
