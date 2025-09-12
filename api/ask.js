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

    // Prompt base do assistente
    const systemPrompt = `
      Você é o Assistente Grupo DV.
      Responde perguntas sobre faturamento, cancelamentos, metas, couvert, reservas e outros relatórios.
      Os dados podem ser acessados nos endpoints via /api/[key].
      Interprete perguntas mesmo com erros de português.
      Se for pedido comparação entre meses ou empresas, explique o cálculo e dê o percentual.
      Se não houver dados suficientes, diga "preciso de mais dados".
    `;

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question }
        ],
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
