// Compras › Llegadas: lo que hay que mirar y pagar al llegar la mercancía (23 nov 2026, pedido de María José: que no se pierda entre los avisos). Solo servidor.
// Las llegadas ya existen (`compras_llegadas`, una por cambio de etapa a Llegada a Puerto o En Bodega); aquí se juntan las que siguen pendientes según la etapa ACTUAL de cada compra:
// una compra que ya pasó de En Bodega a Completado sale de la lista sola.

import type { SupabaseClient } from "@supabase/supabase-js";
import { hoyPanama } from "@/lib/af4/fecha";
import type { UsuarioActual } from "@/lib/auth";
import { desdeDeLista, EVENTO_DE_TIPO, filaSinMontos, type FilaLlegada } from "@/lib/compras/llegadas-avisos";
import { cargarFilasDeLlegadas, destinatariosDe } from "@/lib/compras/llegadas-servidor";
import { esAdministrador } from "@/lib/permisos/acceso";
import { sinAccesoACompras } from "../acceso-compras";
import { restriccionesDe, vePagosProveedor } from "../permisos-compras";

/** Cuántos días hacia atrás se buscan llegadas: una compra pendiente de pago lleva semanas, no meses. */
export const DIAS_BUSQUEDA_LLEGADAS = 120;
export const ETAPA_PUERTO = "arribo_mercancia";
export const ETAPA_BODEGA = "en_bodega";

export interface GrupoBodega {
  llegadaId: string;
  avisadaPor: string | null;
  avisadaEn: string;
  filas: FilaLlegada[];
}

export interface PanelLlegadas {
  bodega: GrupoBodega[];
  puerto: FilaLlegada[];
  verMontos: boolean;
  puedePagar: boolean;
  hoy: string;
}

/** De esas filas, las que esa persona puede ver (país y alcance de Compras). Un administrador y quien recibe el aviso las ven todas. */
async function visibles(filas: FilaLlegada[], usuario: UsuarioActual, todas: boolean): Promise<FilaLlegada[]> {
  if (todas || filas.length === 0) return filas;
  const ok = await Promise.all(filas.map(async (f) => (await sinAccesoACompras([f.compraId], usuario)) === null));
  return filas.filter((_, i) => ok[i]);
}

export async function cargarPanelLlegadas(supabase: SupabaseClient, usuario: UsuarioActual): Promise<PanelLlegadas> {
  const hoy = hoyPanama();
  const desde = desdeDeLista(hoy, DIAS_BUSQUEDA_LLEGADAS);
  const admin = esAdministrador(usuario);
  const conCompras = usuario.modulos.includes("compras");
  const [avisaBodega, avisaPuerto, bodegaTodas, puertoTodas] = await Promise.all([
    destinatariosDe(supabase, EVENTO_DE_TIPO.bodega),
    destinatariosDe(supabase, EVENTO_DE_TIPO.puerto),
    cargarFilasDeLlegadas(supabase, "bodega", desde),
    cargarFilasDeLlegadas(supabase, "puerto", desde),
  ]);
  const destinoBodega = avisaBodega.includes(usuario.id);
  const destinoPuerto = avisaPuerto.includes(usuario.id) || usuario.modulos.includes("llegadas");

  const pendientesBodega = await visibles(
    bodegaTodas.filter((f) => f.etapa === ETAPA_BODEGA),
    usuario,
    admin || destinoBodega,
  );
  const pendientesPuerto = await visibles(
    puertoTodas.filter((f) => f.etapa === ETAPA_PUERTO),
    usuario,
    admin || destinoPuerto,
  );

  // Lo mismo que la página de una llegada: sin ver el segundo pago, no se manda el dinero a la pantalla.
  const verMontos = destinoBodega || admin || (conCompras && vePagosProveedor(restriccionesDe(usuario.afinado.compras)));
  const puedePagar = verMontos && (admin || (conCompras && !usuario.modulosSoloLectura.includes("compras")));

  const ids = [...new Set(pendientesBodega.map((f) => f.llegadaId).filter((x): x is string => !!x))];
  const { data: meta } = ids.length ? await supabase.from("compras_llegadas").select("id, creado_por_nombre, creado_en").in("id", ids) : { data: [] };
  const porId = new Map(((meta ?? []) as { id: string; creado_por_nombre: string | null; creado_en: string }[]).map((m) => [m.id, m]));
  const grupos = new Map<string, GrupoBodega>();
  for (const f of pendientesBodega) {
    if (!f.llegadaId) continue;
    const m = porId.get(f.llegadaId);
    const g = grupos.get(f.llegadaId) ?? { llegadaId: f.llegadaId, avisadaPor: m?.creado_por_nombre ?? null, avisadaEn: m?.creado_en ?? f.llegadaEn ?? hoy, filas: [] };
    g.filas.push(verMontos ? f : filaSinMontos(f));
    grupos.set(f.llegadaId, g);
  }
  const bodega = [...grupos.values()].sort((a, b) => b.avisadaEn.localeCompare(a.avisadaEn));
  // La lista de puerto no lleva montos (igual que `/llegadas`).
  return { bodega, puerto: pendientesPuerto.map(filaSinMontos), verMontos, puedePagar, hoy };
}
