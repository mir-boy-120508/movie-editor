import { state } from "./state.js";
import { handleVideoFiles, handleBgmFile, setupDragAndDrop } from "./upload.js";
import { initTimeline, renderTimeline, splitSelectedClipAtPlayhead } from "./timeline.js";
import { initPreview, seekTo, refreshPreviewStatic } from "./preview.js";
import { initTelopPanel, refresh as refreshTelopPanel } from "./telop-panel.js";
import { initExportModal, runExport } from "./export.js";
import { removeClip } from "./state.js";

const fileInput = document.getElementById("file-input");
const bgmInput = document.getElementById("bgm-input");
const exportBtn = document.getElementById("export-btn");
const splitBtn = document.getElementById("split-btn");
const deleteClipBtn = document.getElementById("delete-clip-btn");
const previewStage = document.querySelector(".preview-stage");

function onAnyChange() {
  renderTimeline();
  refreshTelopPanel();
  refreshPreviewStatic();
}

initTimeline({
  seekCallback: (t) => seekTo(t),
  selectionCallback: onAnyChange,
});

initPreview({
  onSeek: () => {
    renderTimeline();
  },
});

initTelopPanel(onAnyChange);
initExportModal();
setupDragAndDrop(previewStage, onAnyChange);

fileInput.addEventListener("change", (e) => {
  handleVideoFiles(e.target.files, onAnyChange);
  fileInput.value = "";
});

bgmInput.addEventListener("change", (e) => {
  handleBgmFile(e.target.files[0], onAnyChange);
  bgmInput.value = "";
});

exportBtn.addEventListener("click", runExport);
splitBtn.addEventListener("click", () => {
  splitSelectedClipAtPlayhead();
});
deleteClipBtn.addEventListener("click", () => {
  if (state.selectedClipId) {
    removeClip(state.selectedClipId);
    onAnyChange();
  } else if (state.selectedTelopId) {
    import("./state.js").then(({ removeTelop }) => {
      removeTelop(state.selectedTelopId);
      onAnyChange();
    });
  }
});

renderTimeline();
