import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { cargarEntidades } from "@/lib/finanzas/cargar-entidades";
import { ultimosMeses } from "@/lib/finanzas/eerr";
import { createServiceClient } from "@/lib/supabase/server";
import { CompletarTiposCambio, TablaTiposCambio, type FilaTipoCambio } from "./tabla-tipos-cambio";
import { hoyPanama } from "@/lib/af4/fecha";

export const metadata = { title: "Tipos de cambio" };

export const dynamic = "force-dynamic";


export default async function TiposCambioPage() {
  const usuario = await requireModulo("estado-resultados");
  const supabase = createServiceClient();
  const [entidades, tasas, sinTasa] = await Promise.all([
    cargarEntidades(supabase),
    supabase.from("fin_tipos_cambio_mes").select("moneda, periodo, promedio, cierre, origen, dias, nota").order("periodo", { ascending: false }),
    supabase.from("fin_movimientos_sin_tasa").select("periodo, moneda, movimientos"),
  ]);
  if (tasas.error || !entidades.length) {
    return (
      <Pagina ancho="media" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Tipos de cambio" oculto />
        <EstadoVacioAF4 titulo="Los tipos de cambio todavía no están instalados">Falta correr la migración 0923 (multimoneda) en Supabase.</EstadoVacioAF4>
      </Pagina>
    );
  }
  const monedas = [...new Set(entidades.map((e) => e.moneda))].filter((m) => m !== "USD").sort();
  const hoy = hoyPanama();
  const filas = new Map<string, FilaTipoCambio>();
  const vacia = (moneda: string, mes: string): FilaTipoCambio => ({
    id: `${moneda}:${mes.slice(0, 7)}`,
    moneda,
    mes,
    promedio: null,
    cierre: null,
    origen: null,
    dias: null,
    sinTasa: 0,
    nota: "",
  });
  // Los últimos 12 meses de cada moneda se ven siempre (los que faltan, con su punto ámbar).
  for (const m of monedas) for (const mes of ultimosMeses(hoy, 12)) filas.set(`${m}:${mes.slice(0, 7)}`, vacia(m, mes));
  for (const t of tasas.data ?? []) {
    const mes = String(t.periodo).slice(0, 10);
    const id = `${t.moneda}:${mes.slice(0, 7)}`;
    filas.set(id, {
      ...(filas.get(id) ?? vacia(t.moneda as string, mes)),
      promedio: Number(t.promedio),
      cierre: Number(t.cierre),
      origen: t.origen as "automatico" | "manual",
      dias: t.dias === null ? null : Number(t.dias),
      nota: (t.nota as string | null) ?? "",
    });
  }
  for (const s of sinTasa.data ?? []) {
    const mes = String(s.periodo).slice(0, 10);
    const id = `${s.moneda}:${mes.slice(0, 7)}`;
    const f = filas.get(id) ?? vacia(s.moneda as string, mes);
    filas.set(id, { ...f, sinTasa: f.sinTasa + Number(s.movimientos) });
  }
  const lista = [...filas.values()].sort((a, b) => b.mes.localeCompare(a.mes) || a.moneda.localeCompare(b.moneda));
  const puedeEscribir = !usuario.modulosSoloLectura.includes("estado-resultados");
  const datosHasta = lista.find((f) => f.promedio !== null)?.mes ?? null;
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Tipos de cambio" datosHasta={datosHasta} imprimir={false} acciones={puedeEscribir ? <CompletarTiposCambio /> : undefined} />
      <TablaTiposCambio
        filas={lista}
        monedas={monedas}
        mesSugerido={hoy.slice(0, 7)}
        puedeEscribir={puedeEscribir}
      />
    </Pagina>
  );
}
