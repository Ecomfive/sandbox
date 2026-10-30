import Link from "next/link";
import { anilloFoco } from "@/components/ui/field";
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

/** El inicio del periodo (ISO): hace `dias` días. */
const desdeHace = (dias: number) => new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

/**
 * Las pestañas del panel de Dirección en la Bandeja, como el prototipo (https://claude.ai/artifact/EgMSyATkMEUXzk9LsX8Wkj): botones grandes, el
 * elegido en oscuro. «Chats» lleva a la bandeja de WhatsApp.
 */
export function PestanasDireccion({ vista }: { vista: VistaDireccion }) {
  return (
    <nav aria-label="Vistas de la bandeja de Dirección" className="flex gap-1.5 overflow-x-auto pb-1">
      {VISTAS_DIRECCION.map((v) => (
        <Link
          key={v.valor}
          href={rutaVista(v.valor)}
          aria-current={vista === v.valor ? "page" : undefined}
          className={`inline-flex min-h-11 flex-none items-center rounded-lg border px-3.5 text-sm font-semibold whitespace-nowrap ${
            vista === v.valor ? "border-foreground bg-foreground text-background" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
          } ${anilloFoco}`}
        >
          {v.etiqueta}
        </Link>
      ))}
    </nav>
  );
}

/** El periodo de una vista: el de la dirección si es uno de los que ofrece, si no el de siempre. */
function periodoDe(vista: VistaDireccion, dias: unknown): number {
  const periodos = vista === "entregas" ? PERIODOS_ENTREGAS : vista === "resumen" ? PERIODOS_KPIS : PERIODOS_EQUIPO;
  const d = Number(dias);
  if (periodos.includes(d)) return d;
  return vista === "entregas" ? 60 : vista === "resumen" ? 7 : 30;
}

/**
 * El contenido de cada vista del panel de Dirección (módulo `crm-direccion`), que desde el 30 oct 2026 es la Bandeja de Dirección (pedido de
 * Hernán: antes eran las pestañas «Dirección» y «KPIs de atención» del CRM). Vistas:
 *  - Resumen: los indicadores de la cartera, la cola «Qué atender hoy», la salud por bandas, los pedidos por semana y los KPIs de atención de
 *    WhatsApp (tiempo de respuesta, sin responder, por número y por persona; `whatsapp_kpis`, migración 0164).
 *  - Clientes (fase 1): la salud de cada dropshipper con cuenta de Dropi en el país; al abrir uno, lo que vende con su stock y qué recomendarle
 *    (fase 3), y la lista del segmento para una difusión.
 *  - Productos (fase 3), Entregas (fase 4), Equipo (fase 2), Duplicados (fase 4) y Automatizaciones (fase 4).
 * Solo lo ve Dirección: los chats y las pantallas de Comercial y Atención no cambian, y no se envía nada desde aquí.
 */
export async function ContenidoDireccion({ usuario, vista, dias: diasParam, segmento: segmentoParam }: { usuario: UsuarioActual; vista: Exclude<VistaDireccion, "chats">; dias?: unknown; segmento?: unknown }) {
  const dias = periodoDe(vista, diasParam);
  const segmento = SEGMENTOS.includes(segmentoParam as Segmento) ? (segmentoParam as Segmento) : null;
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const datos = await cargarDireccion(supabase, pais.id);
  const ok = !("error" in datos);
  const filas = ok ? datos.filas : [];
  const [equipo, productos, entregas, duplicados, secuencia, kpis] = await Promise.all([
    vista === "equipo" && ok ? cargarEquipo(supabase, dias, filas) : null,
    (vista === "clientes" || vista === "productos") && ok ? cargarProductos(supabase, pais.id, usuario, filas.map((f) => f.id)) : null,
    vista === "entregas" ? cargarEntregas(supabase, pais.id, dias) : null,
    vista === "duplicados" ? cargarDuplicados(supabase) : null,
    vista === "automatizaciones" ? cargarSecuenciaAlta(supabase) : null,
    vista === "resumen" ? supabase.rpc("whatsapp_kpis", { p_desde: desdeHace(dias), p_areas: areasVisibles(accesoCrm(usuario)) }) : null,
  ]);
  const errorDe = (x: unknown) => (x && typeof x === "object" && "error" in x ? String((x as { error: string }).error) : null);
  const error = errorDe(datos) ?? errorDe(equipo) ?? errorDe(entregas) ?? errorDe(secuencia) ?? (vista === "productos" ? errorDe(productos) : null);
  const escribe = accesoCrm(usuario).escribeDireccion;

  if (error)
    return (
      <p role="alert" className="m-0 rounded-lg border border-warning bg-warning-soft px-4 py-3 text-sm text-warning">
        {error}
      </p>
    );
  if (!ok) return null;
  if (vista === "equipo" && equipo && !("error" in equipo)) return <VistaEquipo datos={equipo} periodos={PERIODOS_EQUIPO} codigoPais={pais.codigo} />;
  if (vista === "productos" && productos && !("error" in productos)) return <VistaProductos datos={productos} clientes={filas} codigoPais={pais.codigo} />;
  if (vista === "entregas" && Array.isArray(entregas)) return <VistaEntregas filas={entregas} clientes={filas} dias={dias} periodos={PERIODOS_ENTREGAS} codigoPais={pais.codigo} />;
  if (vista === "duplicados" && duplicados) return <VistaDuplicados datos={duplicados} />;
  if (vista === "automatizaciones" && secuencia && !("error" in secuencia)) return <VistaAutomatizaciones datos={secuencia} personas={datos.personas} escribe={escribe} />;
  if (vista === "clientes")
    return <PanelDireccion modo="clientes" segmentoInicial={segmento} datos={datos} productos={productos && !("error" in productos) ? productos : null} codigoPais={pais.codigo} escribe={escribe} usuarioId={usuario.id} />;
  if (vista === "resumen")
    return (
      <>
        <PanelDireccion modo="resumen" segmentoInicial={null} datos={datos} productos={null} codigoPais={pais.codigo} escribe={escribe} usuarioId={usuario.id} />
        <section aria-labelledby="t-kpis-atencion" className="flex flex-col gap-4">
          <h2 id="t-kpis-atencion" className="m-0 text-base font-semibold">
            Atención de WhatsApp
          </h2>
          {kpis?.error ? (
            <p role="alert" className="m-0 rounded-lg border border-warning bg-warning-soft px-4 py-3 text-sm text-warning">
              Falta correr la migración 0164 (KPIs de WhatsApp) en la base.
            </p>
          ) : (
            <VistaKpis datos={kpis?.data as KpisWhatsapp} dias={dias} periodos={PERIODOS_KPIS} />
          )}
        </section>
      </>
    );
  return null;
}
