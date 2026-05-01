// admin/modules/geo.js
// purpose: Admin form city/state -> LAT/LON auto-fill for Index and Events

function getGeoFields(form){
  return {
    city: form?.querySelector('input[name="CITY"]'),
    state: form?.querySelector('select[name="STATE"]'),
    lat: form?.querySelector('input[name="LAT"]'),
    lon: form?.querySelector('input[name="LON"]'),
    latDisplay: form?.querySelector('input[name="LAT_display"]'),
    lonDisplay: form?.querySelector('input[name="LON_display"]')
  };
}

export function setupAdminGeocode(form){
  const fields = getGeoFields(form);

  let geoTimer = null;
  let lastGeoQ = '';

  function setLatLon(lat, lon){
    const _lat = lat || '';
    const _lon = lon || '';
    if(fields.lat) fields.lat.value = _lat;
    if(fields.lon) fields.lon.value = _lon;
    if(fields.latDisplay) fields.latDisplay.value = _lat;
    if(fields.lonDisplay) fields.lonDisplay.value = _lon;
  }

  async function geocodeCityState(city, state){
    const q = `${city}, ${state}, USA`.trim();
    if(!city || !state){
      setLatLon('', '');
      return;
    }
    if(q === lastGeoQ) return;
    lastGeoQ = q;

    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q);
    try{
      const res = await fetch(url, { method: 'GET' });
      if(!res.ok) throw new Error('geocode_http_' + res.status);
      const data = await res.json();
      if(Array.isArray(data) && data[0] && data[0].lat && data[0].lon){
        setLatLon(String(data[0].lat), String(data[0].lon));
      }else{
        setLatLon('', '');
      }
    }catch(_e){
      setLatLon('', '');
    }
  }

  function scheduleGeocode(){
    if(!fields.city || !fields.state) return;
    const city = (fields.city.value || '').trim();
    const state = (fields.state.value || '').trim();
    if(geoTimer) clearTimeout(geoTimer);
    geoTimer = setTimeout(() => geocodeCityState(city, state), 450);
  }

  fields.city?.addEventListener('input', scheduleGeocode);
  fields.state?.addEventListener('change', scheduleGeocode);

  return {
    reset(){
      if(geoTimer) clearTimeout(geoTimer);
      geoTimer = null;
      lastGeoQ = '';
      setLatLon('', '');
    },
    refresh: scheduleGeocode
  };
}

// Backward-compatible export name for older admin.js versions.
export function setupIndexGeocode(indexForm){
  return setupAdminGeocode(indexForm);
}
