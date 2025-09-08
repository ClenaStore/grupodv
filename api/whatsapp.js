// /api/whatsapp.js
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      // Webhook verification (Meta)
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];
      if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        res.status(200).send(challenge);
      } else {
        res.status(403).send('Forbidden');
      }
      return;
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      res.status(405).json({ ok: false, error: 'method_not_allowed' });
      return;
    }

    const body = await readJson(req);
    // Estrutura do Webhook: entry[0].changes[0].value.messages[0]
    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value || {};
    const messages = value?.messages || [];
    const msg = messages[0];

    // Meta também manda "statuses" etc; ignore se não houver mensagem
    if (!msg) {
      res.status(200).json({ ok: true, ignored: true });
      return;
    }

    // Se for mensagem de texto, processa
    const from = msg.from; // telefone do usuário (ex.: 55xxxxxxxxxx)
    const type = msg.type;
    const text = type === 'text' ? (msg.text?.body || '') : '';

    // Marca como lida (opcional)
    if (msg.id) {
      // não bloqueia o fluxo se falhar
      markReadSafe(msg.id);
    }

    // Simple guard: sem conteúdo, envia ajuda
    const userText = (text || '').trim();
    const prompt = userText || 'Ajude o usuário com uma saudação.';

    // Chama OpenAI
    const reply = await askOpenAI(prompt);

    // Responde no WhatsApp
    await sendWhatsAppText(from, reply);

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[whatsapp webhook]', e);
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
}

/** Util: ler JSON mesmo em serverless "cru" */
async function readJson(req) {
  if (req.body) {
    if (typeof req.body === 'string') {
      try { return JSON.parse(req.body); } catch { return {}; }
    }
    return req.body;
  }
  const raw = await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

/** Chama OpenAI (chat.completions) */
async function askOpenAI(userText) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const sys = `Você é o assistente oficial do GRUPO DV via WhatsApp.
Responda de forma objetiva e clara, em português.
Se o usuário pedir números de período, peça datas se necessário.
Se pedirem algo do painel, explique o caminho ou peça detalhes.`;

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: userText },
      ],
    }),
  });

  const j = await r.json();
  const content = j?.choices?.[0]?.message?.content?.trim();
  return content || 'Certo! Como posso te ajudar hoje?';
}

/** Envia texto pelo WhatsApp Cloud API */
async function sendWhatsAppText(to, text) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    to,
    text: { body: text },
  };

  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    const e = await r.text();
    console.error('[whatsapp send error]', e);
  }
}

/** Marca mensagem como lida (não bloqueia fluxo) */
async function markReadSafe(messageId) {
  try {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    };
    await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn('markRead failed', e);
  }
}
