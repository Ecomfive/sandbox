import type { UsuarioActual } from "@/lib/auth";
import { accesoCrm, areasVisibles } from "@/lib/crm/areas";
import type { Segmento } from "@/lib/crm/salud";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { VistaKpis, type KpisWhatsapp } from "../kpis/vista-kpis";
import { cargarDireccion } from "./datos-direccion";
import { cargarEquipo } from "./datos-equipo";
import { cargarDuplicados, cargarEntregas, cargarSecuenciaAlta } from "./datos-fase4";
import { cargarProductos } from "./datos-productos";
import { PanelDireccion } from "./panel-direccion";
import { EncabezadoDireccion } from "./piezas-direccion";
import { rutaVista, VISTAS_DIRECCION, type VistaDireccion } from "./ruta";
import { VistaAutomatizaciones } from "./vista-automatizaciones";
import { VistaDuplicados } from "./vista-duplicados";
import { VistaEntregas } from "./vista-entregas";
import { VistaEquipo } from "./vista-equipo";
import { VistaProductos } from "./vista-productos";

const PERIODOS_EQUIPO = [7, 30, 90];
const PERIODOS_ENTREGAS = [30, 60, 90];
const PERIODOS_KPIS = [7, 30, 90];
const SEGMENTOS: Segmento[] = ["activo", "riesgo", "dormido", "perdido", "sin_pedidos"];
const ES_ID = /^[0-9a-f-]{36}$/i;

/** El inicio del periodo (ISO): hace `dias` días. */
const desdeHace = (dias: number) => new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

/** El encabezado del panel (con el diseño del prototipo) y sus pestañas, que apuntan a la Bandeja. */
export function EncabezadoBandejaDireccion({ vista, pais }: { vista: VistaDireccion; pais: string }) {
  return <EncabezadoDireccion subtitulo={`${pais} · pedidos de Dropi de las cuentas vinculadas`} activa={vista} vistas={VISTAS_DIRECCION.map((v) => ({ ...v, href: rutaVista(v.valor) }))} />;
}

/** El periodo de una vista: el de la dirección si es uno de los que ofrece, si no el de siempre. */
function periodoDe(vista: VistaDireccion, dias: unknown): number {
  const periodos = vista === "entregas" ? PERIODOS_ENTREGAS : vista === "kpis" ? PERIODOS_KPIS : PERIODOS_EQUIPO;
  const d = Number(dias);
  if (periodos.includes(d)) return d;
  return vista === "entregas" ? 60 : vista === "kpis" ? 7 : 30;
}

/**
 * El panel de Dirección (módulo `crm-direccion`), que desde el 30 oct 2026 es la Bandeja de Dirección (pedido de Hernán: antes eran las pestañas
 * «Dirección» y «KPIs de atención» del CRM): el encabezado con sus pestañas y el contenido de la vista. Vistas:
 *  - Resumen (con el diseño del prototipo): las cifras de la cartera, «Qué atender hoy», la salud y los pedidos por semana.
 *  - Clientes (fase 1): los chips de estado y la lista de clientes con su ficha al lado (lo que vende y qué recomendarle, fase 3). Abre con el
 *    estado (`segmento`) o el cliente (`cliente`) que se eligió en el Resumen.
 *  - Productos (fase 3), Entregas (fase 4), Equipo (fase 2), Duplicados (fase 4) y Automatizaciones (fase 4).
 *  - KPIs de atención: tiempo de respuesta, sin responder, por número y por persona (`whatsapp_kpis`, migración 0164).
 * Solo lo ve Dirección: los chats y las pantallas de Comercial y Atención no cambian, y no se envía nada desde aquí.
 */
