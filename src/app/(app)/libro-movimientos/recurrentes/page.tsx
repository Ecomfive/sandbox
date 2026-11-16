import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { hoyPanama } from "@/lib/af4/fecha";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { puedeVerUnidad } from "@/lib/finanzas/tiendas-permitidas";
import { fechaDelMes, mesesPorGenerar } from "@/lib/finanzas/recurrentes";
import { TablaRecurrentes, type FilaRecurrente } from "./tabla-recurrentes";

export const metadata = { title: "Recurrentes" };

export const dynamic = "force-dynamic";

const nombreDe = (v: unknown): string => ((Array.isArray(v) ? v[0] : v) as { nombre?: string } | null)?.nombre ?? "";

/** El mes siguiente en que la plantilla registra su movimiento (null si ya terminó o está pausada). */
function proxima(p: { id: string; dia: number; desde: string; hasta: string | null; ultimo_periodo: string | null; activo: boolean }, hoy: string): string | null {
  if (!p.activo) return null;
  const pendientes = mesesPorGenerar(p, hoy);
  if (pendientes.length) return fechaDelMes(pendientes[0], p.dia);
  // Nada atrasado: el próximo mes que le toca después del último generado.
  let a = Number(hoy.slice(0, 4));
  let m = Number(hoy.slice(5, 7));
  const mesHoy = `${hoy.slice(0, 7)}-01`;
  let mes = p.ultimo_periodo && p.ultimo_periodo >= mesHoy ? null : mesHoy;
  if (!mes) {
    m += 1;
    if (m === 13) {
      m = 1;
      a += 1;
    }
    mes = `${a}-${String(m).padStart(2, "0")}-01`;
  }
  if (mes < p.desde) mes = p.desde;
  if (p.hasta && mes > p.hasta) return null;
  return fechaDelMes(mes, p.dia);
}

export default async function RecurrentesPage() {
  const usuario = await requireModulo("libro-movimientos");
  const supabase = createServiceClient();
  const [permitidas, plantillas, unidades, tipos, cuentas] = await Promise.all([
    cargarTiendasPermitidas(),
    supabase
      .from("fin_recurrentes")
      .select("id, unidad_id, descripcion, monto, dia, desde, hasta, ultimo_periodo, activo, en_eerr, en_flujo, fin_unidades(nombre), fin_tipos(nombre, seccion), fin_cuentas(nombre)")
      .order("descripcion"),
    supabase.from("fin_unidades").select("id, nombre").eq("activo", true).order("orden"),
    supabase.from("fin_tipos").select("id, nombre").order("orden"),
    supabase.from("fin_cuentas").select("id, nombre").eq("activo", true).order("nombre"),
  ]);
  if (plantillas.error) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Recurrentes" imprimir={false} />
        <EstadoVacioAF4 titulo="Faltan los movimientos recurrentes">Correr la migración 0981 en Supabase.</EstadoVacioAF4>
      </Pagina>
    );
  }
  const hoy = hoyPanama();
  const filas: FilaRecurrente[] = (plantillas.data ?? [])
    .filter((p) => !permitidas || puedeVerUnidad(permitidas, p.unidad_id as string))
    .map((p) => {
      const plantilla = {
        id: p.id as string,
        dia: Number(p.dia),
        desde: String(p.desde).slice(0, 10),
        hasta: p.hasta ? String(p.hasta).slice(0, 10) : null,
        ultimo_periodo: p.ultimo_periodo ? String(p.ultimo_periodo).slice(0, 10) : null,
        activo: p.activo === true,
      };
      return {
        id: p.id as string,
        descripcion: p.descripcion as string,
        tienda: nombreDe(p.fin_unidades) || "—",
        tipo: nombreDe(p.fin_tipos) || "—",
        cuenta: nombreDe(p.fin_cuentas),
        monto: Number(p.monto),
        dia: plantilla.dia,
        desde: plantilla.desde,
        hasta: plantilla.hasta,
        ultimo: plantilla.ultimo_periodo,
        proxima: proxima(plantilla, hoy),
        activo: plantilla.activo,
      };
    });
  const tiendas = (unidades.data ?? []).filter((u) => !permitidas || puedeVerUnidad(permitidas, u.id as string)) as { id: string; nombre: string }[];
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Recurrentes" imprimir={false} />
      <TablaRecurrentes
        filas={filas}
        tiendas={tiendas}
        tipos={(tipos.data ?? []) as { id: string; nombre: string }[]}
        cuentas={(cuentas.data ?? []) as { id: string; nombre: string }[]}
        mes={hoy.slice(0, 7)}
        puedeEscribir={!usuario.modulosSoloLectura.includes("libro-movimientos")}
      />
    </Pagina>
  );
}
