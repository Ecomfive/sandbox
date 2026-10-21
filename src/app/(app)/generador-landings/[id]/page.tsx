import { notFound } from "next/navigation";
import { EtiquetaMiga } from "@/components/migas/etiqueta-miga";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { ESPACIOS_IMAGEN, normalizarContenido, normalizarFotosProveedor, normalizarImagenes, numeroLanding, type LecturaReferencia } from "@/lib/landings/landing";
import { geminiConectado } from "@/lib/landings/gemini-api";
import { ofertasEnMoneda } from "@/lib/landings/ofertas";
import type { DatosShopify } from "@/lib/landings/shopify";
import { shopifyConectado, tiendaShopify } from "@/lib/landings/shopify-api";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { EditorLanding, type LandingEditor } from "./editor-landing";

export const metadata = { title: "Generador de landings" };

export const dynamic = "force-dynamic";

// Generar una imagen con Gemini tarda de 10 a 40 segundos (la acción corre en esta página).
export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** El editor de una landing: datos, imágenes, textos, secciones y publicación, con la vista previa al lado. */
export default async function LandingPage({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await requireModulo("generador-landings");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = createServiceClient();
  const { data: l } = await supabase
    .from("landings")
    .select("id, numero, nombre, pais_id, seleccion_id, modo, referencia_url, referencia, angulo, notas_ia, moneda, precio, precio_tachado, contenido, imagenes, fotos_proveedor, estado, shopify")
    .eq("id", id)
    .maybeSingle();
  if (!l || !(await puedeVerPaisId(supabase, usuario.paisesPermitidos, l.pais_id))) notFound();

  const imagenes = normalizarImagenes(l.imagenes, l.id);
  const fotos = normalizarFotosProveedor(l.fotos_proveedor, l.id);
  const rutas = [...ESPACIOS_IMAGEN.map((e) => imagenes[e.clave].ruta).filter((r): r is string => !!r), ...fotos];

  const [firmadasR, seleccionR, ofertas] = await Promise.all([
    rutas.length ? supabase.storage.from("landings").createSignedUrls(rutas, 60 * 60) : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[] }),
    l.seleccion_id ? supabase.from("wms_seleccion_productos").select("numero, codigo_fuente").eq("id", l.seleccion_id).maybeSingle() : Promise.resolve({ data: null }),
    // Las ofertas están en dólares: se muestran en la moneda de la tienda con el tipo de cambio del día.
    ofertasEnMoneda(supabase, l.seleccion_id, l.moneda),
  ]);
  const url = new Map((firmadasR.data ?? []).map((f) => [f.path, f.signedUrl]));

  const landing: LandingEditor = {
    id: l.id,
    numero: l.numero,
    nombre: l.nombre,
    modo: l.modo === "clonar" ? "clonar" : "cero",
    referenciaUrl: l.referencia_url ?? "",
    referencia: (l.referencia as LecturaReferencia | null) ?? null,
    angulo: l.angulo,
    notasIa: l.notas_ia ?? "",
    moneda: l.moneda,
    precio: num(l.precio),
    precioTachado: num(l.precio_tachado),
    estado: l.estado,
    contenido: normalizarContenido(l.contenido),
    imagenes: Object.fromEntries(
      ESPACIOS_IMAGEN.map((e) => [e.clave, { ruta: imagenes[e.clave].ruta, instruccion: imagenes[e.clave].instruccion, url: imagenes[e.clave].ruta ? (url.get(imagenes[e.clave].ruta) ?? null) : null }]),
    ) as LandingEditor["imagenes"],
    fotosProveedor: fotos.map((r) => ({ ruta: r, url: url.get(r) ?? null })),
    shopify: (l.shopify as DatosShopify | null)?.productoId ? (l.shopify as DatosShopify) : null,
  };
  const sel = seleccionR.data as { numero: number; codigo_fuente: string } | null;

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EtiquetaMiga texto={`${numeroLanding(l.numero)} · ${l.nombre}`} />
      <EncabezadoPagina titulo={`Landing ${numeroLanding(l.numero)}`} oculto />
      <EditorLanding
        landing={landing}
        origen={sel ? `SEL-${String(sel.numero).padStart(4, "0")} · ${sel.codigo_fuente}` : null}
        ofertas={ofertas}
        puedeEscribir={!usuario.modulosSoloLectura.includes("generador-landings")}
        gemini={geminiConectado()}
        tiendaShopify={shopifyConectado() ? tiendaShopify() : null}
      />
    </Pagina>
  );
}
