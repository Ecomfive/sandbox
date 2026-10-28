import { after, NextResponse } from "next/server";
import { tokenDeVerificacionValido } from "@/lib/instagram/firma";
import { extraerAviso } from "@/lib/whatsapp/extraer";
import { guardarEntrantes, guardarEstados } from "@/lib/whatsapp/guardar";
import { NUMERO_360_SIN_ID } from "@/lib/whatsapp/proveedor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_CUERPO = 1_000_000;

/**
 * El webhook de WhatsApp por 360dialog (28 oct 2026, ver `src/lib/whatsapp/proveedor.ts`). 360dialog reenvía los avisos de Meta con el
 * mismo formato (mensajes, estados y ecos del celular) pero **sin firma**: la única puerta es la palabra secreta de la dirección
 * (`/api/whatsapp/360dialog/<D360_WEBHOOK_CLAVE>`), comparada en tiempo constante. Sin ella configurada, todo se rechaza. Se registra
 * desde la bandeja con «Conectar el webhook de 360dialog». Se contesta enseguida y se guarda después.
 */
export async function POST(request: Request, { params }: { params: Promise<{ clave: string }> }) {
  const { clave } = await params;
  if (!tokenDeVerificacionValido(clave, process.env.D360_WEBHOOK_CLAVE)) return new NextResponse("Not Found", { status: 404 });
  const largo = Number(request.headers.get("content-length") ?? 0);
  if (largo > MAX_CUERPO) return new NextResponse("Payload Too Large", { status: 413 });
  const crudo = await request.text();
  if (crudo.length > MAX_CUERPO) return new NextResponse("Payload Too Large", { status: 413 });
  let aviso: unknown;
  try {
    aviso = JSON.parse(crudo);
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }
  const { mensajes, estados, ecos } = extraerAviso(aviso, NUMERO_360_SIN_ID);
  if (mensajes.length || estados.length || ecos.length) {
    after(async () => {
      await guardarEntrantes(mensajes);
      await guardarEntrantes(ecos, true);
      await guardarEstados(estados);
    });
  }
  return NextResponse.json({ mensajes: mensajes.length, estados: estados.length, ecos: ecos.length });
}
