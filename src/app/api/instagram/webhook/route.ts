import { after, NextResponse } from "next/server";
import { extraerCapturas, extraerNotas } from "@/lib/instagram/extraer";
import { firmaValida, tokenDeVerificacionValido } from "@/lib/instagram/firma";
import { guardarCapturas, guardarNotas } from "@/lib/instagram/guardar";

export const dynamic = "force-dynamic";
// Copiar un video de varios MB puede tardar: el trabajo sigue después de contestarle a Meta.
export const maxDuration = 60;

const MAX_CUERPO = 1_000_000;

/**
 * El webhook de Instagram (Testing Lab › Fuentes › Instagram). Meta lo llama dos veces de distinta forma:
 * - `GET` al registrarlo en el panel de la app: manda `hub.verify_token` y espera de vuelta `hub.challenge`.
 * - `POST` cada vez que alguien comparte algo por mensaje directo con la cuenta del equipo, con la firma del cuerpo.
 * No hay sesión de una persona: la única puerta es el secreto de la app (`INSTAGRAM_APP_SECRET`) y el token de verificación
 * (`INSTAGRAM_VERIFY_TOKEN`). Sin ellos configurados, todo se rechaza.
 */
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  if (p.get("hub.mode") !== "subscribe" || !tokenDeVerificacionValido(p.get("hub.verify_token"), process.env.INSTAGRAM_VERIFY_TOKEN)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  return new NextResponse(p.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(request: Request) {
  const largo = Number(request.headers.get("content-length") ?? 0);
  if (largo > MAX_CUERPO) return new NextResponse("Payload Too Large", { status: 413 });
  const crudo = await request.text();
  if (crudo.length > MAX_CUERPO) return new NextResponse("Payload Too Large", { status: 413 });
  if (!firmaValida(crudo, request.headers.get("x-hub-signature-256"), process.env.INSTAGRAM_APP_SECRET)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let aviso: unknown;
  try {
    aviso = JSON.parse(crudo);
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const capturas = extraerCapturas(aviso);
  const notas = extraerNotas(aviso);
  if (capturas.length > 0 || notas.length > 0) {
    // Primero las capturas y después las notas: un texto que llega en el mismo aviso se une a la captura recién guardada.
    after(async () => {
      if (capturas.length > 0) await guardarCapturas(aviso, capturas);
      if (notas.length > 0) await guardarNotas(notas);
    });
  }
  return NextResponse.json({ recibidas: capturas.length, notas: notas.length });
}
