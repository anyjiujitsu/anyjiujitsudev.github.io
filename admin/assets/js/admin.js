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

function getAdminStateOptions(customization){
  if(!customization || !Array.isArray(customization.adminStates)){
    return FALLBACK_ADMIN_STATES;
  }

  const states = customization.adminStates
    .map((state) => typeof state === "string" ? state.trim() : "")
    .filter(Boolean);

  return states.length ? states : FALLBACK_ADMIN_STATES;
}

function populateAdminStateSelects(customization){
  const states = getAdminStateOptions(customization);

  document.querySelectorAll('select[data-customization-select="adminStates"]').forEach((select) => {
    const currentValue = select.value;
    select.innerHTML = '<option value="">Select…</option>';

    states.forEach((state) => {
      const option = document.createElement("option");
      option.value = state;
      option.textContent = state;
      select.appendChild(option);
    });

    if(currentValue && states.includes(currentValue)){
      select.value = currentValue;
    }
  });
}

async function loadAdminCustomization(){
  try{
    const mod = await import(`../../../customization.js?v=${Date.now()}`);
    const customization = mod.CUSTOMIZATION || {};

    if(typeof mod.applyCustomization === "function"){
      mod.applyCustomization(customization);
    }

    populateAdminStateSelects(customization);

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
    populateAdminStateSelects({});
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
