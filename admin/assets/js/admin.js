// admin.js
// purpose: admin panel bootstrap only; feature logic lives in modules/*

import { setupAdminGeocode } from './modules/geo.js';
import { initAdminPager } from './modules/pager.js';
import { initAdminForms } from './modules/submit.js';
import { initWhereCitySuggestions } from './modules/suggestions.js';
import { setupOpensTimeSync } from './modules/time.js';
import { initTokenControls } from './modules/token.js';

async function loadAdminCustomization(){
  try{
    const mod = await import(`../../../customization.js?v=${Date.now()}`);
    const customization = mod.CUSTOMIZATION || {};

    if(typeof mod.applyCustomization === "function"){
      mod.applyCustomization(customization);
    }

    const siteName = typeof customization.siteHeaderName === "string"
      ? customization.siteHeaderName.trim()
      : "";
    const adminSuffix = typeof customization.adminTitleSuffix === "string" && customization.adminTitleSuffix.trim()
      ? customization.adminTitleSuffix.trim()
      : "Admin";

    document.title = `${siteName || "UNDEFINED"} - ${adminSuffix}`;
  } catch(err){
    console.warn("Admin customization failed to load", err);
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