export async function ContenidoDireccion({
  usuario,
  vista,
  dias: diasParam,
  segmento: segmentoParam,
  cliente: clienteParam,
}: {
  usuario: UsuarioActual;
  vista: Exclude<VistaDireccion, "chats">;
  dias?: unknown;
  segmento?: unknown;
  cliente?: unknown;
}) {
  const dias = periodoDe(vista, diasParam);
  const segmento = SEGMENTOS.includes(segmentoParam as Segmento) ? (segmentoParam as Segmento) : null;
  const cliente = typeof clienteParam === "string" && ES_ID.test(clienteParam) ? clienteParam : null;
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const kpis = vista === "kpis" ? await supabase.rpc("whatsapp_kpis", { p_desde: desdeHace(dias), p_areas: areasVisibles(accesoCrm(usuario)) }) : null;
  const datos = vista === "kpis" ? null : await cargarDireccion(supabase, pais.id);
  const ok = !!datos && !("error" in datos);
  const filas = ok ? datos.filas : [];
  const [equipo, productos, entregas, duplicados, secuencia] = await Promise.all([
    vista === "equipo" && ok ? cargarEquipo(supabase, dias, filas) : null,
    (vista === "clientes" || vista === "productos") && ok ? cargarProductos(supabase, pais.id, usuario, filas.map((f) => f.id)) : null,
    vista === "entregas" ? cargarEntregas(supabase, pais.id, dias) : null,
    vista === "duplicados" ? cargarDuplicados(supabase) : null,
    vista === "automatizaciones" ? cargarSecuenciaAlta(supabase) : null,
  ]);
  const errorDe = (x: unknown) => (x && typeof x === "object" && "error" in x ? String((x as { error: string }).error) : null);
  const error =
    (vista === "kpis" && kpis?.error ? "Falta correr la migración 0164 (KPIs de WhatsApp) en la base." : null) ??
    errorDe(datos) ??
    errorDe(equipo) ??
    errorDe(entregas) ??
    errorDe(secuencia) ??
    (vista === "productos" ? errorDe(productos) : null);
  const escribe = accesoCrm(usuario).escribeDireccion;

  function contenido() {
    if (vista === "kpis") return <VistaKpis datos={kpis?.data as KpisWhatsapp} dias={dias} periodos={PERIODOS_KPIS} />;
    if (!ok || !datos) return null;
    if (vista === "equipo" && equipo && !("error" in equipo)) return <VistaEquipo datos={equipo} periodos={PERIODOS_EQUIPO} codigoPais={pais.codigo} />;
    if (vista === "productos" && productos && !("error" in productos)) return <VistaProductos datos={productos} clientes={filas} codigoPais={pais.codigo} />;
    if (vista === "entregas" && Array.isArray(entregas)) return <VistaEntregas filas={entregas} clientes={filas} dias={dias} periodos={PERIODOS_ENTREGAS} codigoPais={pais.codigo} />;
    if (vista === "duplicados" && duplicados) return <VistaDuplicados datos={duplicados} />;
    if (vista === "automatizaciones" && secuencia && !("error" in secuencia))
      return (
        <VistaAutomatizaciones
          datos={secuencia}
          personas={datos.personas}
          escribe={escribe}
          alertasAbiertas={datos.alertas.reduce<Record<string, number>>((m, x) => ((m[x.tipo] = (m[x.tipo] ?? 0) + 1), m), {})}
        />
      );
    if (vista === "resumen")
      return <PanelDireccion key="resumen" modo="resumen" segmentoInicial={null} clienteInicial={null} datos={datos} productos={null} codigoPais={pais.codigo} escribe={escribe} usuarioId={usuario.id} />;
    if (vista === "clientes")
      return (
        // La `key` arma el panel de nuevo con el estado o el cliente elegidos en el Resumen (si no, React guarda el estado de antes).
        <PanelDireccion
          key={`clientes-${segmento ?? "todos"}-${cliente ?? ""}`}
          modo="clientes"
          segmentoInicial={segmento}
          clienteInicial={cliente && filas.some((f) => f.id === cliente) ? cliente : null}
          datos={datos}
          productos={productos && !("error" in productos) ? productos : null}
          codigoPais={pais.codigo}
          escribe={escribe}
          usuarioId={usuario.id}
        />
      );
    return null;
  }

  return (
    <>
      <EncabezadoBandejaDireccion vista={vista} pais={pais.nombre} />
      {error ? (
        <p role="alert" className="m-0 rounded-lg border border-warning bg-warning-soft px-4 py-3 text-sm text-warning">
          {error}
        </p>
      ) : (
        contenido()
      )}
    </>
  );
}
