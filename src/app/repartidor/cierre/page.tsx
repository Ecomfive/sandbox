import { CierreDia } from "@/components/repartidor/cierre-dia";
import { ElegirClave } from "@/components/repartidor/elegir-clave";
import { cargarRuta } from "@/lib/despacho/datos-repartidor";
import { diaLargo, puedeMarcar } from "@/lib/despacho/panel-repartidor";
import { repartidorConClaveTemporal, requireRepartidor } from "@/lib/despacho/sesion-repartidor";
import { createServiceClient } from "@/lib/supabase/server";
import { diaDelPanel } from "../dia";

export const dynamic = "force-dynamic";

/** Panel del repartidor › Cierre del día (pantalla 5 del prototipo aprobado). */
export default async function PaginaCierreRepartidor({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const cuenta = await requireRepartidor();
  const nombre = cuenta.nombre.split(/\s+/)[0] || cuenta.nombre;
  if (await repartidorConClaveTemporal()) return <ElegirClave temporal nombre={nombre} />;
  const { dia, hoy } = diaDelPanel((await searchParams).dia);
  const ruta = await cargarRuta(createServiceClient(), cuenta, dia);
  if (ruta.faltaMigracion) return <p className="m-4 rounded-lg bg-white p-4 text-sm">Falta correr en Supabase la migración 0362 (panel del repartidor).</p>;
  return <CierreDia nombreCompleto={cuenta.nombre} nombre={nombre} dia={dia} hoy={hoy} seEnvia={puedeMarcar(dia, hoy)} diaTexto={diaLargo(dia)} resumen={ruta.resumen} cierre={ruta.cierre} />;
}
