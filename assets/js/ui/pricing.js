// ui/pricing.js
// purpose: event pricing popup wiring + rendering

let pricingOverlay = null;
let pricingCard = null;
let pricingCloseBtn = null;

function ensurePricingPopup(){
  if(pricingOverlay) return;

  pricingOverlay = document.createElement("div");
  pricingOverlay.className = "pricingOverlay";
  pricingOverlay.hidden = true;
  pricingOverlay.innerHTML = `
    <div class="pricingPopup" role="dialog" aria-modal="true" aria-label="Event pricing">
      <button type="button" class="pricingPopup__close" aria-label="Close pricing popup">×</button>
      <div class="pricingPopup__title">EVENT PRICING</div>
      <div class="pricingPopup__rule"></div>
      <div class="pricingPopup__label js-pricingLabel">—</div>

      <div class="pricingPopup__grid">
        <div class="pricingPopup__priceBlock">
          <div class="pricingPopup__price js-pricingMember">--</div>
          <div class="pricingPopup__priceLabel">MEMBERS</div>
        </div>
        <div class="pricingPopup__divider" aria-hidden="true"></div>
        <div class="pricingPopup__priceBlock">
          <div class="pricingPopup__price js-pricingNonMember">--</div>
          <div class="pricingPopup__priceLabel">NON MEMBERS</div>
        </div>
      </div>

      <div class="pricingPopup__presaleRow">
        <span class="pricingPopup__presaleLabel">PRE SALE PRICING:</span>
        <span class="pricingPopup__presaleValue js-pricingPresale">--</span>
      </div>

      <div class="pricingPopup__payments js-pricingPayments"></div>
    </div>
  `;

  document.body.appendChild(pricingOverlay);

  pricingCard = pricingOverlay.querySelector(".pricingPopup");
  pricingCloseBtn = pricingOverlay.querySelector(".pricingPopup__close");

  pricingCloseBtn?.addEventListener("click", closePricingPopup);
  pricingOverlay.addEventListener("click", (e) => {
    if(e.target === pricingOverlay) closePricingPopup();
  });

  document.addEventListener("keydown", (e) => {
    if(e.key === "Escape" && pricingOverlay && !pricingOverlay.hidden){
      closePricingPopup();
    }
  });
}

function formatPricingValue(raw){
  const text = String(raw ?? "").trim();
  if(!text) return "--";
  if(text === "--") return "--";
  if(/^\$/.test(text)) return text;
  if(/^\d+(?:\.\d{1,2})?$/.test(text)) return `$${text.replace(/\.00$/, "")}`;
  return text;
}

function isAffirmative(raw){
  return String(raw ?? "").trim().toUpperCase() === "Y";
}

function getCashIconMarkup(){
  return `
    <svg viewBox="0 0 72 72" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">
        <path d="M18 18l28 7-8 30-28-7z"/>
        <path d="M24 12l28 7-8 30"/>
        <path d="M30 8l28 7-8 30"/>
        <path d="M26 34c1.8-4.8 7-7.3 11.8-5.5 4.8 1.8 7.3 7 5.5 11.8-1.8 4.8-7 7.3-11.8 5.5-4.8-1.8-7.3-7-5.5-11.8z"/>
        <path d="M19 26c2.7.1 5.3-1.2 7-3.4"/>
        <path d="M38 50c2.7.1 5.3-1.2 7-3.4"/>
      </g>
    </svg>
  `;
}

function getVenmoIconMarkup(){
  return `
    <svg viewBox="0 0 72 72" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round">
        <rect x="10" y="10" width="52" height="52" rx="8"/>
        <path d="M28 23c2 1.2 3.4 3.2 4.2 6 .8 2.8.7 6.2-.3 10.4l7.8-15.1h8.8L34.8 49h-8.6l-4.7-25.8z"/>
      </g>
    </svg>
  `;
}

