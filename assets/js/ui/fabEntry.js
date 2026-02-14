// assets/js/ui/fabEntry.js
// Floating Action Button + Modal (Add Entry)

export function initFabEntry() {
  if (document.querySelector(".fabEntryBtn")) return;

  /* =========================
     Create Floating Button
  ========================== */

  const btn = document.createElement("button");
  btn.className = "fabEntryBtn";
  btn.setAttribute("aria-label", "Add Entry");

  // iOS-style symmetric plus (SVG, not font-based)
  btn.innerHTML = `
    <svg
      class="fabEntryBtn__icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.6"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M12 5v14M5 12h14"/>
    </svg>
  `;

  document.body.appendChild(btn);

  /* =========================
     Create Modal Structure
  ========================== */

  const backdrop = document.createElement("div");
  backdrop.className = "fabEntryBackdrop";

  backdrop.innerHTML = `
    <div class="fabEntryPanel" role="dialog" aria-modal="true">
      <div class="fabEntryHeader">
        <div class="fabEntryHeader__title">Add Entry</div>
        <button class="fabEntryClose" aria-label="Close">
          <span>×</span>
        </button>
      </div>

      <div class="fabEntryBody">
        <form class="fabEntryForm">
          <label class="fabEntryLabel">Entry Type</label>
          <select class="fabEntryField">
            <option>Directory</option>
            <option>Event</option>
          </select>

          <label class="fabEntryLabel">Name</label>
          <input type="text" class="fabEntryField" placeholder="Enter name" />

          <label class="fabEntryLabel">Notes</label>
          <textarea class="fabEntryField fabEntryField--textarea" placeholder="Optional notes"></textarea>

          <div class="fabEntryActions">
            <button type="button" class="fabEntryAction fabEntryAction--ghost">Cancel</button>
            <button type="button" class="fabEntryAction fabEntryAction--primary">Save</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  /* =========================
     Open / Close Logic
  ========================== */

  function openModal() {
    backdrop.classList.add("fabEntry--open");
    document.body.classList.add("fabEntryScrollLock");
  }

  function closeModal() {
    backdrop.classList.remove("fabEntry--open");
    document.body.classList.remove("fabEntryScrollLock");
  }

  btn.addEventListener("click", openModal);

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal();
  });

  backdrop.querySelector(".fabEntryClose")
    .addEventListener("click", closeModal);

  backdrop.querySelector(".fabEntryAction--ghost")
    .addEventListener("click", closeModal);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}
