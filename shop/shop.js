import { applyCustomization, CUSTOMIZATION } from '../customization.js';
import { SHOP_CONFIG } from './shop-config.js';

applyCustomization(CUSTOMIZATION);
document.title = `${CUSTOMIZATION.siteHeaderName || 'ANY N.E. GRAPPLING'} | SHOP`;

const listEl = document.querySelector('#shopList');
const stateEl = document.querySelector('#shopState');
const countEl = document.querySelector('#shopCount');

const money = new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' });

function setState(message, { error = false } = {}){
  stateEl.hidden = false;
  stateEl.textContent = message;
  stateEl.style.color = error ? '#7a1f1f' : '';
}

function clearState(){
  stateEl.hidden = true;
  stateEl.textContent = '';
}

function normalizePrice(value){
  const num = Number.parseFloat(value);
  return Number.isFinite(num) ? num : null;
}

function variantLabel(variant){
  const name = (variant.name || '').trim();
  return name || `Variant ${variant.id}`;
}

function priceRange(variants){
  const prices = variants.map(v => normalizePrice(v.retail_price)).filter(v => v !== null);
  if(!prices.length) return 'Price unavailable';
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? money.format(min) : `${money.format(min)} – ${money.format(max)}`;
}

function createProductCard(product){
  const variants = Array.isArray(product.variants) ? product.variants.filter(v => v.synced !== false) : [];
  const article = document.createElement('article');
  article.className = 'shopItem';

  const media = document.createElement('div');
  media.className = 'shopItem__media';

  if(product.thumbnail_url){
    const img = document.createElement('img');
    img.className = 'shopItem__image';
    img.src = product.thumbnail_url;
    img.alt = product.name || 'Shop product';
    img.loading = 'lazy';
    media.append(img);
  }

  const body = document.createElement('div');
  body.className = 'shopItem__body';

  const title = document.createElement('h2');
  title.className = 'shopItem__name';
  title.textContent = product.name || 'Untitled product';

  const description = document.createElement('p');
  description.className = 'shopItem__description';
  description.textContent = variants.length === 1 ? '1 available variant' : `${variants.length} available variants`;

  const price = document.createElement('p');
  price.className = 'shopItem__price';
  price.textContent = priceRange(variants);

  const variantRow = document.createElement('div');
  variantRow.className = 'shopVariantRow';

  const field = document.createElement('label');
  field.className = 'shopField';
  const fieldLabel = document.createElement('span');
  fieldLabel.className = 'shopField__label';
  fieldLabel.textContent = 'Option';
  const select = document.createElement('select');
  select.className = 'shopSelect';
  select.setAttribute('aria-label', `Choose option for ${product.name || 'product'}`);

  for(const variant of variants){
    const option = document.createElement('option');
    option.value = String(variant.id);
    option.textContent = variantLabel(variant);
    option.dataset.price = variant.retail_price || '';
    select.append(option);
  }

  if(!variants.length){
    const option = document.createElement('option');
    option.textContent = 'Unavailable';
    option.value = '';
    select.append(option);
    select.disabled = true;
  }

  field.append(fieldLabel, select);
  variantRow.append(field);

  const actions = document.createElement('div');
  actions.className = 'shopItem__actions';
  const button = document.createElement('button');
  button.className = 'shopButton';
  button.type = 'button';
  button.textContent = 'Buy Now';
  button.disabled = true;
  button.setAttribute('aria-disabled', 'true');

  const status = document.createElement('span');
  status.className = 'shopStatus';
  status.textContent = 'Checkout connection next';
  actions.append(button, status);

  select.addEventListener('change', () => {
    const selected = select.selectedOptions[0];
    const selectedPrice = normalizePrice(selected?.dataset.price);
    if(selectedPrice !== null) price.textContent = money.format(selectedPrice);
  });

  body.append(title, description, price, variantRow, actions);
  article.append(media, body);
  return article;
}

async function loadProducts(){
  const base = SHOP_CONFIG.printfulProxyUrl.trim().replace(/\/$/, '');
  if(!base){
    countEl.textContent = '';
    setState('Printful API proxy is ready to connect. Add the deployed Worker URL to shop/shop-config.js.');
    return;
  }

  setState('Loading shop…');

  try{
    const response = await fetch(`${base}/api/products`, { headers: { Accept:'application/json' } });
    const payload = await response.json().catch(() => ({}));
    if(!response.ok) throw new Error(payload.error || `Shop API returned ${response.status}`);

    const products = Array.isArray(payload.products) ? payload.products : [];
    listEl.replaceChildren(...products.map(createProductCard));
    countEl.textContent = products.length ? `${products.length} ${products.length === 1 ? 'ITEM' : 'ITEMS'}` : '0 ITEMS';

    if(products.length) clearState();
    else setState('No synced products were returned by this Printful store.');
  }catch(error){
    console.error(error);
    countEl.textContent = '';
    setState('The shop could not connect to Printful. Check the proxy URL, Worker secrets, and allowed origin.', { error:true });
  }
}

loadProducts();
