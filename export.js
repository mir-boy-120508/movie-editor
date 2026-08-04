import { state, totalDuration } from "./state.js";

const FONT_URL = "https://cdn.jsdelivr.net/npm/noto-sans-cjk-jp@1.0.1/fonts/NotoSansCJKjp-Regular.woff";
const CORE_BASE = "https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm";

const modal = document.getElementById("export-modal");
const statusEl = document.getElementById("export-status");
const progressEl = document.getElementById("export-progress");
const downloadBtn = document.getElementById("export-download");
const closeBtn = document.getElementById("export-close");

let ffmpeg = null;
let FFmpegClass = null;
let fetchFileFn = null;
let toBlobURLFn = null;

function setStatus(text, ratio) {
  statusEl.textContent = text;
  if (ratio !== undefined) progressEl.style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`;
}

async function ensureFfmpeg() {
  if (ffmpeg) return ffmpeg;

  setStatus("エンジンを読み込んでいます(初回のみ時間がかかります)", 0.02);
  const ffmpegModule = await import("https://esm.sh/@ffmpeg/ffmpeg@0.12.10");
  const utilModule = await import("https://esm.sh/@ffmpeg/util@0.12.1");
  FFmpegClass = ffmpegModule.FFmpeg;
  fetchFileFn = utilModule.fetchFile;
  toBlobURLFn = utilModule.toBlobURL;

  ffmpeg = new FFmpegClass();
  ffmpeg.on("log", ({ message }) => console.log("[ffmpeg]", message));

  await ffmpeg.load({
    coreURL: await toBlobURLFn(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURLFn(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
    workerURL: await toBlobURLFn(`${CORE_BASE}/ffmpeg-core.worker.js`, "text/javascript"),
  });

  return ffmpeg;
}

function escapePathSafe(name, idx) {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : ".mp4";
  return `src_${idx}${ext}`;
}

function telopFilterChain(hasFont) {
  if (!hasFont || state.telops.length === 0) return null;
  const parts = state.telops.map((t, i) => {
    const y =
      t.position === "top"
        ? "h*0.12"
        : t.position === "bottom"
        ? `h*0.88-text_h`
        : "(h-text_h)/2";
    return (
      `drawtext=fontfile=noto.ttf:textfile=telop_${i}.txt:reload=0:` +
      `x=(w-text_w)/2:y=${y}:fontsize=${t.size * 2}:fontcolor=${t.color}:` +
      `borderw=4:bordercolor=black@0.6:` +
      `enable='between(t,${t.start},${t.end})'`
    );
  });
  return parts.join(",");
}

export async function runExport() {
  if (state.clips.length === 0) {
    alert("先に動画を追加してください。");
    return;
  }

  modal.classList.remove("hidden");
  downloadBtn.classList.add("hidden");
  closeBtn.textContent = "キャンセル";

  try {
    const ff = await ensureFfmpeg();

    // 1) 元動画ファイルとフォントを書き込む
    setStatus("素材を読み込んでいます", 0.08);
    const nameMap = new Map();
    for (let i = 0; i < state.clips.length; i++) {
      const clip = state.clips[i];
      if (!nameMap.has(clip.id)) {
        const fname = escapePathSafe(clip.name, i);
        await ff.writeFile(fname, await fetchFileFn(clip.file));
        nameMap.set(clip.id, fname);
      }
    }

    let hasFont = true;
    try {
      await ff.writeFile("noto.ttf", await fetchFileFn(FONT_URL));
    } catch (e) {
      console.warn("フォントの取得に失敗しました。テロップなしで続行します。", e);
      hasFont = false;
    }

    for (let i = 0; i < state.telops.length; i++) {
      const t = state.telops[i];
      await ff.writeFile(`telop_${i}.txt`, new TextEncoder().encode(t.text));
    }

    // 2) 各クリップをトリム+FHDにスケールしてセグメント化
    const segNames = [];
    for (let i = 0; i < state.clips.length; i++) {
      const clip = state.clips[i];
      const inputName = nameMap.get(clip.id);
      const segName = `seg_${i}.mp4`;
      setStatus(`クリップを処理しています (${i + 1}/${state.clips.length})`, 0.1 + (0.4 * i) / state.clips.length);
      await ff.exec([
        "-i", inputName,
        "-ss", String(clip.trimIn),
        "-to", String(clip.trimOut),
        "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1",
        "-r", "30",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-c:a", "aac", "-ar", "48000", "-ac", "2",
        segName,
      ]);
      segNames.push(segName);
    }

    // 3) セグメントを結合
    setStatus("クリップを結合しています", 0.55);
    const listContent = segNames.map((n) => `file '${n}'`).join("\n");
    await ff.writeFile("concat.txt", new TextEncoder().encode(listContent));
    await ff.exec(["-f", "concat", "-safe", "0", "-i", "concat.txt", "-c", "copy", "merged.mp4"]);

    // 4) テロップを焼き込む
    let videoOut = "merged.mp4";
    const filterChain = telopFilterChain(hasFont);
    if (filterChain) {
      setStatus("テロップを合成しています", 0.68);
      await ff.exec(["-i", "merged.mp4", "-vf", filterChain, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "copy", "merged_text.mp4"]);
      videoOut = "merged_text.mp4";
    }

    // 5) BGMを合成
    let finalOut = videoOut;
    if (state.bgm) {
      setStatus("BGMを合成しています", 0.85);
      await ff.writeFile("bgm.audio", await fetchFileFn(state.bgm.file));
      const dur = totalDuration();
      await ff.exec([
        "-i", videoOut,
        "-i", "bgm.audio",
        "-filter_complex",
        `[1:a]atrim=0:${dur},volume=${state.bgm.volume}[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
        "-map", "0:v", "-map", "[aout]",
        "-c:v", "copy", "-c:a", "aac",
        "final.mp4",
      ]);
      finalOut = "final.mp4";
    }

    setStatus("仕上げています", 0.97);
    const data = await ff.readFile(finalOut);
    const blob = new Blob([data.buffer], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);

    downloadBtn.href = url;
    downloadBtn.classList.remove("hidden");
    closeBtn.textContent = "閉じる";
    setStatus("完了しました", 1);
  } catch (err) {
    console.error(err);
    setStatus(`エラーが発生しました: ${err.message || err}`, 0);
    closeBtn.textContent = "閉じる";
  }
}

export function initExportModal() {
  closeBtn.addEventListener("click", () => {
    modal.classList.add("hidden");
  });
}
