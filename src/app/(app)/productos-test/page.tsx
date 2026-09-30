import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { TestIcon } from "@/lib/nav-icons";
import { TablaProductosTest } from "./tabla-productos-test";
import type { FilaProductoTest } from "./def-productos-test";

export const metadata = { title: "Productos Test" };

export const dynamic = "force-dynamic";

/** El paso previo a Filtros (Sistema WMS › Productos Test): productos candidatos que se prueban con
 * anuncios en Meta, calcado de la hoja de cálculo "Control de Testing en Países". Por ahora solo Panamá. */
export default async function ProductosTestPage() {
  const usuario = await requireModulo("productos-test");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const { data: productos } = await supabase
    .from("wms_productos_test")
    .select(
      "id, nombre, fecha_creacion, fuente, pagina_producto_url, video_url, categoria, angulo_venta, worldwide, ad_library, fecha_test, estado, clickup, test_numero, calculadora_url, campana_url, metrica_oferta, metrica_cpm, metrica_efectividad, metrica_hook_rate, metrica_ctr, metrica_cpa, metrica_gasto, metrica_compras, metrica_cvr, revisado, ultima_revision, observacion, explotacion, creado_en"
    )
    .eq("pais_id", pais.id)
    .order("creado_en", { ascending: false })
    .limit(1000);

  const filasProducto: FilaProductoTest[] = (productos ?? []).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    fechaCreacion: p.fecha_creacion,
    fuente: p.fuente,
    paginaProductoUrl: p.pagina_producto_url,
    videoUrl: p.video_url,
    categoria: p.categoria,
    anguloVenta: p.angulo_venta,
    worldwide: p.worldwide,
    adLibrary: p.ad_library,
    fechaTest: p.fecha_test,
    estado: p.estado,
    clickup: p.clickup,
    testNumero: p.test_numero,
    calculadoraUrl: p.calculadora_url,
    campanaUrl: p.campana_url,
    metricaOferta: p.metrica_oferta === null ? null : Number(p.metrica_oferta),
    metricaCpm: p.metrica_cpm === null ? null : Number(p.metrica_cpm),
    metricaEfectividad: p.metrica_efectividad === null ? null : Number(p.metrica_efectividad),
    metricaHookRate: p.metrica_hook_rate === null ? null : Number(p.metrica_hook_rate),
    metricaCtr: p.metrica_ctr === null ? null : Number(p.metrica_ctr),
    metricaCpa: p.metrica_cpa === null ? null : Number(p.metrica_cpa),
    metricaGasto: p.metrica_gasto === null ? null : Number(p.metrica_gasto),
    metricaCompras: p.metrica_compras === null ? null : Number(p.metrica_compras),
    metricaCvr: p.metrica_cvr === null ? null : Number(p.metrica_cvr),
    revisado: p.revisado,
    ultimaRevision: p.ultima_revision,
    observacion: p.observacion,
    explotacion: p.explotacion,
    creadoEn: p.creado_en,
  }));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo={`Productos Test ${pais.codigo}`} icono={TestIcon} className="mb-2" />

      <TablaProductosTest
        productos={filasProducto}
        paisId={pais.id}
        puedeEscribir={!usuario.modulosSoloLectura.includes("productos-test")}
      />
    </Pagina>
  );
}
