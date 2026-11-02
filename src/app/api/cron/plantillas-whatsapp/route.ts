import { NextResponse } from "next/server";
import { esPeticionDeCron } from "@/lib/seguridad/cron";
import { createServiceClient } from "@/lib/supabase/server";
import { revisarPlantillasEnRevision } from "@/lib/whatsapp/revision-plantillas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Revisa con Meta las plantillas de WhatsApp que siguen «en revisión» y pone al día su estado (30 oct 2026). Es el respaldo del aviso de aprobación o rechazo, que con 360dialog no está confirmado
 * que llegue. Sin plantillas en revisión no llama a Meta. Solo lo acepta el cron de Vercel (`CRON_SECRET`).
 */
export async function GET(request: Request) {
  if (!esPeticionDeCron(request)) return new NextResponse("Unauthorized", { status: 401 });
  const r = await revisarPlantillasEnRevision(createServiceClient());
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 500 });
  return NextResponse.json(r);
}
