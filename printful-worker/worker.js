/**
 * Cloudflare Worker proxy for a single Printful store.
 * Required Worker secret: PRINTFUL_TOKEN
 * Optional Worker secret: PRINTFUL_STORE_ID (only needed for account-level tokens)
 * Optional Worker variable: ALLOWED_ORIGIN (example: https://anyjiujitsu.github.io)
 */

const PRINTFUL_API = 'https://api.printful.com';

function corsHeaders(request, env){
  const origin = request.headers.get('Origin') || '';
  const allowed = env.ALLOWED_ORIGIN || '*';
  const allowOrigin = allowed === '*' || origin === allowed ? (allowed === '*' ? '*' : origin) : allowed;
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function json(data, status, request, env){
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': status === 200 ? 'public, max-age=60, s-maxage=300' : 'no-store',
      ...corsHeaders(request, env),
    },
  });
}

function printfulHeaders(env){
  const headers = {
    'Authorization': `Bearer ${env.PRINTFUL_TOKEN}`,
    'Accept': 'application/json',
  };
  if(env.PRINTFUL_STORE_ID) headers['X-PF-Store-Id'] = String(env.PRINTFUL_STORE_ID);
  return headers;
}

async function pfFetch(path, env){
  const response = await fetch(`${PRINTFUL_API}${path}`, { headers: printfulHeaders(env) });
  const data = await response.json().catch(() => null);
  if(!response.ok){
    const message = data?.result || data?.error?.message || `Printful returned ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function pickThumbnail(detail, listProduct){
  return detail?.sync_product?.thumbnail_url || listProduct?.thumbnail_url || null;
}

function normalizeProduct(detail, listProduct){
  const syncProduct = detail?.sync_product || listProduct || {};
  const variants = Array.isArray(detail?.sync_variants) ? detail.sync_variants : [];
  return {
    id: syncProduct.id,
    external_id: syncProduct.external_id || null,
    name: syncProduct.name || 'Untitled product',
    thumbnail_url: pickThumbnail(detail, listProduct),
    variants: variants.map((variant) => ({
      id: variant.id,
      external_id: variant.external_id || null,
      name: variant.name || '',
      retail_price: variant.retail_price ?? null,
      currency: variant.currency || 'USD',
      synced: variant.synced !== false,
      product: variant.product ? {
        variant_id: variant.product.variant_id ?? null,
        product_id: variant.product.product_id ?? null,
        image: variant.product.image || null,
        name: variant.product.name || null,
      } : null,
    })),
  };
}

export default {
  async fetch(request, env){
    if(request.method === 'OPTIONS'){
      return new Response(null, { status:204, headers:corsHeaders(request, env) });
    }

    if(request.method !== 'GET') return json({ error:'Method not allowed' }, 405, request, env);
    if(!env.PRINTFUL_TOKEN) return json({ error:'PRINTFUL_TOKEN is not configured' }, 500, request, env);

    const url = new URL(request.url);

    try{
      if(url.pathname === '/api/health'){
        return json({ ok:true }, 200, request, env);
      }

      if(url.pathname === '/api/products'){
        const list = await pfFetch('/store/products?limit=100', env);
        const products = Array.isArray(list?.result) ? list.result.filter(p => !p.is_ignored) : [];

        const detailed = await Promise.all(products.map(async (product) => {
          const detail = await pfFetch(`/store/products/${encodeURIComponent(product.id)}`, env);
          return normalizeProduct(detail?.result, product);
        }));

        return json({ products:detailed }, 200, request, env);
      }

      const match = url.pathname.match(/^\/api\/products\/(\d+)$/);
      if(match){
        const detail = await pfFetch(`/store/products/${match[1]}`, env);
        return json({ product:normalizeProduct(detail?.result, null) }, 200, request, env);
      }

      return json({ error:'Not found' }, 404, request, env);
    }catch(error){
      return json({ error:error instanceof Error ? error.message : 'Printful request failed' }, 502, request, env);
    }
  }
};
