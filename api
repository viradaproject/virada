// Función en Vercel que manda un aviso push a un dispositivo concreto.
// Vercel la publica sola en /api/send-push en cuanto detecta este archivo
// dentro de la carpeta "api" de la raíz del proyecto — no hace falta nada más.
import webpush from "web-push";

webpush.setVapidDetails(
  "mailto:contacto@virada.app", // cualquier email de contacto sirve, Apple/Google lo piden
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  const { subscription, title, body, url } = req.body || {};
  if (!subscription || !subscription.endpoint) {
    res.status(400).json({ error: "Falta la suscripción del dispositivo" });
    return;
  }

  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({ title: title || "VIRADA", body: body || "", url: url || "/" })
    );
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
}
