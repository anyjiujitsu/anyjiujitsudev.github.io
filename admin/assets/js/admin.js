
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("adminPageToggle");
  const title = document.getElementById("adminTitle");

  toggle.addEventListener("click", (e) => {
    if (e.target.tagName !== "BUTTON") return;

    toggle.querySelectorAll("button").forEach(btn => btn.classList.remove("active"));
    e.target.classList.add("active");

    if (e.target.dataset.view === "events") {
      title.textContent = "EVENTS – ADD NEW";
    } else {
      title.textContent = "INDEX – ADD NEW";
    }
  });
});
