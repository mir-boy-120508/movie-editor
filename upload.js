import { state, addClip, setBgm } from "./state.js";

function readMediaDuration(url, isAudio) {
  return new Promise((resolve, reject) => {
    const el = document.createElement(isAudio ? "audio" : "video");
    el.preload = "metadata";
    el.src = url;
    el.onloadedmetadata = () => resolve(el.duration);
    el.onerror = () => reject(new Error("メディアの読み込みに失敗しました"));
  });
}

export async function handleVideoFiles(fileList, onChange) {
  const files = Array.from(fileList).filter((f) => f.type.startsWith("video/"));
  for (const file of files) {
    const url = URL.createObjectURL(file);
    try {
      const duration = await readMediaDuration(url, false);
      addClip(file, url, duration);
    } catch (err) {
      console.error(err);
      alert(`${file.name} を読み込めませんでした。`);
    }
  }
  onChange();
}

export async function handleBgmFile(file, onChange) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    const duration = await readMediaDuration(url, true);
    setBgm(file, url, duration);
  } catch (err) {
    console.error(err);
    alert("BGMファイルを読み込めませんでした。");
  }
  onChange();
}

export function setupDragAndDrop(dropTarget, onChange) {
  ["dragenter", "dragover"].forEach((evt) =>
    dropTarget.addEventListener(evt, (e) => {
      e.preventDefault();
      dropTarget.classList.add("drag-active");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dropTarget.addEventListener(evt, (e) => {
      e.preventDefault();
      dropTarget.classList.remove("drag-active");
    })
  );
  dropTarget.addEventListener("drop", (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
      handleVideoFiles(e.dataTransfer.files, onChange);
    }
  });
}
