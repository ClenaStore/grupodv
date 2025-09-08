const VERIFY = process.env.WHATSAPP_VERIFY_TOKEN || "GRUPODV2025";

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") {
      // Verificação de webhook (Meta -> GET ?hub.*)
      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];

      if (mode === "subscribe" && token === VERIFY) {
        res.status(200).send(challenge);
      } else {
        res.status(403).send("Forbidden");
      }
      return;
    }

    if (req.method === "POST") {
      // Recebe notificações do WhatsApp
      const body = req.body || {};
      console.log("INCOMING WPP WEBHOOK:", JSON.stringify(body));

      // Sempre responda 200 em até 10s para o Meta não desligar seu webhook
      res.status(200).json({ received: true });
      return;
    }

    res.setHeader("Allow", "GET, POST");
    res.status(405).send("Method Not Allowed");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};
