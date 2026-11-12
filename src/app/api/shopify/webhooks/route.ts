import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { guardarOrdenesShopify, tiendasConfiguradas } from "@/lib/finanzas/sincronizar-shopify";
import { ordenDeShopify } from "@/lib/finanzas/shopify";
import { DOMINIO_SHOPIFY } from "@/lib/ventas/conexion-tienda";
import { TEMAS_ORDEN, firmaShopifyValida } from "@/lib/ventas/shopify-webhook";
import { appDeDominio } from "@/lib/tienda/shopify-app";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const MAX_CUERPO = 2_000_000;

/**
 * Webhook de Shopify: la orden entra (o se actualiza) al instante, con la misma ruta de guardado que la lectura programada.
 * No hay sesión: la puerta es la firma `X-Shopify-Hmac-Sha256` con `SHOPIFY_WEBHOOK_SECRET` (el secreto de la app; o
 * `SHOPIFY_CLIENT_SECRET`). Sin secreto, todo se rechaza. Es idempotente por `X-Shopify-Webhook-Id`; si falla el guardado
 * se borra la marca y se responde 500 para que Shopify reintente. El cron sigue rellenando lo que un webhook pierda.
 */
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_CUERPO) return new NextResponse("Payload Too Large", { status: 413 });
  const cuerpo = await request.text();
  if (cuerpo.length > MAX_CUERPO) return new NextResponse("Payload Too Large", { status: 413 });
  const dominio = (request.headers.get("x-shopify-shop-domain") ?? "").toLowerCase();
  // Una tienda conectada con su app del Dev Dashboard (12 nov 2026, Kenku) firma con el secreto de esa app; el dominio solo elige qué secreto probar:
  // sin la firma correcta no entra nada.
  const app = appDeDominio(dominio);
  const secreto = app ? app.clientSecret : (process.env.SHOPIFY_WEBHOOK_SECRET ?? process.env.SHOPIFY_CLIENT_SECRET);
  if (!firmaShopifyValida(cuerpo, request.headers.get("x-shopify-hmac-sha256"), secreto)) return new NextResponse("Forbidden", { status: 403 });

  const tema = request.headers.get("x-shopify-topic") ?? "";
  const id = (request.headers.get("x-shopify-webhook-id") ?? "").slice(0, 120);
  if (!(TEMAS_ORDEN as readonly string[]).includes(tema)) return NextResponse.json({ ok: true, ignorado: true });
  if (!DOMINIO_SHOPIFY.test(dominio) || !id) return new NextResponse("Bad Request", { status: 400 });
  let orden: Record<string, unknown>;
  try { orden = JSON.parse(cuerpo); } catch { return new NextResponse("Bad Request", { status: 400 }); }

  const supabase = createServiceClient();
  let marcada = false;
  try {
    const { error: dup } = await supabase.from("ven_shopify_webhooks").insert({ webhook_id: id, tema, dominio });
    if (dup) return NextResponse.json({ ok: true, repetido: true });
    marcada = true;
    const tienda = (app ? { tienda: app.tienda } : (await tiendasConfiguradas(supabase)).find((t) => t.dominio.toLowerCase() === dominio)) as ({ unidadId?: string; tienda: string }) | undefined;
    // Una tienda que no tenemos conectada no es un error de Shopify: se confirma y se ignora.
    if (!tienda) return NextResponse.json({ ok: true, tiendaDesconocida: true });
    const o = ordenDeShopify(tienda.tienda, orden);
    if (o) await guardarOrdenesShopify(supabase, [o]);
    // Gestión de tienda: la hora del último aviso, para la pantalla Tiendas (si la tienda es una de las del sistema).
    if (app) await supabase.from("tiendas").update({ ultimo_aviso_en: new Date().toISOString() }).eq("dominio", dominio);
    if (tienda.unidadId) {
      const { data: c } = await supabase.from("ven_tiendas_conexion").select("webhooks_recibidos").eq("unidad_id", tienda.unidadId).maybeSingle();
      await supabase.from("ven_tiendas_conexion").update({ ultimo_webhook: new Date().toISOString(), webhooks_recibidos: Number(c?.webhooks_recibidos ?? 0) + 1 }).eq("unidad_id", tienda.unidadId);
    }
    return NextResponse.json({ ok: true });
  } catch {
    if (marcada) await supabase.from("ven_shopify_webhooks").delete().eq("webhook_id", id);
    return new NextResponse("Error", { status: 500 });
  }
}
