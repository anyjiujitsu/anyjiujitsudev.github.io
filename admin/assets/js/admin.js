// admin.js
// purpose: admin panel bootstrap only; feature logic lives in modules/*

import { setupIndexGeocode } from './modules/geo.js';
import { initAdminPager } from './modules/pager.js';
import { initAdminForms } from './modules/submit.js';
import { initWhereCitySuggestions } from './modules/suggestions.js';
import { setupOpensTimeSync } from './modules/time.js';
import { initTokenControls } from './modules/token.js';

const { setTokenStatus, validateAndStoreToken } = initTokenControls();
initAdminPager();
initWhereCitySuggestions();

const indexForm = document.getElementById('indexForm');
setupOpensTimeSync(indexForm);

const geoController = setupIndexGeocode(indexForm);
initAdminForms({ validateAndStoreToken, setTokenStatus, geoController });
