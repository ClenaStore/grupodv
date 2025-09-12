export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  try {
    const { question } = req.body;
    if (!question) {
      res.status(400).json({ error: "missing question" });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "missing OPENAI_API_KEY" });
      return;
    }

    // 🔹 Passo 1: decide se precisa de dados
    const precisaDados = /(mercatto|villa gourmet|meta|faturamento|cancelamentos|reservas|couvert|financeiro|vendi|ontem|mês|período)/i.test(question);

    let dadosContexto = {};
    if (precisaDados) {
      try {
        // Aqui você pode chamar vários upstreams
        const urls = [
          "/api/meta",
          "/api/resumo_financeiro",
          "/api/abc_vendas",
          "/api/cancelamentos",
          "/api/couvert_abc",
          "/api/couvert_pagamentos",
          "/api/reservas"
        ];

        const responses = await Promise.all(
          urls.map(u => fetch(process.env.BASE_URL + u).then(r => r.json()).catch(() => null))
        );

        dadosContexto = {
          meta: responses[0],
          resumo_financeiro: responses[1],
          abc_vendas: responses[2],
          cancelamentos: responses[3],
          couvert_abc: responses[4],
          couvert_pagamentos: responses[5],
          reservas: responses[6]
        };
      } catch (err) {
        console.error("Erro ao buscar upstreams", err);
      }
    }

    // 🔹 Prompt base
    const systemPrompt = `
      Você é o Assistente Grupo DV.
      Você deve interpretar perguntas de forma flexível (mesmo com erros de português).
      Você tem acesso tanto ao conhecimento geral quanto a dados específicos em JSON.
      Sempre que possível, use os dados fornecidos para responder.
      Se os dados não forem suficientes, avise que precisa de mais detalhes.
    `;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: question }
    ];

    if (precisaDados) {
      messages.push({
        role: "system",
        content: "Aqui estão os dados disponíveis em JSON: " + JSON.stringify(dadosContexto)
      });
    }

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        temperature: 0.2
      })
    });

    const data = await r.json();
    const answer = data?.choices?.[0]?.message?.content || "Não consegui gerar resposta.";

    res.status(200).json({ answer });
  } catch (e) {
    res.status(500).json({ error: "assistant failed", details: String(e) });
  }
}
