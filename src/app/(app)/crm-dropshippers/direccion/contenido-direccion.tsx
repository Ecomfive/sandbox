import type { UsuarioActual } from "@/lib/auth";
import { accesoCrm, areasVisibles } from "@/lib/crm/areas";
import type { Segmento } from "@/lib/crm/salud";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { VistaKpis, type KpisWhatsapp } from "../kpis/vista-kpis";
import { cargarDireccion } from "./datos-direccion";
import { cargarEquipo } from "./datos-equipo";
import { cargarPareto } from "./datos-pareto";
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
import { VistaResumen, type ResumenAtencion, type ResumenStock } from "./vista-resumen";
import type { DatosProductos } from "./datos-productos";

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

/** El stock que se acaba, resumido para el Resumen: no viaja la lista de clientes de cada producto (la página pesaba ~750 KB). */
function stockDe(d: DatosProductos): ResumenStock {
  const seAcaban = d.productos.filter((p) => p.estado === "agotado" || p.estado === "se_acaba");
  return {
    productos: seAcaban.length,
    clientes: new Set(seAcaban.flatMap((p) => p.clientes.map((c) => c.dropshipperId))).size,
    top: seAcaban.slice(0, 5).map((p) => ({ productoId: p.productoId, nombre: p.nombre, dropshippers: p.dropshippers, pedidos: p.pedidos, stock: p.stock, diasInventario: p.diasInventario, estado: p.estado, camino: p.camino })),
  };
}

/** Lo de la atención para el Resumen, de lo que devuelve `whatsapp_kpis` por área (la mediana, pesada por las consultas respondidas). */
function atencionDe(data: unknown): ResumenAtencion | null {
  const areas = ((data ?? {}) as { areas?: { consultas: number; sin_responder: number; en_15_min: number; mediana_min: number | null }[] }).areas;
  if (!areas) return null;
  const consultas = areas.reduce((s, a) => s + Number(a.consultas), 0);
  const sinResponder = areas.reduce((s, a) => s + Number(a.sin_responder), 0);
  const conMediana = areas.filter((a) => a.mediana_min !== null && Number(a.consultas) - Number(a.sin_responder) > 0);
  const peso = conMediana.reduce((s, a) => s + Number(a.consultas) - Number(a.sin_responder), 0);
  return {
    consultas,
    sinResponder,
    en15: areas.reduce((s, a) => s + Number(a.en_15_min), 0),
    medianaMin: peso ? conMediana.reduce((s, a) => s + Number(a.mediana_min) * (Number(a.consultas) - Number(a.sin_responder)), 0) / peso : null,
  };
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
 *  - Resumen (30 oct 2026, pedido de Hernán: paneles con gráficas para decidir, no listas): las cifras clave, los pedidos por semana, el estado de
 *    la cartera, dónde está el riesgo, los que más piden, qué atender hoy, el stock que se acaba, las entregas y la atención por WhatsApp.
 *  - Clientes (fase 1): los chips de estado y la lista de clientes con su ficha al lado (lo que vende y qué recomendarle, fase 3). Abre con el
 *    estado (`segmento`) o el cliente (`cliente`) que se eligió en el Resumen.
 *  - Pareto 80/20 (31 oct 2026, pedido de Hernán, `crm_pedidos_mensuales`, migración 0207): **integrado, sin pestaña propia**: el de toda la operación va en el
 *    Resumen (3, 6 o 12 meses) y el de cada cliente, en su clase en la lista de Clientes y en su ficha (con el 80/20 de sus productos).
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
  // El Resumen también lleva la atención de los últimos 7 días.
  const kpis =
    vista === "kpis" || vista === "resumen" ? await supabase.rpc("whatsapp_kpis", { p_desde: desdeHace(vista === "resumen" ? 7 : dias), p_areas: areasVisibles(accesoCrm(usuario)) }) : null;
  const datos = vista === "kpis" ? null : await cargarDireccion(supabase, pais.id);
  const ok = !!datos && !("error" in datos);
  const filas = ok ? datos.filas : [];
  const [equipo, productos, entregas, duplicados, secuencia, pareto] = await Promise.all([
    vista === "equipo" && ok ? cargarEquipo(supabase, dias, filas) : null,
    (vista === "clientes" || vista === "productos" || vista === "resumen") && ok ? cargarProductos(supabase, pais.id, usuario, filas.map((f) => f.id)) : null,
    vista === "entregas" || vista === "resumen" ? cargarEntregas(supabase, pais.id, vista === "resumen" ? 60 : dias) : null,
    vista === "duplicados" ? cargarDuplicados(supabase) : null,
    vista === "automatizaciones" ? cargarSecuenciaAlta(supabase) : null,
    // Las guías mes a mes: el Pareto del Resumen y el de cada cliente (lista y ficha) las usan.
    (vista === "resumen" || vista === "clientes") && ok ? cargarPareto(supabase, pais.id, datos.hoy) : null,
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
      return (
        <VistaResumen
          datos={datos}
          pareto={pareto ?? null}
          stock={productos && !("error" in productos) ? stockDe(productos) : null}
          entregas={Array.isArray(entregas) ? entregas : null}
          atencion={kpis?.error ? null : atencionDe(kpis?.data)}
          codigoPais={pais.codigo}
        />
      );
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
          pareto={pareto && !("error" in pareto) ? pareto : null}
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
