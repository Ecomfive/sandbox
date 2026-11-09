import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarPendientes } from "@/lib/finanzas/cargar-pendientes";
import { reglaPara } from "@/lib/finanzas/clasificacion";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { puedeVerUnidad } from "@/lib/finanzas/tiendas-permitidas";
import { TablaReglas, type FilaRegla } from "./tabla-reglas";

export const metadata = { title: "Reglas" };

export const dynamic = "force-dynamic";

export default async function ReglasPage() {
  const usuario = await requireModulo("libro-movimientos");
  const supabase = createServiceClient();
  const permitidas = await cargarTiendasPermitidas();
  const [datos, todas, usos] = await Promise.all([
    cargarPendientes(supabase, permitidas),
    supabase.from("fin_reglas").select("id, patron, unidad_id, tipo_id, activo").order("patron"),
    supabase.from("fin_movimientos").select("regla_id").not("regla_id", "is", null).limit(20000),
  ]);
  if ("error" in datos || todas.error) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Reglas" imprimir={false} />
        <EstadoVacioAF4 titulo="Faltan las reglas del libro">Correr la migración 0903 en Supabase.</EstadoVacioAF4>
      </Pagina>
    );
  }
  const nombreTienda = new Map(datos.tiendas.map((t) => [t.id, t.nombre]));
  const nombreTipo = new Map(datos.tipos.map((t) => [t.id, t.nombre]));
  // Con tiendas limitadas, solo las reglas que llevan a una de sus tiendas (las demás cambian movimientos de otras).
  const reglas = (todas.data ?? []).filter((r) => !permitidas || (!!r.unidad_id && puedeVerUnidad(permitidas, r.unidad_id)));
  // Cuántos pendientes completaría cada regla hoy (la más específica gana, como al aplicarlas).
  const porRegla = new Map<string, number>();
  for (const f of datos.filas) {
    const r = reglaPara(f.descripcion, reglas);
    if (!r) continue;
    const sirve = (f.falta !== "Tipo" && r.unidad_id) || (f.falta !== "Tienda" && r.tipo_id);
    if (sirve) porRegla.set(r.id, (porRegla.get(r.id) ?? 0) + 1);
  }
  const completados = new Map<string, number>();
  for (const u of usos.data ?? []) completados.set(u.regla_id as string, (completados.get(u.regla_id as string) ?? 0) + 1);
  const filas: FilaRegla[] = reglas.map((r) => ({
    id: r.id,
    patron: r.patron,
    tienda: r.unidad_id ? (nombreTienda.get(r.unidad_id) ?? "—") : "(no cambia)",
    tipo: r.tipo_id ? (nombreTipo.get(r.tipo_id) ?? "—") : "(no cambia)",
    activo: r.activo,
    pendientes: porRegla.get(r.id) ?? 0,
    completados: completados.get(r.id) ?? 0,
  }));
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Reglas" imprimir={false} />
      <TablaReglas filas={filas} tiendas={datos.tiendas} tipos={datos.tipos} puedeEscribir={!usuario.modulosSoloLectura.includes("libro-movimientos")} />
    </Pagina>
  );
}
