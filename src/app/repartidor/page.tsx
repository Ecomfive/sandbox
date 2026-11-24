import { ElegirClave } from "@/components/repartidor/elegir-clave";
import { MiRuta } from "@/components/repartidor/mi-ruta";
import { cargarRuta } from "@/lib/despacho/datos-repartidor";
import { diaLargo } from "@/lib/despacho/panel-repartidor";
import { repartidorConClaveTemporal, requireRepartidor } from "@/lib/despacho/sesion-repartidor";
import { createServiceClient } from "@/lib/supabase/server";
import { diaDelPanel } from "./dia";

export const dynamic = "force-dynamic";

/** Panel del repartidor › Mi ruta de hoy (24 nov 2026, pantalla 1 del prototipo aprobado). */
export default async function PaginaRepartidor({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const cuenta = await requireRepartidor();
  const nombre = cuenta.nombre.split(/\s+/)[0] || cuenta.nombre;
  if (await repartidorConClaveTemporal()) return <ElegirClave temporal nombre={nombre} />;
  const dia = diaDelPanel((await searchParams).dia);
  const ruta = await cargarRuta(createServiceClient(), cuenta, dia);
  if (ruta.faltaMigracion) return <p className="m-4 rounded-lg bg-white p-4 text-sm">Falta correr en Supabase la migración 0362 (panel del repartidor).</p>;
  return <MiRuta nombre={nombre} diaTexto={diaLargo(dia)} pedidos={ruta.pedidos} resumen={ruta.resumen} />;
}
