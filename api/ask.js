// /api/ask.js
// Assistente Grupo DV - Completo com memória, reset, upstreams e inteligência ChatGPT

// --------- MEMÓRIA GLOBAL ---------
if (!globalThis.__ASSISTENTE_MEMORIA__) {
  globalThis.__ASSISTENTE_MEMORIA__ = [];
}

// --------- FUNÇÕES DE DATA ---------
function nowBahia() {
  const nowUtc = Date.now();
  return new Date(nowUtc - 3 * 60 * 60 * 1000);
}
function fmtDiaLongo(d) {
  return d.toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}
function startOfDay(d) {
  const z = new Date(d); z.setHours(0,0,0,0); return z;
}
function endOfDay(d) {
  const z = new Date(d); z.setHours(23,59,59,999); return z;
}
function parsePtDateLike(s) {
  const ddmmyyyy = s.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
  if (ddmmyyyy) return new Date(Number(ddmmyyyy[3]), Number(ddmmyyyy[2])-1, Number(ddmmyyyy[1]));
  const mmyyyy = s.match(/\b(\d{1,2})[\/\-](\d{4})\b/);
  if (mmyyyy) return new Date(Number(mmyyyy[2]), Number(mmyyyy[1])-1, 1);
  return null;
}
function monthBounds(d) {
  return [startOfDay(new Date(d.getFullYear(), d.getMonth(), 1)), endOfDay(new Date(d.getFullYear(), d.getMonth()+1, 0))];
}
function lastMonthBounds(base) {
  return monthBounds(new Date(base.getFullYear(), base.getMonth()-1, 1));
}
function weekBounds(base) {
  const d = new Date(base);
  const dow = (d.getDay()+6)%7;
  const a = new Date(d); a.setDate(d.getDate()-dow);
  const b = new Date(a); b.setDate(a.getDate()+6);
  return [startOfDay(a), endOfDay(b)];
}

// --------- EMPRESAS ---------
const COMPANY_ALIASES = {
  "MERCATTO": "MERCATTO DELÍCIA",
  "MERCATTO DELICIA": "MERCATTO DELÍCIA",
  "MERCATO": "MERCATTO DELÍCIA",
  "VILLA": "VILLA GOURMET",
  "VILLA GOURMET": "VILLA GOURMET",
  "PADARIA": "PADARIA DELÍCIA",
  "PADARIA DELICIA": "PADARIA DELÍCIA",
  "DELÍCIA GOURMET": "DELÍCIA GOURMET",
  "DELICIA GOURMET": "DELÍCIA GOURMET",
  "M.KIDS": "M.KIDS",
  "MKIDS": "M.KIDS"
};
function normalizeCompany(q) {
  const up = q.normalize("NFD").replace(/\p{Diacritic}/gu,"").toUpperCase();
  return Object.keys(COMPANY_ALIASES).find(k => up.includes(k)) ? COMPANY_ALIASES[Object.keys(COMPANY_ALIASES).find(k => up.includes(k))] : null;
}

// --------- DETECÇÃO DE PERÍODO ---------
function detectPeriod(question) {
  const q = question.toLowerCase();
  const now = nowBahia();
  const explicit = parsePtDateLike(question);
  if (explicit) {
    if (/\d{1,2}\/\d{1,2}\/\d{4}/.test(question))
      return { kind:"day", start:startOfDay(explicit), end:endOfDay(explicit), label: explicit.toLocaleDateString("pt-BR") };
    const [a,b] = monthBounds(explicit);
    return { kind:"month", start:a, end:b, label: explicit.toLocaleDateString("pt-BR", { month:"long", year:"numeric" }) };
  }
  if (/\bhoje\b/.test(q)) return { kind:"today", start:startOfDay(now), end:endOfDay(now), label:"hoje" };
  if (/\bontem\b/.test(q)) { const d=new Date(now); d.setDate(d.getDate()-1); return { kind:"yesterday", start:startOfDay(d), end:endOfDay(d), label:"ontem" }; }
  if (/(mes passado|mês passado)/.test(q)) { const [a,b]=lastMonthBounds(now); return { kind:"last_month", start:a, end:b, label:a.toLocaleDateString("pt-BR",{month:"long",year:"numeric"}) }; }
  if (/semana passada/.test(q)) { const ref=new Date(now); ref.setDate(ref.getDate()-7); const [a,b]=weekBounds(ref); return { kind:"last_week", start:a, end:b, label:"semana passada" }; }
  const [a,b]=monthBounds(now); return { kind:"month", start:a, end:b, label:a.toLocaleDateString("pt-BR",{month:"long",year:"numeric"}) };
}

