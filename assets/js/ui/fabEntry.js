// assets/js/ui/fabEntry.js
// purpose: inject a floating action button (FAB) + modal shell for future entry forms

const IDS = {
  btn: "fabEntryBtn",
  backdrop: "fabEntryBackdrop",
  panel: "fabEntryPanel",
  close: "fabEntryCloseBtn",
  form: "fabEntryForm",
};

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, String(v));
  }
  for (const child of children) node.appendChild(child);
  return node;
}

function isOpen(backdrop) {
  return backdrop?.classList.contains("fabEntry--open");
}

function setBodyScrollLocked(lock) {
  // keep it minimal + reversible
  if (lock) {
    document.documentElement.classList.add("fabEntryScrollLock");
  } else {
    document.documentElement.classList.remove("fabEntryScrollLock");
  }
}

export function initFabEntry() {
  // Guard: only inject once
  if (document.getElementById(IDS.btn) || document.getElementById(IDS.backdrop)) return;

  // FAB button
  const btn = el("button", {
    id: IDS.btn,
    class: "fabEntryBtn",
    type: "button",
    "aria-label": "Add entry",
    title: "Add entry",
  }, [
    el("span", { class: "fabEntryBtn__plus", "aria-hidden": "true", text: "+" }),
  ]);

  // Modal markup
  const closeBtn = el("button", {
    id: IDS.close,
    class: "fabEntryClose",
    type: "button",
    "aria-label": "Close",
    title: "Close",
  }, [ el("span", { "aria-hidden": "true", text: "×" }) ]);

  const header = el("div", { class: "fabEntryHeader" }, [
    el("div", { class: "fabEntryHeader__title", text: "Add Entry" }),
    closeBtn,
  ]);

  const form = el("form", { id: IDS.form, class: "fabEntryForm", autocomplete: "off" }, [
    el("label", { class: "fabEntryLabel", for: "fabEntryType", text: "Entry type" }),
    el("select", { class: "fabEntryField", id: "fabEntryType", name: "type" }, [
      el("option", { value: "directory", text: "Directory (Gym)" }),
      el("option", { value: "event", text: "Event" }),
    ]),
    el("label", { class: "fabEntryLabel", for: "fabEntryName", text: "Name" }),
    el("input", {
      class: "fabEntryField",
      id: "fabEntryName",
      name: "name",
      type: "text",
      placeholder: "Placeholder field",
    }),
    el("label", { class: "fabEntryLabel", for: "fabEntryNotes", text: "Notes" }),
    el("textarea", {
      class: "fabEntryField fabEntryField--textarea",
      id: "fabEntryNotes",
      name: "notes",
      rows: "3",
      placeholder: "We’ll turn this into the real entry form next.",
    }),
    el("div", { class: "fabEntryActions" }, [
      el("button", { class: "fabEntryAction fabEntryAction--primary", type: "submit", text: "Save" }),
      el("button", { class: "fabEntryAction fabEntryAction--ghost", type: "button", "data-fab-close": "1", text: "Cancel" }),
    ]),
  ]);

  const panel = el("div", { id: IDS.panel, class: "fabEntryPanel", role: "dialog", "aria-modal": "true", "aria-label": "Add entry" }, [
    header,
    el("div", { class: "fabEntryBody" }, [ form ]),
  ]);

  const backdrop = el("div", { id: IDS.backdrop, class: "fabEntryBackdrop", "aria-hidden": "true" }, [
    panel,
  ]);

  // Inject into DOM
  document.body.appendChild(btn);
  document.body.appendChild(backdrop);

  // Behavior
  const open = () => {
    if (!backdrop) return;
    backdrop.classList.add("fabEntry--open");
    setBodyScrollLocked(true);

    // focus first field for good UX
    const firstField = backdrop.querySelector("select, input, textarea, button");
    if (firstField) firstField.focus({ preventScroll: true });
  };

  const close = () => {
    if (!backdrop) return;
    backdrop.classList.remove("fabEntry--open");
    setBodyScrollLocked(false);
    btn.focus({ preventScroll: true });
  };

  btn.addEventListener("click", () => {
    if (isOpen(backdrop)) close();
    else open();
  });

  closeBtn.addEventListener("click", close);

  // Backdrop click closes (but ignore clicks inside panel)
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  // Delegate close buttons (Cancel, etc.)
  backdrop.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest("[data-fab-close='1']")) close();
  });

  // Escape closes
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!isOpen(backdrop)) return;
    e.preventDefault();
    close();
  });

  // Prevent real submit for now (shell only)
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    // Placeholder behavior: just close for now.
    close();
  });
}
