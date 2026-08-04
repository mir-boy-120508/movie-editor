import { state, addTelop, removeTelop } from "./state.js";

const listEl = document.getElementById("telop-list");
const editorEl = document.getElementById("telop-editor");
const addBtn = document.getElementById("add-telop-btn");
const deleteBtn = document.getElementById("telop-delete-btn");

const textInput = document.getElementById("telop-text");
const startInput = document.getElementById("telop-start");
const endInput = document.getElementById("telop-end");
const positionInput = document.getElementById("telop-position");
const colorInput = document.getElementById("telop-color");
const sizeInput = document.getElementById("telop-size");

let onChange = () => {};

export function initTelopPanel(changeCallback) {
  onChange = changeCallback;

  addBtn.addEventListener("click", () => {
    addTelop();
    refresh();
    onChange();
  });

  deleteBtn.addEventListener("click", () => {
    if (state.selectedTelopId) {
      removeTelop(state.selectedTelopId);
      refresh();
      onChange();
    }
  });

  [textInput, startInput, endInput, positionInput, colorInput, sizeInput].forEach((input) => {
    input.addEventListener("input", () => {
      const t = state.telops.find((x) => x.id === state.selectedTelopId);
      if (!t) return;
      t.text = textInput.value;
      t.start = Math.max(0, Number(startInput.value) || 0);
      t.end = Math.max(t.start + 0.1, Number(endInput.value) || t.start + 1);
      t.position = positionInput.value;
      t.color = colorInput.value;
      t.size = Number(sizeInput.value);
      refresh();
      onChange();
    });
  });
}

export function refresh() {
  listEl.innerHTML = "";
  for (const t of state.telops) {
    const item = document.createElement("div");
    item.className = "telop-item" + (state.selectedTelopId === t.id ? " selected" : "");
    item.textContent = `${t.text.slice(0, 16) || "(空)"} (${t.start.toFixed(1)}s〜${t.end.toFixed(1)}s)`;
    item.addEventListener("click", () => {
      state.selectedTelopId = t.id;
      state.selectedClipId = null;
      refresh();
      onChange();
    });
    listEl.appendChild(item);
  }

  const selected = state.telops.find((t) => t.id === state.selectedTelopId);
  if (selected) {
    editorEl.classList.remove("hidden");
    textInput.value = selected.text;
    startInput.value = selected.start.toFixed(1);
    endInput.value = selected.end.toFixed(1);
    positionInput.value = selected.position;
    colorInput.value = selected.color;
    sizeInput.value = selected.size;
  } else {
    editorEl.classList.add("hidden");
  }
}