// --------- HELPERS ---------
function buildOrigin(req) {
  return `${req.headers["x-forwarded-proto"]||"https"}://${req.headers["x-forwarded-host"]||req.headers.host}`;
}
async function fetchJson(url, headers = {}) {
  const r = await fetch(url, { headers }); const text=await r.text(); try{return JSON.parse(text);}catch{return {raw:text}} }
function needsData(question) {
  return /(mercatto|mercato|villa|padaria|delicia|meta|fatur|vendi|cancel|reserva|couvert|financeir|compar|percent|%)/i.test(question);
}
function isDateQuestion(q) { return /\b(que dia e|que dia é|data de hoje|que dia)\b/i.test(q); }
function isTimeQuestion(q) { return /\b(que horas|hora atual|horas agora)\b/i.test(q); }

// --------- HANDLER ---------
export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error:"method not allowed" }); return; }
  try {
    const { question } = req.body || {};
    if (!question) { res.status(400).json({ error:"missing question" }); return; }

    // Reset memória
    if (question.trim().toUpperCase() === "COMANDO 2") {
      globalThis.__ASSISTENTE_MEMORIA__ = [];
      res.status(200).json({ answer:"🔄 Memória apagada. Estou começando do zero!" });
      return;
    }

    // Data/hora direto
    if (isDateQuestion(question)) {
      const now=nowBahia(); const answer=`Hoje é ${fmtDiaLongo(now)}.`; 
      globalThis.__ASSISTENTE_MEMORIA__.push({role:"assistant",content:answer}); 
      res.status(200).json({ answer }); return;
    }
    if (isTimeQuestion(question)) {
      const now=nowBahia(); const hora=now.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",second:"2-digit"}); 
      const answer=`Agora são ${hora} (horário Bahia).`;
      globalThis.__ASSISTENTE_MEMORIA__.push({role:"assistant",content:answer});
      res.status(200).json({ answer }); return;
    }

    // Consulta dados
    let dataBundle=null;
    if (needsData(question)) {
      const empresa=normalizeCompany(question)||null;
      const periodo=detectPeriod(question);
      const periodInfo={ start_iso:periodo.start.toISOString(), end_iso:periodo.end.toISOString(), label:periodo.label };
      const origin=buildOrigin(req);
      const headers={}; if(process.env.APP_PASSWORD) headers["x-api-key"]=process.env.APP_PASSWORD;
      const keys=["meta","resumo_financeiro","abc_vendas","cancelamentos","couvert_abc","couvert_pagamentos","reservas","conciliacao","concil","delivery","avaliacoes","travas_comparacao"];
      const urls=keys.map(k=>`${origin}/api?key=${encodeURIComponent(k)}`);
      const results=await Promise.allSettled(urls.map(u=>fetchJson(u,headers)));
      const pack={}; results.forEach((r,i)=>{ pack[keys[i]]=r.status==="fulfilled"?r.value:{error:String(r.reason||"fetch_failed")}; });
      dataBundle={ empresa_preferida:empresa, periodo:periodInfo, dados:pack };
    }

    // OpenAI
    const apiKey=process.env.OPENAI_API_KEY;
    if (!apiKey) { res.status(500).json({ error:"missing OPENAI_API_KEY" }); return; }
    const systemPrompt=`
Você é o Assistente Grupo DV.
- Você tem memória e deve responder com base no histórico e nos dados JSON.
- Se faltar dado, diga: "Não encontrei dados suficientes para esse pedido."
- Nunca invente valores financeiros.
- Calcule percentuais: ((valor_atual - valor_base)/|valor_base|)*100 com 2 casas decimais.
- Tolerar erros de português e variações de empresa.
- Cite sempre o período considerado (ontem, mês passado, datas ISO).
`.trim();

    const history=globalThis.__ASSISTENTE_MEMORIA__||[];
    history.push({ role:"user", content:question });
    const messages=[ {role:"system",content:systemPrompt}, ...history ];
    if (dataBundle) messages.push({role:"system",content:"DADOS_JSON = "+JSON.stringify(dataBundle,null,2)});

    const r=await fetch("https://api.openai.com/v1/chat/completions",{
      method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${apiKey}` },
      body:JSON.stringify({ model:"gpt-4o-mini", temperature:0.2, messages })
    });
    const data=await r.json();
    const answer=data?.choices?.[0]?.message?.content || "Não encontrei dados suficientes para esse pedido.";

    history.push({ role:"assistant", content:answer });
    globalThis.__ASSISTENTE_MEMORIA__=history;

    res.status(200).json({ answer });
  } catch(e) {
    res.status(500).json({ error:"assistant failed", details:String(e) });
  }
}
