// Runtime: Node.js 20 (configurado no vercel.json)
// Endpoint: GET  /api/whatsapp  -> validação do webhook (hub.challenge)
//           POST /api/whatsapp  -> eventos de mensagem

import crypto from "node:crypto";

// ==== ENV OBRIGATÓRIAS ====
// WHATSAPP_VERIFY_TOKEN   -> o mesmo texto que você coloca no painel Meta (ex.: "Verificação")
// WHATSAPP_TOKEN          -> token de acesso (permanente) do WhatsApp Cloud API
// WHATSAPP_PHONE_NUMBER_ID-> id do número no Cloud API
// OPENAI_API_KEY          -> sua chave da OpenAI
// DV_BASE_URL             -> seu domínio (ex.: https://grupodv.vercel.app)
// DV_API_KEY              -> a mesma x-api-key que você já usa nos painéis
// WHATSAPP_APP_SECRET     -> (opcional) App Secret para validar assinatura X-Hub-Signature-256

const {
  WHATSAPP_VERIFY_TOKEN,
  WHATSAPP_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  OPENAI_API_KEY,
  DV_BASE_URL,
  DV_API_KEY,
  WHATSAPP_APP_SECRET
} = process.env;

// util: ler raw body (pra validar assinatura, se você quiser)
async function readRawBody(req) {
  return await new Promise((resolve, reject) => {
    let data = [];
    req.on("data", (chunk) => data.push(chunk));
    req.on("end", () => resolve(Buffer.concat(data)));
    req.on("error", reject);
  });
}

// valida assinatura meta (opcional, recomendado em prod)
function verifyMetaSignature(rawBody, signatureHeader) {
  if (!WHATSAPP_APP_SECRET) return true; // skip se não configurou
  if (!signatureHeader) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", WHATSAPP_APP_SECRET)
    .update(rawBody)
    .digest("hex");
  // compare timing-safe
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}

// helpers
const graphBase = "https://graph.facebook.com/v20.0";

async function sendWhats(to, text) {
  const url = `${graphBase}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text.slice(0, 4096) }
    })
  });
  if (!r.ok) {
    const t = await r.text().catch(()=> "");
    console.error("Erro ao enviar WhatsApp:", r.status, t);
  }
}

// consulta suas APIs internas com x-api-key
async function dvFetch(path, params = {}) {
  const u = new URL(path, DV_BASE_URL);
  Object.entries(params).forEach(([k,v]) => v!=null && u.searchParams.set(k, v));
  const r = await fetch(u.toString(), { headers: { "x-api-key": DV_API_KEY } });
  if (!r.ok) throw new Error(`DV API ${path} falhou: ${r.status}`);
  return r.json();
}

function toISO(d){ // Date -> YYYY-MM-DD
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function brl(n){ return (Number(n)||0).toLocaleString("pt-BR",{minimumFractionDigits:2}); }

// “entendimento” rápido de perguntas estruturadas (pode evoluir com LLM)
function parseIntent(text){
  const t = (text||"").toLowerCase();
  // quanto vendi no mercatto ontem/hoje/05-09-2025
  const m = t.match(/quanto\s+vendi\s+no\s+([a-z0-9\.\-\s]+)\s+(ontem|hoje|dia\s+\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (m){
    let empresa = m[1].trim().toUpperCase();
    let diaTxt = m[2].toLowerCase();
    let when;
    const now = new Date();
    if (diaTxt === "hoje") when = new Date(now);
    else if (diaTxt === "ontem"){ when = new Date(now); when.setDate(now.getDate()-1); }
    else {
      // "dia 05/09/2025" ou "05/09/2025"
      const dmatch = diaTxt.replace("dia","").trim();
      const [dd,mm,yy] = dmatch.split("/");
      const yyyy = (yy.length===2) ? ("20"+yy) : yy;
      when = new Date(Number(yyyy), Number(mm)-1, Number(dd));
    }
    return { kind: "sales_day_company", empresa, date: when };
  }
  // total delivery por plataforma (ifood / delivery much) no mês atual
  const m2 = t.match(/(ifood|delivery\s*much).*(este\s*m[eê]s|m[eê]s\s+atual)/i);
  if (m2){
    const plataforma = m2[1].toLowerCase();
    return { kind: "delivery_month_platform", plataforma };
  }
  return { kind: "free_text" };
}

async function answerIntent(intent){
  if (intent.kind === "sales_day_company"){
    const di = toISO(intent.date);
    const df = di;
    // usa /api/meta para somar Realizado da empresa no dia
    const data = await dvFetch("/api/meta", { empresa:intent.empresa, dataInicio: di, dataFim: df });
    const total = data.reduce((s, r) => s + Number(String(r.Realizado).replace(/\./g,"").replace(",", ".")) , 0);
    return `No dia ${di.split("-").reverse().join("/")}, a ${intent.empresa} vendeu R$ ${brl(total)}.`;
  }
  if (intent.kind === "delivery_month_platform"){
    const now = new Date();
    const di = toISO(new Date(now.getFullYear(), now.getMonth(), 1));
    const df = toISO(new Date(now.getFullYear(), now.getMonth()+1, 0));
    const delivery = await dvFetch("/api/delivery");
    const filtro = delivery.filter(d => {
      const dISO = d.data?.slice(0,10);
      const between = dISO >= di && dISO <= df;
      const plat = (d.plataforma||"").toLowerCase();
      return between && (plat.includes(intent.plataforma.includes("ifood")?"ifood":"much"));
    });
    const bruto = filtro.reduce((s,d)=> s + Number(d.bruto||0), 0);
    return `No mês atual no ${intent.plataforma}, o bruto acumulado é R$ ${brl(bruto)}.`;
  }
  // fallback OpenAI
  const prompt = `Você é um assistente do Grupo DV. Responda de forma objetiva em PT-BR:\n\n${intent._raw || ""}`;
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method:"POST",
    headers:{ "Authorization":`Bearer ${OPENAI_API_KEY}`, "Content-Type":"application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{role:"system", content:"Você é um analista financeiro do Grupo DV."},
                 {role:"user", content: prompt}]
    })
  });
  const j = await r.json();
  return j?.choices?.[0]?.message?.content?.trim() || "Ok.";
}

export default async function handler(req, res){
  if (req.method === "GET"){
    // validação do Webhook (hub.challenge)
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN){
      res.status(200).send(challenge);
    } else {
      res.status(403).send("Forbidden");
    }
    return;
  }

  if (req.method === "POST"){
    const raw = await readRawBody(req);
    const okSignature = verifyMetaSignature(raw, req.headers["x-hub-signature-256"]);
    if (!okSignature){
      // se não configurou APP_SECRET, essa verificação retorna true lá em cima
      console.warn("Assinatura Meta inválida.");
    }
    let body = {};
    try{ body = JSON.parse(raw.toString("utf8")||"{}"); }catch{}

    // Estrutura de entrada do WhatsApp Cloud API
    const changes = body?.entry?.[0]?.changes?.[0];
    const messages = changes?.value?.messages;
    if (messages && messages.length){
      const msg = messages[0];
      const from = msg.from; // telefone do cliente
      const text = msg.text?.body || "";

      // roteamento simples por intenção
      const intent = parseIntent(text);
      intent._raw = text;
      let reply;
      try{
        reply = await answerIntent(intent);
      }catch(e){
        console.error("Falha ao responder:", e);
        reply = "Não consegui consultar agora. Tente novamente em instantes.";
      }
      await sendWhats(from, reply);
    }

    // importante: responder 200 OK sempre
    res.status(200).json({ received: true });
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).end("Method Not Allowed");
}
