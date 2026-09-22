import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { KpiGroup } from "@/components/ui/kpi-card";
import type { FilaSku } from "./def-catalogo";
import { TablaCatalogo } from "./tabla-catalogo";
import { TarjetasEstadoCatalogo } from "./tarjetas-estado";

export const metadata = { title: "SKU maestro" };

export const dynamic = "force-dynamic";

interface SkuMaestro {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  estado: string;
  creado_en: string;
  aprobado_en: string | null;
}

export default async function CatalogoMaestroPage() {
  const usuario = await requireModulo("catalogo-maestro");
  const supabase = createServiceClient();
  // El SKU maestro es igual para todos los países; el país solo da formato a las fechas de su actividad.
  const pais = await getPaisActual(supabase);

  const { data: skus } = await supabase
    .from("skus_maestros")
    .select("id, codigo, nombre, tipo, estado, creado_en, aprobado_en")
    .order("creado_en", { ascending: false });

  const lista: SkuMaestro[] = skus ?? [];
  const ids = lista.map((s) => s.id);

  const { data: componentesFilas } = await supabase
    .from("sku_maestro_componentes")
    .select("combo_id, cantidad, componente:componente_id(codigo, nombre)")
    .in("combo_id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);

  const componentesPorCombo = new Map<string, { codigo: string; nombre: string; cantidad: number }[]>();
  for (const fila of componentesFilas ?? []) {
    const componente = fila.componente as unknown as { codigo: string; nombre: string } | null;
    if (!componente) continue;
    if (!componentesPorCombo.has(fila.combo_id)) componentesPorCombo.set(fila.combo_id, []);
    componentesPorCombo.get(fila.combo_id)!.push({ ...componente, cantidad: fila.cantidad });
  }

  const opcionesSimples = lista.filter((s) => s.tipo === "simple" && s.estado === "aprobado");

  const filas: FilaSku[] = lista.map((s) => ({
    id: s.id,
    codigo: s.codigo,
    nombre: s.nombre,
    tipo: s.tipo,
    estado: s.estado,
    componentes:
      s.tipo === "combo"
        ? (componentesPorCombo.get(s.id) ?? []).map((c) => `${c.cantidad}× ${c.codigo}`).join(", ")
        : "",
    creado: s.creado_en.slice(0, 10),
  }));

  const conteo = { propuesto: 0, en_revision: 0, aprobado: 0 };
  for (const s of lista) conteo[s.estado as keyof typeof conteo]++;

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Catálogo maestro de SKU" oculto />

      <KpiGroup titulo="Estado del catálogo">
        <TarjetasEstadoCatalogo conteo={conteo} />
      </KpiGroup>

      <TablaCatalogo
        skus={filas}
        opcionesSimples={opcionesSimples.map((s) => ({ id: s.id, codigo: s.codigo, nombre: s.nombre }))}
        codigoPais={pais.codigo}
        puedeEscribir={!usuario.modulosSoloLectura.includes("catalogo-maestro")}
      />
    </Pagina>
  );
}
