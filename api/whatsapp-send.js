// /api/whatsapp-send.js
export default async function handler(req, res){
  try{
    const required = process.env.APP_PASSWORD || '';
    const clientKey = req.headers['x-api-key'] || req.headers['X-API-Key'] || '';
    if(required && clientKey !== required){
      res.status(401).json({ ok:false, error:'unauthorized' });
      return;
    }

    if(req.method !== 'POST'){
      res.setHeader('Allow','POST');
      res.status(405).json({ ok:false, error:'method_not_allowed' });
      return;
    }

    const body = await readJson(req);
    const to = (body.to || '').replace(/\D/g,''); // só números
    const text = body.text || 'Hello from Grupo DV!';

    if(!to){ res.status(400).json({ ok:false, error:'missing_to' }); return; }

    const ok = await send(to, text);
    res.status(200).json({ ok: true, sent: ok });
  }catch(e){
    console.error(e);
    res.status(500).json({ ok:false, error:'internal_error' });
  }
}

async function readJson(req){
  if(req.body){
    if (typeof req.body === 'string') { try{ return JSON.parse(req.body); }catch{ return {}; } }
    return req.body;
  }
  const raw = await new Promise((resolve, reject)=>{
    let data=''; req.on('data',c=>data+=c); req.on('end',()=>resolve(data)); req.on('error',reject);
  });
  try{ return JSON.parse(raw||'{}'); }catch{ return {}; }
}

async function send(to, text){
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;
  const payload = { messaging_product:'whatsapp', to, text:{ body:text } };

  const r = await fetch(url, {
    method:'POST',
    headers:{
      Authorization:`Bearer ${token}`,
      'Content-Type':'application/json'
    },
    body: JSON.stringify(payload)
  });
  if(!r.ok){ console.error('send error', await r.text()); return false; }
  return true;
}
