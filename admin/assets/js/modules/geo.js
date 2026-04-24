// admin/modules/geo.js
// purpose: Index form city/state -> LAT/LON auto-fill

export function setupIndexGeocode(indexForm){
  const idxCity  = indexForm?.querySelector('input[name="CITY"]');
  const idxState = indexForm?.querySelector('select[name="STATE"]');
  const idxLat   = indexForm?.querySelector('input[name="LAT"]');
  const idxLon   = indexForm?.querySelector('input[name="LON"]');
  const idxLatD  = indexForm?.querySelector('input[name="LAT_display"]');
  const idxLonD  = indexForm?.querySelector('input[name="LON_display"]');

  let geoTimer = null;
  let lastGeoQ = '';

  function setIdxLatLon(lat, lon){
    const _lat = lat || '';
    const _lon = lon || '';
    if(idxLat)  idxLat.value  = _lat;
    if(idxLon)  idxLon.value  = _lon;
    if(idxLatD) idxLatD.value = _lat;
    if(idxLonD) idxLonD.value = _lon;
  }

  async function geocodeCityState(city, state){
    const q = `${city}, ${state}, USA`.trim();
    if(!city || !state){
      setIdxLatLon('', '');
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
        setIdxLatLon(String(data[0].lat), String(data[0].lon));
      }else{
        setIdxLatLon('', '');
      }
    }catch(_e){
      setIdxLatLon('', '');
    }
  }

  function scheduleGeocode(){
    if(!idxCity || !idxState) return;
    const city = (idxCity.value || '').trim();
    const state = (idxState.value || '').trim();
    if(geoTimer) clearTimeout(geoTimer);
    geoTimer = setTimeout(() => geocodeCityState(city, state), 450);
  }

  idxCity?.addEventListener('input', scheduleGeocode);
  idxState?.addEventListener('change', scheduleGeocode);

  return {
    reset(){
      lastGeoQ = '';
      setIdxLatLon('', '');
    }
  };
}
