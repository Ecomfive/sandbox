import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getUsuarioActual } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ParaTi, type AvisoParaTi } from "./para-ti";
import { getPaisActual } from "@/lib/pais";
import { obtenerPendientesHoy } from "@/lib/pendientes-hoy";
import { pendientesVisibles } from "@/lib/hoy";
import { CentroNotificaciones } from "./centro-notificaciones";
import { eventoVisible } from "@/lib/auditoria-visible";

export const metadata = { title: "Centro de notificaciones" };

export const dynamic = "force-dynamic";

/**
 * Centro de notificaciones. Arriba, «Para ti»: los avisos personales (menciones con «@»), que ve todo el que los tenga. El
 * resto (pendientes del día, actividad, sesiones de Dropi) solo con el módulo.
 */
export default async function NotificacionesPage() {
  const usuario = await getUsuarioActual();
  if (!usuario) redirect("/login");
  const supabase = createServiceClient();
  const { data: propios } = await supabase
    .from("notificaciones_usuario")
    .select("id, titulo, texto, href, leida_en, creado_en")
    .eq("usuario_id", usuario.id)
    .order("creado_en", { ascending: false })
    .limit(50);
  const avisos: AvisoParaTi[] = (propios ?? []).map((a) => ({ id: a.id, titulo: a.titulo, texto: a.texto, href: a.href, leida: !!a.leida_en, creadoEn: a.creado_en }));

  if (!usuario.modulos.includes("notificaciones")) {
    return (
      <Pagina ancho="media" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Centro de notificaciones" oculto />
        <ParaTi avisos={avisos} />
      </Pagina>
    );
  }

  const pais = await getPaisActual(supabase);

  const [pendientes, { data: todos }, { data: sesionesDropi }] = await Promise.all([
    obtenerPendientesHoy(supabase, pais.id),
    supabase
      .from("historial_auditoria")
      .select("id, usuario_nombre, accion, entidad, entidad_id, detalle, antes, despues, creado_en")
      .order("creado_en", { ascending: false })
      // Se piden más y se filtran: solo quedan los de los módulos (y países) que la persona puede ver.
      .limit(600),
    supabase.from("dropi_sesiones").select("pais_codigo, tipo, renovada_en, ok, mensaje").order("pais_codigo"),
  ]);

  // El país de cada compra y ruta de envío que aparece, para no mostrar la de un país no permitido.
  const ids = (entidad: string) => [...new Set((todos ?? []).filter((e) => e.entidad === entidad && e.entidad_id).map((e) => e.entidad_id as string))];
  const paisPor = new Map<string, string | null>();
  let listaPaises: { codigo: string; nombre: string }[] = [];
  if (usuario.paisesPermitidos !== null) {
    const [compras, rutas, todosPaises] = await Promise.all([
      ids("wms_compras").length ? supabase.from("wms_compras").select("id, tipo, paises(codigo)").in("id", ids("wms_compras")) : Promise.resolve({ data: [] }),
      ids("wms_rutas_envio").length ? supabase.from("wms_rutas_envio").select("id, pais_codigo").in("id", ids("wms_rutas_envio")) : Promise.resolve({ data: [] }),
      supabase.from("paises").select("codigo, nombre"),
    ]);
    listaPaises = (todosPaises.data ?? []) as { codigo: string; nombre: string }[];
    for (const c of (compras.data ?? []) as { id: string; tipo: string; paises: { codigo: string } | { codigo: string }[] | null }[]) {
      const p = Array.isArray(c.paises) ? c.paises[0] : c.paises;
      paisPor.set(`wms_compras:${c.id}`, c.tipo === "importacion" ? null : (p?.codigo ?? null));
    }
    for (const r of (rutas.data ?? []) as { id: string; pais_codigo: string }[]) paisPor.set(`wms_rutas_envio:${r.id}`, r.pais_codigo);
  }
  const eventos = (todos ?? [])
    .filter((e) => eventoVisible(e, usuario, (entidad, id) => paisPor.get(`${entidad}:${id}`), listaPaises))
    .slice(0, 200);

  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Centro de notificaciones" oculto>
        Lo que hay que corregir hoy, quién hizo qué en operaciones sensibles, y si las sesiones
        de Dropi siguen vivas — todo en un solo lugar.
      </EncabezadoPagina>

      <ParaTi avisos={avisos} />

      <CentroNotificaciones
        pendientes={pendientesVisibles(pendientes, usuario.modulos)}
        eventos={eventos}
        sesionesDropi={sesionesDropi ?? []}
        codigoPais={pais.codigo}
      />
    </Pagina>
  );
}
