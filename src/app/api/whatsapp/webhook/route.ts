import { after, NextResponse } from "next/server";
// La firma de Meta es la misma para Instagram y WhatsApp (X-Hub-Signature-256 con el secreto de la app).
import { firmaValida, tokenDeVerificacionValido } from "@/lib/instagram/firma";
import { createServiceClient } from "@/lib/supabase/server";
import { extraerAviso } from "@/lib/whatsapp/extraer";
import { extraerEventosCuenta, hayCamposNuevos, resumenDeAviso } from "@/lib/whatsapp/eventos";
import { guardarEntrantes, guardarEstados } from "@/lib/whatsapp/guardar";
import { aplicarEventosCuenta } from "@/lib/whatsapp/plantillas-servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_CUERPO = 1_000_000;

/**
 * El webhook de WhatsApp (CRM Dropshippers › Bandeja de WhatsApp, 26 oct 2026). Meta lo llama de dos formas:
 * - `GET` al registrarlo en el panel de la app: manda `hub.verify_token` y espera de vuelta `hub.challenge`.
 * - `POST` con cada mensaje que le llega a un número de la empresa y con los estados de los que mandó el equipo, firmado.
 * No hay sesión de una persona: la única puerta es el secreto de la app (`WHATSAPP_APP_SECRET`) y el token de verificación
 * (`WHATSAPP_VERIFY_TOKEN`). Sin ellos configurados, todo se rechaza. Se contesta enseguida y se guarda después (Meta reintenta si
 * tarda).
 */
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  if (p.get("hub.mode") !== "subscribe" || !tokenDeVerificacionValido(p.get("hub.verify_token"), process.env.WHATSAPP_VERIFY_TOKEN)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  return new NextResponse(p.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(request: Request) {
  const largo = Number(request.headers.get("content-length") ?? 0);
  if (largo > MAX_CUERPO) return new NextResponse("Payload Too Large", { status: 413 });
  const crudo = await request.text();
  if (crudo.length > MAX_CUERPO) return new NextResponse("Payload Too Large", { status: 413 });
  if (!firmaValida(crudo, request.headers.get("x-hub-signature-256"), process.env.WHATSAPP_APP_SECRET)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  let aviso: unknown;
  try {
    aviso = JSON.parse(crudo);
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }
  // Si llega algo que la bandeja no entiende (o de otra forma), queda una línea en los registros: solo nombres, nunca el contenido.
  const resumen = resumenDeAviso(aviso);
  if (hayCamposNuevos(resumen.campos)) console.log(`[whatsapp] ${"Meta"} aviso con campos: ${resumen.campos.join(", ") || "(ninguno)"}; claves: ${resumen.claves.join(", ")}`);
  const { mensajes, estados, ecos } = extraerAviso(aviso);
  // Plantillas aprobadas o rechazadas, calidad, categoría, límite del número y restricciones de la cuenta.
  const eventos = extraerEventosCuenta(aviso);
  if (mensajes.length || estados.length || ecos.length || eventos.length) {
    after(async () => {
      await aplicarEventosCuenta(createServiceClient(), eventos);
      await guardarEntrantes(mensajes);
      // Lo que se respondió desde la app del celular (coexistencia), para que la bandeja y los KPIs lo cuenten.
      await guardarEntrantes(ecos, true);
      await guardarEstados(estados);
    });
  }
  return NextResponse.json({ mensajes: mensajes.length, estados: estados.length, ecos: ecos.length, eventos: eventos.length });
}
