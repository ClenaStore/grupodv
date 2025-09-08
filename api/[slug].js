const MAP = {
  resumo_financeiro: process.env.UPSTREAM_RESUMO_FINANCEIRO,
  cancelamentos: process.env.UPSTREAM_CANCELAMENTOS,
  delivery: process.env.UPSTREAM_DELIVERY,
  meta: process.env.UPSTREAM_META,
  travas_comparacao: process.env.UPSTREAM_TRAVAS_COMPARACAO,
  conciliacao: process.env.UPSTREAM_CONCILIACAO,
  couvert_pagamentos: process.env.UPSTREAM_COUVERT_PAGAMENTOS,
  couvert_abc: process.env.UPSTREAM_COUVERT_ABC,
  abc_vendas: process.env.UPSTREAM_ABC_VENDAS,
  avaliacoes: process.env.UPSTREAM_AVALIACOES,
  reservas: process.env.UPSTREAM_RESERVAS,
  login_api: process.env.UPSTREAM_LOGIN_API
};
export default async function handler(req,res){
  const ok = (req.headers['x-api-key'] || req.headers['X-API-Key']) === process.env.APP_PASSWORD;
  if(!ok){ return res.status(401).json({error:'unauthorized'}); }
  const { slug } = req.query;
  const upstream = MAP[slug];
  if(!upstream){ return res.status(404).json({error:'unknown slug'}); }
  const url = new URL(upstream);
  for (const [k,v] of Object.entries(req.query||{})){ if(k!=='slug') url.searchParams.set(k,v); }
  try{
    const r = await fetch(url.toString(), { headers:{'Accept':'application/json'} });
    const txt = await r.text();
    try{ res.status(r.status).json(JSON.parse(txt)); }catch{ res.status(r.status).send(txt); }
  }catch(e){ res.status(500).json({error:'upstream_error', detail:String(e)}); }
}