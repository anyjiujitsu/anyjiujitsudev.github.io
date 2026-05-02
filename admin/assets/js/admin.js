// admin.js
// purpose: admin panel bootstrap only; feature logic lives in modules/*

import { setupAdminGeocode } from './modules/geo.js';
import { initAdminPager } from './modules/pager.js';
import { initAdminForms } from './modules/submit.js';
import { initWhereCitySuggestions } from './modules/suggestions.js';
import { setupOpensTimeSync } from './modules/time.js';
import { initTokenControls } from './modules/token.js';

const FALLBACK_ADMIN_STATES = Object.freeze([
  "Massachusetts",
  "New Hampshire",
  "Vermont",
  "Maine",
  "Connecticut",
  "Rhode Island"
]);

const FALLBACK_ADMIN_EVENT_TYPES = Object.freeze([
  "Seminar",
  "Open Mat",
  "Women's Only",
  "Workshop",
  "Charity Event",
  "Comp",
  "Comp (Invite)",
  "Tournament",
  "Grand Opening",
  "Kids Event",
  "Open House",
  "Self Defense"
]);

function getCustomizationList(customization, key, fallbackValues){
  if(!customization || !Array.isArray(customization[key])){
    return fallbackValues;
  }

  const values = customization[key]
    .map((value) => typeof value === "string" ? value.trim() : "")
    .filter(Boolean);

  return values.length ? values : fallbackValues;
}

function populateCustomizationSelects(customization, key, fallbackValues){
  const values = getCustomizationList(customization, key, fallbackValues);

  document.querySelectorAll(`select[data-customization-select="${key}"]`).forEach((select) => {
    const currentValue = select.value;
    select.innerHTML = '<option value="">Select…</option>';

    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });

    if(currentValue && values.includes(currentValue)){
      select.value = currentValue;
    }
  });
}

function populateAdminSelects(customization){
  populateCustomizationSelects(customization, "adminStates", FALLBACK_ADMIN_STATES);
  populateCustomizationSelects(customization, "adminEventTypes", FALLBACK_ADMIN_EVENT_TYPES);
}

async function loadAdminCustomization(){
  try{
    const mod = await import(`../../../customization.js?v=${Date.now()}`);
    const customization = mod.CUSTOMIZATION || {};

    if(typeof mod.applyCustomization === "function"){
      mod.applyCustomization(customization);
    }

    populateAdminSelects(customization);

    const siteName = typeof customization.siteHeaderName === "string"
      ? customization.siteHeaderName.trim()
      : "";
    const adminSuffix = typeof customization.adminTitleSuffix === "string" && customization.adminTitleSuffix.trim()
      ? customization.adminTitleSuffix.trim()
      : "Admin";

    document.title = `${siteName || "UNDEFINED"} - ${adminSuffix}`;
    return customization;
  } catch(err){
    console.warn("Admin customization failed to load", err);
    populateAdminSelects({});
    return {};
  }
}


async function initAdmin(){
  await loadAdminCustomization();

  const { setTokenStatus, validateAndStoreToken } = initTokenControls();
  initAdminPager();
  initWhereCitySuggestions();

  const eventForm = document.getElementById('eventForm');
  const indexForm = document.getElementById('indexForm');
  setupOpensTimeSync(indexForm);

  const geoControllers = {
    event: setupAdminGeocode(eventForm),
    index: setupAdminGeocode(indexForm)
  };

  initAdminForms({ validateAndStoreToken, setTokenStatus, geoControllers });
}

initAdmin();
