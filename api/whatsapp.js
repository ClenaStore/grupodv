// /api/whatsapp.js
// Webhook WhatsApp + agente com acesso aos seus /api (delivery/meta)
// PT-BR: entende "ontem/hoje/semana passada/mês atual/mês passado", empresa (ex.: Mercatto) e plataforma (iFood/Delivery Much).

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      // Verificação do webhook (Meta)
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];
      if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        return res.status(200).send(challenge);
      }
      return res.status(403).send('Forbidden');
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ ok: false, error: 'method_not_allowed' });
    }

    const body = await readJson(req);
    const value = body?.entry?.[0]?.changes?.[0]?.value || {};
    const msg = value?.messages?.[0];
    if (!msg) return res.status(200).json({ ok: true, ignored: true });

    const from = msg.from;
    const text = msg.type === 'text' ? (msg.text?.body || '') : '';

    // Marca como lida (não bloqueia fluxo)
    markReadSafe(msg.id).catch(()=>{});

    // 1) tenta responder com DADOS (delivery/meta)
    const answer = await answerWithYourData(text);

    // 2) se não deu, usa OpenAI como fallback contextual
    const reply = answer?.ok ? answer.text : await askOpenAI(text, answer?.reason);

    await sendWhatsAppText(from, reply);
    return res.status(200).json({ ok: true, used: answer?.ok ? 'data' : 'openai' });

  } catch (e) {
    console.error('[whatsapp webhook]', e);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
}

/* ==================== Núcleo de dados ==================== */

async function answerWithYourData(rawText) {
  const q = (rawText || '').trim();
  if (!q) return { ok: false, reason: 'empty' };

  // Descobrir empresa/plataforma/datas a partir do texto
  const tz = process.env.TIMEZONE || 'America/Sao_Paulo';
  const { start, end, label } = parseDateRangePT(q, tz);
  const wantDelivery = /delivery|ifood|i\s*food|much/i.test(q);
  const platform = parsePlatform(q); // 'ifood' | 'much' | null

  // Catálogo (empresas & plataformas) – via delivery (rápido) e meta (fallback)
  const catalog = await getCatalog();
  const empresa = matchEmpresa(q, catalog.empresas);

  // 1) DELIVERY (se o texto pedir delivery/iFood/Much ou se quisermos responder vendas por canal)
  if (wantDelivery || platform) {
    const items = await fetchDelivery(); // retorna tudo; filtramos aqui
    const filtered = items.filter(r => {
      const d = r.data?.slice(0, 10);
      if (!d) return false;
      if (empresa && r.empresa?.toLowerCase() !== empresa.toLowerCase()) return false;
      if (platform && !includesPlat(r.plataforma, platform)) return false;
      return d >= start && d <= end;
    });
    const total = sum(filtered.map(x => toNum(x.bruto)));
    if (total > 0) {
      const empTxt = empresa ? ` em ${empresa}` : '';
      const platTxt = platform ? ` no ${prettyPlat(platform)}` : '';
      return {
        ok: true,
        text: `Você vendeu **R$ ${fmtBRL(total)}**${empTxt}${platTxt} ${label}.`
      };
    }
    // tenta sem plataforma explícita
    if (!platform && filtered.length === 0 && empresa) {
      const allPlat = items.filter(r => {
        const d = r.data?.slice(0, 10);
        return d >= start && d <= end && r.empresa?.toLowerCase() === empresa.toLowerCase();
      });
      const total2 = sum(allPlat.map(x => toNum(x.bruto)));
      if (total2 > 0) {
        return { ok: true, text: `Você vendeu **R$ ${fmtBRL(total2)}** em ${empresa} (delivery, todas as plataformas) ${label}.` };
      }
    }
  }

  // 2) META (Realizado no período) – quando perguntam "quanto vendi" sem canal
  // /api/meta aceita filtros; melhor consultar direto o período/empresa
  try {
    const qs = new URLSearchParams();
    qs.set('dataInicio', start);
    qs.set('dataFim', end);
    if (empresa) qs.set('empresa', empresa);
    const meta = await getJson(`/api/meta?${qs.toString()}`, true);
    // soma "Realizado" (string pt-BR)
    const total = sum(meta.map(r => toNum(r.Realizado)));
    if (total > 0) {
      const empTxt = empresa ? ` em ${empresa}` : '';
      return { ok: true, text: `Você vendeu **R$ ${fmtBRL(total)}**${empTxt} ${label}.` };
    }
  } catch (_) { /* ignora */ }

  return { ok: false, reason: 'no_data' };
}

/* ==================== Helpers de dados ==================== */

function parseDateRangePT(text, timeZone = 'America/Sao_Paulo') {
  const now = zonedNow(timeZone);
  const iso = d => d.toISOString().slice(0,10);
  const lower = text.toLowerCase();

  // ontem
  if (/\bontem\b/.test(lower)) {
    const y = addDays(startOfDay(now), -1);
    return { start: iso(y), end: iso(y), label: 'ontem' };
  }
  // hoje
  if (/\bhoje\b/.test(lower)) {
    const h = startOfDay(now);
    return { start: iso(h), end: iso(h), label: 'hoje' };
  }
  // anteontem
  if (/\banteontem\b/.test(lower)) {
    const d = addDays(startOfDay(now), -2);
    return { start: iso(d), end: iso(d), label: 'anteontem' };
  }
  // semana passada (seg a dom da semana anterior)
  if (/\bsemana passada\b/.test(lower)) {
    const start = startOfWeek(addDays(now, -7));
    const end = addDays(start, 6);
    return { start: iso(start), end: iso(end), label: 'na semana passada' };
  }
  // mês atual
  if (/\bm[eê]s (atual|corrente|presente)\b/.test(lower) || /\beste m[eê]s\b/.test(lower)) {
    const start = startOfMonth(now);
    const end = now; // até hoje
    return { start: iso(start), end: iso(end), label: 'neste mês' };
  }
  // mês passado
  if (/\bm[eê]s passado\b/.test(lower)) {
    const start = startOfMonth(addMonths(now, -1));
    const end = endOfMonth(addMonths(now, -1));
    return { start: iso(start), end: iso(end), label: 'no mês passado' };
  }

  // padrão: ontem
  const y = addDays(startOfDay(now), -1);
  return { start: iso(y), end: iso(y), label: 'ontem' };
}

