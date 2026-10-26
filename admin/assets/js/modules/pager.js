// Three-view admin pager. All visual state follows the actual scroll position.
export function initAdminPager() {
  const pager = document.getElementById('adminPager');
  const toggle = document.getElementById('adminViewToggle');
  const title = document.getElementById('adminViewTitle');
  if (!pager || !toggle || !title) return;

  const tabs = [...toggle.querySelectorAll('.viewToggle__tab')];
  const thumb = toggle.querySelector('.viewToggle__thumb');
  const headings = { events: 'EVENTS – ADD NEW', index: 'INDEX – ADD NEW', matches: 'MATCHES' };
  let frame = 0;
  let animation = 0;
  let restoreSnap = '';

  function update() {
    const width = pager.clientWidth || 1;
    const progress = Math.max(0, Math.min(tabs.length - 1, pager.scrollLeft / width));
    const index = Math.round(progress);
    tabs.forEach((tab, i) => tab.setAttribute('aria-selected', String(i === index)));
    const selected = tabs[index];
    title.textContent = headings[selected.dataset.view] || 'EVENTS – ADD NEW';
    if (thumb && tabs.length) {
      // Interpolate real button positions; don't animate the thumb a second time.
      const low = Math.floor(progress);
      const high = Math.min(tabs.length - 1, low + 1);
      const fraction = progress - low;
      const start = tabs[low].offsetLeft - thumb.offsetLeft;
      const end = tabs[high].offsetLeft - thumb.offsetLeft;
      toggle.style.setProperty('--thumbX', `${start + (end - start) * fraction}px`);
    }
  }

  function requestUpdate() {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; update(); });
  }

  function cancelNavigation() {
    if (animation) {
      cancelAnimationFrame(animation);
      animation = 0;
      pager.style.scrollSnapType = restoreSnap;
    }
  }

  function navigate(index) {
    cancelNavigation();
    const from = pager.scrollLeft;
    const destination = index * pager.clientWidth;
    const difference = destination - from;
    if (Math.abs(difference) < 1) { update(); return; }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      pager.scrollLeft = destination;
      update();
      return;
    }
    // Disable snap only during programmatic motion, so snap cannot fight the animation.
    restoreSnap = pager.style.scrollSnapType;
    pager.style.scrollSnapType = 'none';
    const started = performance.now();
    const duration = Math.min(480, 300 + Math.abs(difference / (pager.clientWidth || 1)) * 70);
    const step = now => {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      pager.scrollLeft = from + difference * eased;
      requestUpdate();
      if (t < 1) animation = requestAnimationFrame(step);
      else {
        animation = 0;
        pager.scrollLeft = destination;
        pager.style.scrollSnapType = restoreSnap;
        update();
      }
    };
    animation = requestAnimationFrame(step);
  }

  tabs.forEach((tab, index) => tab.addEventListener('click', () => navigate(index)));
  pager.addEventListener('scroll', requestUpdate, { passive: true });
  pager.addEventListener('touchstart', cancelNavigation, { passive: true });
  pager.addEventListener('wheel', cancelNavigation, { passive: true });
  window.addEventListener('resize', () => {
    cancelNavigation();
    requestUpdate();
  });
  update();
}
