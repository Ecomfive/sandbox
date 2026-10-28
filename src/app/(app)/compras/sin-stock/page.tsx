import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requirePestana } from "@/lib/auth";
import { cargarEnCaminoDatos } from "@/lib/compras/en-camino-datos";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { ListaSinStock, type AlertaSinStock } from "./lista-sin-stock";

export const metadata = { title: "Sin stock · Compras" };

export const dynamic = "force-dynamic";

/** Hace `n` días (lo cerrado se muestra un mes). */
function haceDias(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

const suma = (aportes: { unidades: number }[] | undefined) => (aportes ?? []).reduce((t, a) => t + a.unidades, 0);

/**
 * Compras › Sin stock (pedido de Alcides, 27 oct 2026; migración 0167): los productos que se quedaron sin stock en Dropi en el país de la
 * barra, para que Compras revise el inventario manual y anote qué decidió. Las alertas las abre y las cierra la lectura de Dropi de cada
 * mañana (o «Actualizar datos»); aquí se revisan. Se ven las abiertas, las revisadas y las cerradas de los últimos 30 días.
 */
export default async function SinStockPage() {
  const usuario = await requirePestana("compras", "sin-stock");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const hace30 = haceDias(30);
  const [alertasR, enCamino] = await Promise.all([
    supabase
      .from("compras_alertas_sin_stock")
      .select("id, nombre, sku_maestro_id, dropi_ids, detectada_en, estado, decision, nota, revisada_por_nombre, revisada_en, cerrada_en")
      .eq("pais_id", pais.id)
      .or(`estado.neq.cerrada,cerrada_en.gte.${hace30}`)
      .order("detectada_en", { ascending: false })
      .limit(1000),
    cargarEnCaminoDatos(supabase, usuario, pais.id),
  ]);
  // El código y la foto de los productos de las alertas (solo esos).
  const skus = [...new Set((alertasR.data ?? []).map((a) => a.sku_maestro_id as string | null).filter((x): x is string => !!x))];
  const productosR = skus.length ? await supabase.from("skus_maestros").select("id, codigo, foto_url").in("id", skus) : { data: [] };
  const producto = new Map(
    (productosR.data ?? []).map((p) => [
      p.id as string,
      {
        codigo: p.codigo as string,
        foto: (p.foto_url as string | null) ?? null,
      },
    ]),
  );
  const alertas: AlertaSinStock[] = (alertasR.data ?? []).map((a) => {
    const sku = (a.sku_maestro_id as string | null) ?? null;
    return {
      id: a.id as string,
      nombre: a.nombre as string,
      skuId: sku,
      codigo: sku ? (producto.get(sku)?.codigo ?? null) : null,
      foto: sku ? (producto.get(sku)?.foto ?? null) : null,
      dropiIds: (a.dropi_ids as string[]) ?? [],
      detectadaEn: a.detectada_en as string,
      estado: a.estado as AlertaSinStock["estado"],
      decision: (a.decision as AlertaSinStock["decision"]) ?? null,
      nota: (a.nota as string | null) ?? null,
      revisadaPor: (a.revisada_por_nombre as string | null) ?? null,
      revisadaEn: (a.revisada_en as string | null) ?? null,
      cerradaEn: (a.cerrada_en as string | null) ?? null,
      enCamino: sku ? suma(enCamino.porProducto.get(sku)) : 0,
      cotizando: sku ? suma(enCamino.cotizando.get(sku)) : 0,
    };
  });
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Sin stock" oculto />
      {alertasR.error ? (
        <p role="note" className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-warning" />
          Falta correr en Supabase la migración 0167.
        </p>
      ) : (
        <ListaSinStock alertas={alertas} pais={pais.nombre} puedeEscribir={!usuario.modulosSoloLectura.includes("compras")} />
      )}
    </Pagina>
  );
}
