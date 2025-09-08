export default async function handler(req, res) {
  const key = Array.isArray(req.query.key) ? req.query.key[0] : req.query.key;
  const clientKey = req.headers['x-api-key'] || req.headers['X-API-Key'] || req.headers['x-api-key'];
  const required = process.env.APP_PASSWORD || '';
  if(required && clientKey !== required){
    res.status(401).json({error:'unauthorized'}); return;
  }
  const MAP = {
  "abc_vendas": "UPSTREAM_ABC_VENDAS",
  "avaliacoes": "UPSTREAM_AVALIACOES",
  "cancelamentos": "UPSTREAM_CANCELAMENTOS",
  "conciliacao": "UPSTREAM_CONCILIACAO",
  "couvert_abc": "UPSTREAM_COUVERT_ABC",
  "couvert_pagamentos": "UPSTREAM_COUVERT_PAGAMENTOS",
  "delivery": "UPSTREAM_DELIVERY",
  "login_api": "UPSTREAM_LOGIN_API",
  "meta": "UPSTREAM_META",
  "reservas": "UPSTREAM_RESERVAS",
  "resumo_financeiro": "UPSTREAM_RESUMO_FINANCEIRO",
  "travas_comparacao": "UPSTREAM_TRAVAS_COMPARACAO"
};
  const envName = MAP[key];
  if(!envName){
    res.status(404).json({error:'unknown key', key}); return;
  }
  const target = process.env[envName];
  if(!target){ res.status(500).json({error:'missing upstream env', envName}); return; }

  // build target URL with forwarded query (except 'key')
  const url = new URL(target);
  for(const [k,v] of Object.entries(req.query)){ if(k!=='key') url.searchParams.set(k, v); }

  const init = {
    method: req.method,
    headers: {
      // forward no cookies, set content-type if sending JSON
      'content-type': req.headers['content-type'] || undefined
    }
  };
  if(req.method !== 'GET' && req.method !== 'HEAD' && req.body){
    init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }

  try{
    const r = await fetch(url.toString(), init);
    const ct = r.headers.get('content-type') || 'application/json';
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('content-type', ct);
    res.status(r.status).send(buf);
  }catch(e){
    res.status(502).json({error:'upstream fetch failed', details: String(e)})
  }
}