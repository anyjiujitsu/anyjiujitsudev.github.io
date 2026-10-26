// Admin three-position pager: EVENTS / INDEX / MATCHES.
export function initAdminPager() {
  const pager = document.getElementById('adminPager');
  const title = document.getElementById('adminViewTitle');
  const toggle = document.getElementById('adminViewToggle');
  if (!pager || !title || !toggle) return;
  const tabs = [...toggle.querySelectorAll('.viewToggle__tab')];
  const thumb = toggle.querySelector('.viewToggle__thumb');
  const pages = [...pager.querySelectorAll('.adminPage')];
  const views = ['events', 'index', 'matches'];
  const headings = ['EVENTS – ADD NEW', 'INDEX – ADD NEW', 'MATCHES'];
  let raf = 0;

  function sync() {
    const width = pager.clientWidth || 1;
    const progress = Math.max(0, Math.min(views.length - 1, pager.scrollLeft / width));
    const active = Math.max(0, Math.min(views.length - 1, Math.round(progress)));
    tabs.forEach((tab, index) => tab.setAttribute('aria-selected', String(index === active)));
    title.textContent = headings[active];
    if (thumb && tabs.length === 3) {
      const start = tabs[0].offsetLeft - thumb.offsetLeft;
      const step = tabs[1].offsetLeft - tabs[0].offsetLeft;
      toggle.style.setProperty('--thumbX', `${start + step * progress}px`);
    }
  }

  tabs.forEach((tab, index) => tab.addEventListener('click', () => {
    pager.scrollTo({left: index * pager.clientWidth, behavior: 'smooth'});
    // Title and selected tab update immediately while the thumb animates.
    tabs.forEach((t, i) => t.setAttribute('aria-selected', String(i === index)));
    title.textContent = headings[index];
  }));
  pager.addEventListener('scroll', () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { raf = 0; sync(); });
  }, {passive:true});
  window.addEventListener('resize', sync);
  // Explicit 3-pane layout, with no stale two-page pager assumptions.
  pages.forEach((page, index) => { if (index < views.length) page.dataset.page = views[index]; });
  sync();
}