function parsePlatform(text) {
  const t = text.toLowerCase();
  if (t.includes('ifood') || t.includes('i food')) return 'ifood';
  if (t.includes('delivery much') || t.includes('much')) return 'much';
  return null;
}
function prettyPlat(p){ return p==='ifood' ? 'iFood' : p==='much' ? 'Delivery Much' : p; }
function includesPlat(val, p){
  if (!val) return false;
  const v = String(val).toLowerCase();
  return p==='ifood' ? (v.includes('ifood') || v.includes('i food')) :
         p==='much' ? (v.includes('much')) : false;
}

async function getCatalog(){
  // Descobre empresas e plataformas do delivery (e meta como fallback)
  const emp = new Set(), plat = new Set();
  try {
    const d = await fetchDelivery();
    d.forEach(x => { if (x.empresa) emp.add(x.empresa); if (x.plataforma) plat.add(x.plataforma); });
  } catch {}
  if (emp.size === 0) {
    try {
      const m = await getJson('/api/meta', true);
      m.forEach(x => { if (x.Empresa) emp.add(x.Empresa); });
    } catch {}
  }
  return { empresas: [...emp], plataformas: [...plat] };
}

function matchEmpresa(text, empresas){
  if (!empresas?.length) return null;
  const t = text.toLowerCase();
  // casa por substring simples
  const found = empresas.find(e => t.includes(String(e).toLowerCase()));
  return found || null;
}

async function fetchDelivery(){
  // Seu endpoint client-side não tinha filtros, então traz tudo e filtra aqui.
  return getJson('/api/delivery', true);
}

function toNum(v){
  if (typeof v === 'number') return v;
  if (v == null) return 0;
  // "1.234,56" -> 1234.56
  return Number(String(v).replace(/\./g,'').replace(',','.')) || 0;
}
function sum(arr){ return arr.reduce((a,b)=>a+b,0); }
function fmtBRL(n){ return (n||0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

/* ==================== Datas (TZ-aware simples) ==================== */
function zonedNow(tz){
  try{
    // cria "agora" no fuso via truque de format/parse
    const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: tz, hour12:false,
      year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit'});
    const parts = fmt.formatToParts(new Date());
    const get = (t)=>Number(parts.find(p=>p.type===t).value);
    return new Date(Date.UTC(get('year'), get('month')-1, get('day'), get('hour'), get('minute'), get('second')));
  }catch{ return new Date(); }
}
function startOfDay(d){ return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
function addDays(d, n){ const x=new Date(d); x.setUTCDate(x.getUTCDate()+n); return x; }
function startOfWeek(d){ const x=startOfDay(d); const wd=(x.getUTCDay()+6)%7; x.setUTCDate(x.getUTCDate()-wd); return x; } // segunda
function startOfMonth(d){ return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); }
function endOfMonth(d){ return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+1, 0)); }
function addMonths(d, n){ const x=new Date(d); x.setUTCMonth(x.getUTCMonth()+n); return x; }

/* ==================== HTTP util p/ seus endpoints ==================== */

function baseUrl(){
  // Usa INTERNAL_BASE_URL se definida, senão VERCEL_URL
  const b = process.env.INTERNAL_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  if (!b) throw new Error('INTERNAL_BASE_URL/VERCEL_URL não definida');
  return b.replace(/\/+$/,'');
}

async function getJson(pathOrUrl, includeKey){
  const url = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : `${baseUrl()}${pathOrUrl}`;
  const headers = { 'Content-Type': 'application/json' };
  if (includeKey && process.env.DV_API_KEY) headers['x-api-key'] = process.env.DV_API_KEY;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`);
  return r.json();
}

/* ==================== OpenAI fallback ==================== */

async function askOpenAI(userText, reason='fallback') {
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const sys = `Você é o assistente oficial do GRUPO DV no WhatsApp.
Quando não houver dados estruturados disponíveis pelos endpoints internos, responda de forma útil e peça o período/empresa.
Fale sempre em português do Brasil.`;

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: userText }
      ]
    })
  });
  const j = await r.json();
  return j?.choices?.[0]?.message?.content?.trim() || 'Certo! Como posso te ajudar hoje?';
}

/* ==================== WhatsApp send/read ==================== */

async function sendWhatsAppText(to, text) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;

  const payload = { messaging_product: 'whatsapp', to, text: { body: text } };

  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!r.ok) console.error('[whatsapp send error]', await r.text());
}

async function markReadSafe(messageId) {
  try{
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;
    const payload = { messaging_product: 'whatsapp', status: 'read', message_id: messageId };
    await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }catch(e){ /* noop */ }
}

/* ==================== low-level ==================== */
async function readJson(req) {
  if (req.body) {
    if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
    return req.body;
  }
  const raw = await new Promise((resolve, reject) => {
    let data = ''; req.on('data', c => data += c);
    req.on('end', () => resolve(data)); req.on('error', reject);
  });
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}
