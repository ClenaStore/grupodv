// /api/ask.js
// Assistente Grupo DV - versão robusta e completa
// Consulta todos os UPSTREAMS do proxy e responde com dados reais
// Nunca inventa valores. Sempre fala a verdade.

//
// --------- FUNÇÕES AUXILIARES ---------
//

// Data/hora ajustada para America/Bahia (-03:00, sem DST)
function nowBahia() {
  const nowUtc = Date.now();
  return new Date(nowUtc - 3 * 60 * 60 * 1000);
}
function fmtDiaLongo(d) {
  return d.toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}
function startOfDay(d) {
  const z = new Date(d);
  z.setHours(0,0,0,0);
  return z;
}
function endOfDay(d) {
  const z = new Date(d);
  z.setHours(23,59,59,999);
  return z;
}
function parsePtDateLike(s) {
  const ddmmyyyy = s.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
  if (ddmmyyyy) {
    const [_, dd, mm, yyyy] = ddmmyyyy;
    return new Date(Number(yyyy), Number(mm)-1, Number(dd));
  }
  const mmyyyy = s.match(/\b(\d{1,2})[\/\-](\d{4})\b/);
  if (mmyyyy) {
    const [_, mm, yyyy] = mmyyyy;
    return new Date(Number(yyyy), Number(mm)-1, 1);
  }
  return null;
}
function monthBounds(d) {
  const a = new Date(d.getFullYear(), d.getMonth(), 1);
  const b = new Date(d.getFullYear(), d.getMonth()+1, 0);
  return [startOfDay(a), endOfDay(b)];
}
function lastMonthBounds(base) {
  const d = new Date(base.getFullYear(), base.getMonth()-1, 1);
  return monthBounds(d);
}
function weekBounds(base) {
  const d = new Date(base);
  const dow = (d.getDay()+6)%7; // seg=0
  const a = new Date(d); a.setDate(d.getDate()-dow);
  const b = new Date(a); b.setDate(a.getDate()+6);
  return [startOfDay(a), endOfDay(b)];
}

//
// --------- NORMALIZAÇÃO DE EMPRESAS ---------
//
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
  let best = null;
  for (const k of Object.keys(COMPANY_ALIASES)) {
    if (up.includes(k)) { best = COMPANY_ALIASES[k]; }
  }
  return best;
}

//
// --------- DETECÇÃO DE PERÍODO ---------
//
function detectPeriod(question) {
  const q = question.toLowerCase();
  const now = nowBahia();

  const explicit = parsePtDateLike(question);
  if (explicit) {
    if (/\d{1,2}\/\d{1,2}\/\d{4}/.test(question)) {
      return { kind:"day", start: startOfDay(explicit), end: endOfDay(explicit), label: explicit.toLocaleDateString("pt-BR") };
    }
    const [a,b] = monthBounds(explicit);
    return { kind:"month", start:a, end:b, label: explicit.toLocaleDateString("pt-BR", { month:"long", year:"numeric" }) };
  }

  if (/\bhoje\b/.test(q)) {
    return { kind:"today", start:startOfDay(now), end:endOfDay(now), label:"hoje" };
  }
  if (/\bontem\b/.test(q)) {
    const d = new Date(now); d.setDate(d.getDate()-1);
    return { kind:"yesterday", start:startOfDay(d), end:endOfDay(d), label:"ontem" };
  }
  if (/(mes passado|mês passado)/.test(q)) {
    const [a,b] = lastMonthBounds(now);
    const label = a.toLocaleDateString("pt-BR", { month:"long", year:"numeric" });
    return { kind:"last_month", start:a, end:b, label:`${label}` };
  }
  if (/(mes retrasado|mês retrasado)/.test(q)) {
    const ref = new Date(now.getFullYear(), now.getMonth()-2, 1);
    const [a,b] = monthBounds(ref);
    const label = a.toLocaleDateString("pt-BR", { month:"long", year:"numeric" });
    return { kind:"prev_prev_month", start:a, end:b, label:`${label}` };
  }
  if (/(essa semana|esta semana|semana atual)/.test(q)) {
    const [a,b] = weekBounds(now);
    return { kind:"this_week", start:a, end:b, label:"esta semana" };
  }
  if (/semana passada/.test(q)) {
    const ref = new Date(now); ref.setDate(ref.getDate()-7);
    const [a,b] = weekBounds(ref);
    return { kind:"last_week", start:a, end:b, label:"semana passada" };
  }

  // fallback: mês atual
  const [a,b] = monthBounds(now);
  const label = a.toLocaleDateString("pt-BR", { month:"long", year:"numeric" });
  return { kind:"month", start:a, end:b, label:`${label}` };
}

