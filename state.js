// アプリ全体の状態を一箇所で管理するシンプルなストア

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export const state = {
  clips: [],        // { id, file, url, duration, trimIn, trimOut, sourceDuration, name }
  telops: [],        // { id, text, start, end, position, color, size }
  bgm: null,          // { file, url, duration, volume }
  playhead: 0,          // 現在の再生位置(秒・タイムライン全体基準)
  selectedClipId: null,
  selectedTelopId: null,
  pxPerSecond: 60,
};

export function totalDuration() {
  const clipsEnd = state.clips.reduce((sum, c) => sum + (c.trimOut - c.trimIn), 0);
  const telopsEnd = state.telops.reduce((max, t) => Math.max(max, t.end), 0);
  const bgmEnd = state.bgm ? state.bgm.duration : 0;
  return Math.max(clipsEnd, telopsEnd, bgmEnd, 0.1);
}

export function addClip(file, url, duration) {
  const clip = {
    id: uid(),
    file,
    url,
    name: file.name,
    sourceDuration: duration,
    trimIn: 0,
    trimOut: duration,
  };
  state.clips.push(clip);
  return clip;
}

export function removeClip(id) {
  state.clips = state.clips.filter((c) => c.id !== id);
  if (state.selectedClipId === id) state.selectedClipId = null;
}

export function splitClipAt(clipId, localTime) {
  const idx = state.clips.findIndex((c) => c.id === clipId);
  if (idx === -1) return;
  const clip = state.clips[idx];
  const splitPoint = clip.trimIn + localTime;
  if (splitPoint <= clip.trimIn + 0.05 || splitPoint >= clip.trimOut - 0.05) return;

  const secondHalf = {
    id: uid(),
    file: clip.file,
    url: clip.url,
    name: clip.name,
    sourceDuration: clip.sourceDuration,
    trimIn: splitPoint,
    trimOut: clip.trimOut,
  };
  clip.trimOut = splitPoint;
  state.clips.splice(idx + 1, 0, secondHalf);
}

export function addTelop() {
  const t = {
    id: uid(),
    text: "テキストを入力",
    start: state.playhead,
    end: state.playhead + 3,
    position: "center",
    color: "#ffffff",
    size: 48,
  };
  state.telops.push(t);
  state.selectedTelopId = t.id;
  return t;
}

export function removeTelop(id) {
  state.telops = state.telops.filter((t) => t.id !== id);
  if (state.selectedTelopId === id) state.selectedTelopId = null;
}

export function setBgm(file, url, duration) {
  state.bgm = { file, url, duration, volume: 0.8 };
}

// クリップ配列上のグローバル時刻(タイムライン基準の秒)からクリップとローカル時刻を求める
export function clipAtGlobalTime(t) {
  let acc = 0;
  for (const c of state.clips) {
    const len = c.trimOut - c.trimIn;
    if (t < acc + len) {
      return { clip: c, localTime: c.trimIn + (t - acc) };
    }
    acc += len;
  }
  return null;
}

export function globalStartOfClip(clipId) {
  let acc = 0;
  for (const c of state.clips) {
    if (c.id === clipId) return acc;
    acc += c.trimOut - c.trimIn;
  }
  return 0;
}