function getSignupIconMarkup(){
  return `
    <svg viewBox="0 0 72 72" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">
        <rect x="12" y="12" width="48" height="48" rx="4"/>
        <rect x="18" y="18" width="10" height="10"/>
        <rect x="44" y="18" width="10" height="10"/>
        <rect x="18" y="44" width="10" height="10"/>
        <path d="M34 18h4v4h-4zM34 26h10M18 34h20M44 34h10M26 42h12M34 50h10"/>
      </g>
    </svg>
  `;
}

function buildPaymentOption(label, iconMarkup){
  return `
    <div class="pricingPopup__payItem">
      <div class="pricingPopup__payIcon">${iconMarkup}</div>
      <div class="pricingPopup__payLabel">${label}</div>
    </div>
  `;
}

function openPricingPopup(trigger){
  ensurePricingPopup();
  if(!pricingOverlay || !pricingCard) return;

  const labelEl = pricingOverlay.querySelector(".js-pricingLabel");
  const memberEl = pricingOverlay.querySelector(".js-pricingMember");
  const nonMemberEl = pricingOverlay.querySelector(".js-pricingNonMember");
  const presaleEl = pricingOverlay.querySelector(".js-pricingPresale");
  const paymentsEl = pricingOverlay.querySelector(".js-pricingPayments");

  const ds = trigger.dataset || {};

  if(labelEl) labelEl.textContent = String(ds.label || "—").trim() || "—";
  if(memberEl) memberEl.textContent = formatPricingValue(ds.member);
  if(nonMemberEl) nonMemberEl.textContent = formatPricingValue(ds.nonmember);
  if(presaleEl) presaleEl.textContent = formatPricingValue(ds.presale);

  if(paymentsEl){
    const items = [];
    if(isAffirmative(ds.cash)) items.push(buildPaymentOption("CASH", getCashIconMarkup()));
    if(isAffirmative(ds.venmo)) items.push(buildPaymentOption("VENMO", getVenmoIconMarkup()));
    if(isAffirmative(ds.signup)) items.push(buildPaymentOption("SIGN UP", getSignupIconMarkup()));
    paymentsEl.innerHTML = items.join("");
    paymentsEl.classList.toggle("pricingPopup__payments--single", items.length === 1);
    paymentsEl.classList.toggle("pricingPopup__payments--double", items.length === 2);
    paymentsEl.classList.toggle("pricingPopup__payments--empty", items.length === 0);
  }

  pricingOverlay.hidden = false;
  document.body.classList.add("pricingPopupOpen");

  requestAnimationFrame(() => {
    const triggerRect = trigger.getBoundingClientRect();
    const cardRect = pricingCard.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 14;

    let left = triggerRect.right - 24;
    let top = triggerRect.bottom + 12;

    if(left + cardRect.width > vw - gap) left = vw - cardRect.width - gap;
    if(left < gap) left = gap;

    if(top + cardRect.height > vh - gap) top = Math.max(gap, triggerRect.top - cardRect.height - 12);
    if(top < gap) top = gap;

    pricingCard.style.left = `${Math.round(left)}px`;
    pricingCard.style.top = `${Math.round(top)}px`;
  });
}

export function closePricingPopup(){
  if(!pricingOverlay) return;
  pricingOverlay.hidden = true;
  document.body.classList.remove("pricingPopupOpen");
}

export function wirePricingPopup(){
  ensurePricingPopup();

  let lastTriggerAt = 0;

  const handleTrigger = (e) => {
    const trigger = e.target && e.target.closest ? e.target.closest(".js-priceTrigger") : null;
    if(!trigger) return false;
    e.preventDefault();
    e.stopPropagation();
    lastTriggerAt = Date.now();
    openPricingPopup(trigger);
    return true;
  };

  document.addEventListener("pointerup", handleTrigger, true);
  document.addEventListener("click", (e) => {
    if(Date.now() - lastTriggerAt < 600){
      const trigger = e.target && e.target.closest ? e.target.closest(".js-priceTrigger") : null;
      if(trigger){
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }
    handleTrigger(e);
  }, true);
}
