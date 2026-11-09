import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { GraficaLineasAF4 } from "@/components/af4/graficas-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { Pagina } from "@/components/ui/pagina";
import { hoyPanama, mesCorto, rangoMeses, sumarMeses } from "@/lib/af4/fecha";
import { dineroKpi, entero } from "@/lib/af4/formato";
import { calcularVariacion } from "@/lib/af4/variacion";
import { requireModulo } from "@/lib/auth";
import { depreciacionPorMes, mesDe, situacion, type Bien } from "@/lib/finanzas/bienes-uso";
import { UNIDAD_SIN_ASIGNAR } from "@/lib/finanzas/libro-excel";
import { createServiceClient } from "@/lib/supabase/server";
import type { FilaBien } from "./def-bienes";
import { TablaBienes } from "./tabla-bienes";

export const metadata = { title: "Bienes de uso" };

export const dynamic = "force-dynamic";

/** La gráfica de depreciación: un año hacia atrás y uno hacia adelante del mes en curso. */
const MESES_ATRAS = 11;
const MESES_ADELANTE = 12;

interface FilaBase {
  id: string;
  descripcion: string;
  tipo: string;
  unidad_id: string | null;
  fecha_alta: string;
  importe: number | string;
  meses_vida: number;
  valor_residual: number | string;
  fecha_baja: string | null;
  motivo_baja: string | null;
  notas: string | null;
  origen: string;
  editado_a_mano: boolean;
  fin_unidades: { nombre: string } | { nombre: string }[] | null;
}

export default async function BienesDeUsoPage() {
  const usuario = await requireModulo("bienes-de-uso");
  const supabase = createServiceClient();
  const periodo = mesDe(hoyPanama());

  const [bienes, unidades] = await Promise.all([
    supabase
      .from("fin_bienes_uso")
      .select("id, descripcion, tipo, unidad_id, fecha_alta, importe, meses_vida, valor_residual, fecha_baja, motivo_baja, notas, origen, editado_a_mano, fin_unidades(nombre)")
      .order("fecha_alta", { ascending: false })
      .limit(5000),
    supabase.from("fin_unidades").select("id, nombre").eq("activo", true).neq("nombre", UNIDAD_SIN_ASIGNAR).order("orden"),
  ]);
  if (bienes.error) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Bienes de uso" imprimir={false} />
        <EstadoVacioAF4 titulo="Faltan los bienes de uso">Correr la migración 0907 en Supabase.</EstadoVacioAF4>
      </Pagina>
    );
  }

  const base: Bien[] = [];
  const filas: FilaBien[] = ((bienes.data ?? []) as unknown as FilaBase[]).map((b) => {
    const unidad = Array.isArray(b.fin_unidades) ? b.fin_unidades[0] : b.fin_unidades;
    const bien = {
      fecha_alta: b.fecha_alta,
      importe: Number(b.importe),
      meses_vida: b.meses_vida,
      valor_residual: Number(b.valor_residual),
      fecha_baja: b.fecha_baja,
    };
    base.push(bien);
    const s = situacion(bien, periodo);
    return {
      id: b.id,
      descripcion: b.descripcion,
      tipo: b.tipo,
      tienda: unidad?.nombre ?? "A DISTRIBUIR",
      unidadId: b.unidad_id,
      fechaAlta: b.fecha_alta,
      alta: b.fecha_alta.slice(0, 7),
      importe: bien.importe,
      mesesVida: b.meses_vida,
      valorResidual: bien.valor_residual,
      fechaBaja: b.fecha_baja,
      motivoBaja: b.motivo_baja ?? "",
      notas: b.notas ?? "",
      origen: b.origen,
      editado: b.editado_a_mano === true,
      ...s,
    };
  });

  // Lo que está en el balance: los bienes que no se dieron de baja.
  const enBalance = filas.filter((f) => f.estado !== "De baja");
  const bruto = enBalance.reduce((a, f) => a + f.importe, 0);
  const acumulada = enBalance.reduce((a, f) => a + f.acumulada, 0);
  const cargo = filas.reduce((a, f) => a + f.delMes, 0);
  const enUso = filas.filter((f) => f.estado === "En uso").length;

  // La depreciación de cada mes con la misma regla de la grilla del Excel (los meses que vienen, con los bienes de hoy).
  const desde = sumarMeses(periodo, -MESES_ATRAS);
  const hasta = sumarMeses(periodo, MESES_ADELANTE);
  const porMes = depreciacionPorMes(base, desde, hasta);
  const mesAnterior = sumarMeses(periodo, -1);
  const cargoAnterior = porMes.get(mesAnterior) ?? 0;
  const pasados = [...porMes].filter(([m]) => m <= periodo).map(([, v]) => v);
  const contexto = `USD · al cierre de ${mesCorto(periodo)}`;

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Bienes de uso" datosHasta={periodo} />

      {!filas.length ? (
        <EstadoVacioAF4 titulo="Todavía no hay bienes de uso" accion={{ href: "/bienes-de-uso/importar", etiqueta: "Importar Excel" }} />
      ) : (
        <>
          <FilaKpiAF4>
            <KpiAF4 titulo="Valor de origen" valor={dineroKpi(bruto)} subtexto={`${entero(enBalance.length)} bienes · ${contexto}`} />
            <KpiAF4 titulo="Depreciación acumulada" valor={dineroKpi(acumulada)} />
            <KpiAF4 titulo="Valor neto en libros" destacado tono={bruto - acumulada < 0 ? "destructive" : "neutral"} valor={dineroKpi(bruto - acumulada)} />
            <KpiAF4
              titulo={`Depreciación de ${mesCorto(periodo)}`}
              valor={dineroKpi(cargo)}
              comparaciones={cargoAnterior > 0 ? [{ v: calcularVariacion(cargo, cargoAnterior, "menos-es-mejor"), contra: mesCorto(mesAnterior) }] : []}
              serie={pasados.length > 1 ? pasados : undefined}
              subtexto={`${entero(enUso)} bienes depreciando`}
            />
          </FilaKpiAF4>

          <GraficaLineasAF4
            id="grafica-depreciacion"
            titulo="Depreciación por mes"
            detalle={`USD · ${rangoMeses([desde, hasta])}`}
            alto={220}
            datos={[...porMes].map(([m, v]) => ({ etiqueta: mesCorto(m), real: m <= periodo ? v : null, proyectada: m >= periodo ? v : null }))}
            series={[
              { clave: "real", nombre: "Registrada", color: 2 },
              { clave: "proyectada", nombre: "Proyectada", color: 5, trazo: "rayas" },
            ]}
          />

          <TablaBienes
            filas={filas}
            tiendas={(unidades.data ?? []) as { id: string; nombre: string }[]}
            puedeEscribir={!usuario.modulosSoloLectura.includes("bienes-de-uso")}
          />
        </>
      )}
    </Pagina>
  );
}