//
// --------- OUTROS HELPERS ---------
//
function buildOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}
async function fetchJson(url, headers = {}) {
  const r = await fetch(url, { headers });
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { raw:text }; }
}
function needsData(question) {
  return /(mercatto|mercato|villa|padaria|delicia|delícia|meta|fatur|vendi|vendas|receita|cancelament|reserva|couvert|financeir|compar|percent|por cento|%|ontem|hoje|m[eê]s|semana)/i.test(question);
}
function isDateQuestion(question) {
  const q = question.trim().toLowerCase();
  return /\b(que dia e|que dia é|data de hoje|que dia)\b/.test(q);
}

//
// --------- HANDLER PRINCIPAL ---------
//
export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "method not allowed" }); return; }

  try {
    const { question } = req.body || {};
    if (!question) { res.status(400).json({ error: "missing question" }); return; }

    // 1) Perguntas de data → direto no servidor
    if (isDateQuestion(question)) {
      const now = nowBahia();
      const answer = `Hoje é ${fmtDiaLongo(now)}.`;
      res.status(200).json({ answer, meta: { now_iso: now.toISOString() } });
      return;
    }

    const origin = buildOrigin(req);
    const headers = {};
    if (process.env.APP_PASSWORD) headers["x-api-key"] = process.env.APP_PASSWORD;

    let dataBundle = null;
    if (needsData(question)) {
      const empresa = normalizeCompany(question) || null;
      const periodo = detectPeriod(question);
      const periodInfo = {
        start_iso: periodo.start.toISOString(),
        end_iso: periodo.end.toISOString(),
        label: periodo.label
      };

      const keys = [
        "meta",
        "resumo_financeiro",
        "abc_vendas",
        "cancelamentos",
        "couvert_abc",
        "couvert_pagamentos",
        "reservas",
        "conciliacao",
        "concil",
        "delivery",
        "avaliacoes",
        "travas_comparacao"
      ];

      const urls = keys.map(k => `${origin}/api?key=${encodeURIComponent(k)}`);
      const results = await Promise.allSettled(urls.map(u => fetchJson(u, headers)));
      const pack = {};
      results.forEach((r, i) => { pack[keys[i]] = r.status === "fulfilled" ? r.value : { error: String(r.reason || "fetch_failed") }; });

      dataBundle = {
        empresa_preferida: empresa,
        periodo: periodInfo,
        dados: pack
      };
    }

    // 3) OpenAI
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) { res.status(500).json({ error: "missing OPENAI_API_KEY" }); return; }

    const systemPrompt = `
Você é o Assistente Grupo DV.

REGRAS IMPORTANTES:
- Use APENAS os dados JSON fornecidos neste chat quando a pergunta for sobre as empresas/relatórios.
- Se não houver dados suficientes para responder com número, diga exatamente: "Não encontrei dados suficientes para esse pedido."
- Para percentuais: percentual = ((valor_atual - valor_base) / |valor_base|) * 100. Informe 2 casas decimais.
- Se a pergunta for sobre a data atual, já foi respondida pelo servidor.
- Tolerar erros de português e variações de nome de empresa (ex: "mercato" → "MERCATTO DELÍCIA").
- Ao responder, cite claramente o período usado (ex: "ontem", "mês passado", ou datas ISO).
- Nunca invente valores. Se algum upstream estiver vazio, diga que está indisponível.
    `.trim();

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: question }
    ];

    if (dataBundle) {
      messages.push({
        role: "system",
        content: "DADOS_JSON = " + JSON.stringify(dataBundle, null, 2)
      });
    }

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        messages
      })
    });

    const data = await r.json();
    const answer = data?.choices?.[0]?.message?.content || "Não encontrei dados suficientes para esse pedido.";
    res.status(200).json({ answer });
  } catch (e) {
    res.status(500).json({ error: "assistant failed", details: String(e) });
  }
}
