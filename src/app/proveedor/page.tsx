import { idiomaDeCuenta } from "@/lib/proveedor/cuenta";
import { cargarEspejo } from "@/lib/proveedor/datos";
import { conFotosDeCompras } from "@/lib/proveedor/fotos-pedidos";
import { hoyPanama } from "@/lib/proveedor/fechas";
import { estadoPagos } from "@/lib/proveedor/pagos-servidor";
import { avisosParaVista, filasPlazos } from "@/lib/proveedor/vista-pagos";
import { requireProveedor } from "@/lib/proveedor/sesion";
import { traducirTextos } from "@/lib/proveedor/traducir";
import { BUCKET_PROVEEDOR } from "@/lib/proveedor/rutas";
import { createServiceClient } from "@/lib/supabase/server";
import { PortalChin, type AvisoEcomfive } from "./portal-chin";

export const dynamic = "force-dynamic";

/**
 * El portal del proveedor: lo que Ecomfive le pide a Chin, lo que cotizó, lo que está en producción y lo que envió. Lee el espejo de
 * sus compras (`proveedor_pedidos`); nada del resto del sistema. Se ve en el idioma de la cuenta (chino por defecto): los textos de la
 * pantalla salen del diccionario y lo escrito por personas se traduce con Gemini (`traducirTextos`, guardado en `traducciones`).
 */
export default async function PortalProveedorPage() {
  const cuenta = await requireProveedor();
  const supabase = createServiceClient();
  const [espejo, idioma] = await Promise.all([cargarEspejo(supabase, cuenta.proveedor.id), idiomaDeCuenta(cuenta.cuentaId)]);
  if ("error" in espejo) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          No se pudo cargar el portal. Inténtalo de nuevo en unos minutos.
        </p>
      </main>
    );
  }
  // Las fotos como en Compras: la comercial de referencia y la real de la compra si todavía no subió la suya.
  const { pedidos: activos, realDeCompra } = await conFotosDeCompras(
    supabase,
    espejo.pedidos.filter((p) => p.etapa === "por_cotizar" || p.etapa === "cotizado" || p.etapa === "produccion" || p.etapa === "enviado"),
  );

  const rutas = activos.map((p) => p.fotoRealRuta).filter((r): r is string => !!r);
  const fotosReales: Record<string, string> = { ...realDeCompra };
  if (rutas.length) {
    const { data } = await supabase.storage.from(BUCKET_PROVEEDOR).createSignedUrls(rutas, 3600);
    const porRuta = new Map((data ?? []).map((f) => [f.path, f.signedUrl]));
    for (const p of activos) if (p.fotoRealRuta && porRuta.get(p.fotoRealRuta)) fotosReales[p.id] = porRuta.get(p.fotoRealRuta)!;
  }

  const { data: avisos } = await supabase
    .from("proveedor_novedades")
    .select("id, texto, creado_en")
    .eq("proveedor_id", cuenta.proveedor.id)
    .eq("lado", "ecomfive")
    .is("leida_en", null)
    .order("creado_en", { ascending: false })
    .limit(20);
  const nuevos: AvisoEcomfive[] = (avisos ?? []).map((a) => ({ id: a.id as string, texto: a.texto as string, creadoEn: a.creado_en as string }));

  const estado = await estadoPagos(supabase, espejo);
  const pagos = "error" in estado ? null : { resumen: estado.resumen, avisos: await avisosParaVista(supabase, estado.avisos.filter((a) => a.estado === "avisado")), plazos: filasPlazos(estado.envios, hoyPanama()) };

  // En chino: los nombres de los productos, las notas de Ecomfive y «Lo nuevo». En español: sus propios comentarios.
  const traducciones =
    idioma === "zh"
      ? await traducirTextos(
          supabase,
          [...activos.flatMap((p) => [p.producto, p.notaParaProveedor]), ...nuevos.map((a) => a.texto), ...(pagos ? [...pagos.avisos.flatMap((a) => a.cuotas.map((c) => c.producto)), ...pagos.plazos.map((f) => f.producto)] : [])],
          "zh",
        )
      : await traducirTextos(supabase, activos.map((p) => p.comentarioProveedor), "es");

  return (
    <PortalChin
      idioma={idioma}
      traducciones={traducciones}
      cuenta={{ nombre: cuenta.nombre, proveedor: cuenta.proveedor.nombre, diasAnticipo: cuenta.proveedor.diasAnticipo }}
      pedidos={activos}
      plazos={espejo.plazos}
      fotosReales={fotosReales}
      avisos={nuevos}
      pagos={pagos}
    />
  );
}
