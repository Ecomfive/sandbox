import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { obtenerPendientesHoy } from "@/lib/pendientes-hoy";
import { enviarCorreo } from "@/lib/notificaciones/correo";

const SITIO = "https://mom-beta-proveduria.vercel.app";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const destinatarios = (process.env.NOTIFICACIONES_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  const supabase = createServiceClient();
  const { data: paises } = await supabase.from("paises").select("id, codigo, nombre").order("nombre");

  const secciones: string[] = [];
  for (const pais of paises ?? []) {
    const pendientes = await obtenerPendientesHoy(supabase, pais.id);
    const items: string[] = [];
    if (pendientes.alertasInventario > 0) {
      items.push(
        `<li>${pendientes.alertasInventario} alerta${pendientes.alertasInventario === 1 ? "" : "s"} de inventario abierta${pendientes.alertasInventario === 1 ? "" : "s"} — <a href="${SITIO}/alertas">ver</a></li>`
      );
    }
    if (pendientes.pedidosConNovedad > 0) {
      items.push(
        `<li>${pendientes.pedidosConNovedad} pedido${pendientes.pedidosConNovedad === 1 ? "" : "s"} de Dropi en Novedad — <a href="${SITIO}/pedidos-dropi">ver</a></li>`
      );
    }
    if (pendientes.saldosSinRegistrar > 0) {
      items.push(
        `<li>${pendientes.saldosSinRegistrar} plataforma${pendientes.saldosSinRegistrar === 1 ? "" : "s"} sin saldo de wallet registrado — <a href="${SITIO}/retiros">ver</a></li>`
      );
    }
    if (pendientes.retirosDropiSinVincular > 0) {
      items.push(
        `<li>${pendientes.retirosDropiSinVincular} retiro${pendientes.retirosDropiSinVincular === 1 ? "" : "s"} de Dropi sin vincular — <a href="${SITIO}/notificaciones">ver</a></li>`
      );
    }
    if (items.length > 0) {
      secciones.push(`<h2>${pais.nombre}</h2><ul>${items.join("")}</ul>`);
    }
  }

  if (secciones.length === 0) {
    return NextResponse.json({ enviado: false, motivo: "Sin pendientes hoy" });
  }

  const html = `<h1>Pendientes de hoy — Ecomfive</h1>${secciones.join("")}`;
  const resultado = await enviarCorreo({
    destinatarios,
    asunto: "Pendientes de hoy en Ecomfive",
    html,
  });

  return NextResponse.json(resultado);
}
