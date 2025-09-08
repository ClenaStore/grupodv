// api/whatsapp.js

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Webhook verification (Meta)
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Verification failed');
  }

  if (req.method === 'POST') {
    try {
      const body = req.body;
      // Ack rápido se não for o objeto esperado
      if (body.object !== 'whatsapp_business_account') {
        return res.status(200).end();
      }
      const change = body.entry?.[0]?.changes?.[0]?.value;
      const msg = change?.messages?.[0];
      if (!msg) return res.status(200).end(); // somente status updates

      const from = msg.from; // telefone do cliente
      const text =
        msg.text?.body ||
        msg.button?.text ||
        msg.interactive?.list_reply?.title ||
        msg.interactive?.button_reply?.title ||
        '';

      const reply = await answer(text);
      await sendWhatsAppText(from, reply);
    } catch (e) {
      console.error('handler error', e);
      // Mesmo com erro, responda 200 para evitar retries excessivos
    }
    return res.status(200).end('ok');
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).end('Method Not Allowed');
}

/* ========= Envio de mensagem pelo WhatsApp ========= */
async function sendWhatsAppText(to, body) {
  const url = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
  });
  if (!r.ok) {
    console.error('WA send fail', await r.text());
  }
}

/* ========= “Inteligência” ========= */
async function answer(text) {
  const q = (text || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

  // Heurística: “quanto vendi no mercatto ontem”
  const lojaMatch = /(mercatto(?:\s+delicia| restaurante)?|delicia gourmet|padaria delicia|m\.?\s*kids|villa gourmet)/i.exec(
    text
  );
  const pediuQuantoVendi = /quanto\s+vendi/.test(q);
  const falouOntem = /\bontem\b/.test(q);

  if (pediuQuantoVendi && lojaMatch && falouOntem) {
    const loja = normalizeStore(lojaMatch[0]);
    const end = new Date();
    end.setDate(end.getDate() - 1);
    const start = new Date(end);

    const di = iso(start);
    const df = iso(end);

    try {
      const base = process.env.DV_BASE_URL?.replace(/\/$/, '') || '';
      const url = `${base}/api/meta?dataInicio=${di}&dataFim=${df}&empresa=${encodeURIComponent(loja)}`;
      const r = await fetch(url, {
        headers: { 'x-api-key': process.env.DV_API_KEY || '' },
      });
      const metas = (await r.json()) || [];
      const total = metas.reduce((acc, row) => acc + toNum(row.Realizado), 0);

      return `Ontem (${brDate(end)}) a *${loja}* vendeu *R$ ${brl(total)}*.`;
    } catch (e) {
      console.error('DV fetch fail', e);
      // cai pro fallback
    }
  }

  // Fallback: OpenAI (resposta simpática quando não encaixa nas heurísticas)
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Você é um assistente do Grupo DV no WhatsApp. Seja objetivo. Se a pergunta exigir números, peça um intervalo/loja.',
          },
          { role: 'user', content: text },
        ],
      }),
    });
    const j = await r.json();
    return j.choices?.[0]?.message?.content?.trim() || 'OK.';
  } catch {
    return 'OK.';
  }
}

/* ========= Util ========= */
function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function brDate(d) {
  return d.toLocaleDateString('pt-BR');
}
function brl(n) {
  return (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}
function toNum(v) {
  return typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.')) || 0;
}
function normalizeStore(s) {
  return s.replace(/\s+/g, ' ').trim().toUpperCase();
}

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };
