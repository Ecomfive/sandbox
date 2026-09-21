import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { requireModulo } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { KpiGroup } from "@/components/ui/kpi-card";
import { fieldClass, labelClass } from "@/components/ui/field";
import { crearSkuSimple, crearCombo } from "./actions";
import { ComboBuilder } from "./combo-builder";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { CatalogoIcon } from "@/lib/nav-icons";
import type { FilaSku } from "./def-catalogo";
import { TablaCatalogo } from "./tabla-catalogo";
import { TarjetasEstadoCatalogo } from "./tarjetas-estado";

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
  await requireModulo("catalogo-maestro");
  const supabase = createServiceClient();

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
      <EncabezadoPagina titulo="Catálogo maestro de SKU" icono={CatalogoIcon}>
        Un SKU maestro representa un producto físico, sin importar en qué plataforma se venda.
        Los combos se arman con varios SKU maestros simples y una cantidad de cada uno. Todo pasa
        por revisión antes de quedar aprobado.
      </EncabezadoPagina>

      <KpiGroup titulo="Estado del catálogo">
        <TarjetasEstadoCatalogo conteo={conteo} />
      </KpiGroup>

      <div className="grid max-w-5xl gap-6 md:grid-cols-2">
        <form action={crearSkuSimple} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Proponer SKU simple</h2>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Nombre</label>
            <input type="text" name="nombre" required className={fieldClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Código (opcional, se genera uno si lo dejas vacío)</label>
            <input type="text" name="codigo" className={fieldClass} />
          </div>
          <Button type="submit" className="self-start">
            Proponer
          </Button>
        </form>

        <form action={crearCombo} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Proponer combo</h2>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Nombre</label>
            <input type="text" name="nombre" required className={fieldClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Código (opcional)</label>
            <input type="text" name="codigo" className={fieldClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Componentes</label>
            {opcionesSimples.length === 0 ? (
              <EstadoVacio
                mensaje="Todavía no hay SKUs simples aprobados para armar un combo. Aprueba al menos uno primero."
                className="p-2"
              />
            ) : (
              <ComboBuilder opciones={opcionesSimples} />
            )}
          </div>
          <Button type="submit" disabled={opcionesSimples.length === 0} className="self-start">
            Proponer combo
          </Button>
        </form>
      </div>

      <TablaCatalogo skus={filas} />
    </Pagina>
  );
}
