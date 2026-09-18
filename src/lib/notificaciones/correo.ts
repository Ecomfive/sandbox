const RESEND_API_URL = "https://api.resend.com/emails";

/**
 * Envía un correo vía la API de Resend. Si RESEND_API_KEY no está configurada
 * (todavía no se creó la cuenta), no hace nada — así el cron nunca falla por
 * esto mientras se termina de configurar.
 */
export async function enviarCorreo({
  destinatarios,
  asunto,
  html,
}: {
  destinatarios: string[];
  asunto: string;
  html: string;
}): Promise<{ enviado: boolean; motivo?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { enviado: false, motivo: "RESEND_API_KEY no configurada" };
  }
  if (destinatarios.length === 0) {
    return { enviado: false, motivo: "Sin destinatarios (NOTIFICACIONES_EMAIL vacío)" };
  }

  const from = process.env.RESEND_FROM || "Ecomfive <onboarding@resend.dev>";

  const respuesta = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: destinatarios, subject: asunto, html }),
  });

  if (!respuesta.ok) {
    const texto = await respuesta.text();
    throw new Error(`Resend respondió ${respuesta.status}: ${texto}`);
  }

  return { enviado: true };
}
