import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getUsuarioActual } from "@/lib/auth";
import { redirect } from "next/navigation";
import { esAvisoDePuerto, hrefDeAviso, hrefDeListaPuerto, pendientesDeRecibir, totalesDeLlegada } from "@/lib/compras/llegadas-avisos";
import { cargarFilasDeLlegadas } from "@/lib/compras/llegadas-servidor";
import { motivoSinAccesoAPuerto } from "../llegadas/acceso-llegadas";
import type { LlegadasEnAvisos } from "./llegadas-puerto-aviso";
import { ParaTi, type AvisoParaTi } from "./para-ti";
import { ActualizacionesAvisos, type ActualizacionAviso } from "./actualizaciones-avisos";
import { claveNovedad, DIAS_AVISO, recientes } from "@/lib/ayuda/actualizaciones";
import { novedadesPara } from "@/lib/ayuda/contenido";
import { hoyPanama, vistasDe } from "@/lib/ayuda/novedades-vistas";
import { etiquetaDeModulo } from "@/lib/permisos/catalogo";
import { getPaisActual } from "@/lib/pais";
import { obtenerPendientesHoy } from "@/lib/pendientes-hoy";
import { pendientesVisibles } from "@/lib/hoy";
import { CentroNotificaciones } from "./centro-notificaciones";
import { ENTIDADES_CON_PAIS, eventoCompraParaRol, eventoCrmVisible, eventoDeTiendaVisible, eventoVisible, veTodosLosChats } from "@/lib/auditoria-visible";
import type { AreaCrm } from "@/lib/crm/areas";
import { COLUMNA_TIENDA, type TablaConTienda } from "@/lib/finanzas/acceso-tienda";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { dentroDelAlcance, ES_ALCANCE_LIMITADO, restriccionesDe } from "../compras/permisos-compras";

export const metadata = { title: "Centro de notificaciones" };

export const dynamic = "force-dynamic";

/**
 * Centro de notificaciones. Arriba, «Para ti»: los avisos personales (menciones con «@»), que ve todo el que los tenga, y las actualizaciones
 * del sistema de sus módulos, que cada persona marca como leídas. El resto (pendientes del día, actividad, sesiones de Dropi) solo con el módulo.
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
  const avisos: AvisoParaTi[] = (propios ?? []).map((a) => ({ id: a.id, titulo: a.titulo, texto: a.texto, href: hrefDeAviso(a.titulo, a.href), leida: !!a.leida_en, creadoEn: a.creado_en }));
  // Los avisos «Llega a puerto» (uno por cambio de etapa) se juntan en una sola tarjeta con la lista completa de lo que sigue por recibir (24 nov 2026, pedido de Logística).
  const avisosPuerto = avisos.filter((a) => esAvisoDePuerto(a.titulo));
  let llegadas: LlegadasEnAvisos | null = null;
  if (avisosPuerto.length > 0 && !(await motivoSinAccesoAPuerto(supabase, usuario))) {
    const masViejo = avisosPuerto.reduce((m, a) => (a.creadoEn < m ? a.creadoEn : m), avisosPuerto[0].creadoEn);
    // La llegada se guarda un instante antes que su aviso: se busca desde una hora antes del aviso más viejo.
    const todas = await cargarFilasDeLlegadas(supabase, "puerto", new Date(Date.parse(masViejo) - 3_600_000).toISOString());
    const sinAcceso = todas.length > 0 && (await motivoSinAccesoAPuerto(supabase, usuario, todas.map((f) => f.compraId)));
    if (!sinAcceso) {
      const porRecibir = pendientesDeRecibir(todas);
      const t = totalesDeLlegada(porRecibir);
      llegadas = {
        avisoIds: avisosPuerto.map((a) => a.id),
        sinLeer: avisosPuerto.filter((a) => !a.leida).length,
        creadoEn: avisosPuerto.reduce((m, a) => (a.creadoEn > m ? a.creadoEn : m), avisosPuerto[0].creadoEn),
        compras: t.compras,
        unidades: t.unidades,
        cajas: t.cajas,
        sinCajas: t.sinCajas,
        href: hrefDeListaPuerto(hoyPanama(), porRecibir),
      };
    }
  }
  const avisosSueltos = llegadas ? avisos.filter((a) => !esAvisoDePuerto(a.titulo)) : avisos;
  // Las actualizaciones del sistema de sus módulos de los últimos días, con las que ya vio (migración 0218).
  const vistas = await vistasDe(supabase, usuario.id);
  const actualizaciones: ActualizacionAviso[] = recientes(novedadesPara(usuario.modulos), hoyPanama()).map((n) => ({
    clave: claveNovedad(n),
    fecha: n.fecha,
    titulo: n.titulo,
    texto: n.texto,
    href: n.href ?? null,
    modulo: n.modulo ? etiquetaDeModulo(n.modulo) : null,
    vista: vistas.has(claveNovedad(n)),
  }));

  if (!usuario.modulos.includes("notificaciones")) {
    return (
      <Pagina ancho="media" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Centro de notificaciones" oculto />
        <ParaTi avisos={avisosSueltos} llegadas={llegadas} />
        <ActualizacionesAvisos actualizaciones={actualizaciones} dias={DIAS_AVISO} />
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

  // El país de cada compra, ruta, landing, publicación y ficha WMS que aparece, para no mostrar la de un país no permitido; y, si el rol
  // solo ve sus compras o tiene campos ocultos en Compras, las compras ajenas y esos datos tampoco (auditorías del 27 oct y 18 nov 2026).
  const restricciones = restriccionesDe(usuario.afinado.compras);
  const alcanceLimitado = ES_ALCANCE_LIMITADO(restricciones.alcance);
  const ids = (entidad: string) => [...new Set((todos ?? []).filter((e) => e.entidad === entidad && e.entidad_id).map((e) => e.entidad_id as string))];
  const paisPor = new Map<string, string | null>();
  const compraDentro = new Map<string, boolean>();
  let listaPaises: { codigo: string; nombre: string }[] = [];
  if (usuario.paisesPermitidos !== null || alcanceLimitado) {
    const otras = [...ENTIDADES_CON_PAIS].filter((t) => t !== "wms_compras" && t !== "wms_rutas_envio");
    const [compras, rutas, todosPaises, ...conPais] = await Promise.all([
      ids("wms_compras").length
        ? supabase.from("wms_compras").select("id, tipo, paises(codigo), asignado_a, creado_por, responsable_nombre, creador_nombre").in("id", ids("wms_compras"))
        : Promise.resolve({ data: [] }),
      ids("wms_rutas_envio").length ? supabase.from("wms_rutas_envio").select("id, pais_codigo").in("id", ids("wms_rutas_envio")) : Promise.resolve({ data: [] }),
      supabase.from("paises").select("id, codigo, nombre"),
      ...otras.map((t) => (usuario.paisesPermitidos !== null && ids(t).length ? supabase.from(t).select("id, pais_id").in("id", ids(t)) : Promise.resolve({ data: [] }))),
    ]);
    const filasPaises = (todosPaises.data ?? []) as { id: string; codigo: string; nombre: string }[];
    listaPaises = filasPaises;
    const codigoPorId = new Map(filasPaises.map((p) => [p.id, p.codigo]));
    type FilaCompra = { id: string; tipo: string; paises: { codigo: string } | { codigo: string }[] | null; asignado_a: string | null; creado_por: string | null; responsable_nombre: string | null; creador_nombre: string | null };
    for (const c of (compras.data ?? []) as unknown as FilaCompra[]) {
      const p = Array.isArray(c.paises) ? c.paises[0] : c.paises;
      paisPor.set(`wms_compras:${c.id}`, c.tipo === "importacion" ? null : (p?.codigo ?? null));
      compraDentro.set(c.id, dentroDelAlcance(restricciones.alcance, { asignadoId: c.asignado_a, creadoPorId: c.creado_por, responsableNombre: c.responsable_nombre, creadorNombre: c.creador_nombre }, usuario));
    }
    for (const r of (rutas.data ?? []) as { id: string; pais_codigo: string }[]) paisPor.set(`wms_rutas_envio:${r.id}`, r.pais_codigo);
    otras.forEach((t, i) => {
      for (const f of (conPais[i]?.data ?? []) as { id: string; pais_id: string | null }[]) {
        const codigo = f.pais_id ? codigoPorId.get(f.pais_id) : undefined;
        if (codigo) paisPor.set(`${t}:${f.id}`, codigo);
      }
    });
  }
  // Auditoría de seguridad, 18 nov 2026: con tiendas limitadas, solo lo de finanzas de sus tiendas; y del CRM, solo los chats de sus áreas
  // y de su alcance (como en la Bandeja).
  const permitidas = await cargarTiendasPermitidas();
  const unidadPor = new Map<string, string | null>();
  if (permitidas !== null) {
    const tablas = (Object.keys(COLUMNA_TIENDA) as TablaConTienda[]).filter((t) => ids(t).length);
    const leidas = await Promise.all(tablas.map((t) => supabase.from(t).select(`id, ${COLUMNA_TIENDA[t]}`).in("id", ids(t))));
    tablas.forEach((t, i) => {
      for (const f of (leidas[i].data ?? []) as unknown as Record<string, string | null>[]) unidadPor.set(`${t}:${f.id}`, f[COLUMNA_TIENDA[t]] ?? null);
    });
  }
  const chatPor = new Map<string, { area: AreaCrm; asignadaA: string | null }>();
  const idsChats = ids("whatsapp_conversaciones");
  // Quien ve todos los chats no necesita la consulta; para los demás, por tandas, y si una falla sus chats no se muestran.
  if (idsChats.length && usuario.modulos.includes("crm-dropshippers") && !veTodosLosChats(usuario)) {
    const tandas = Array.from({ length: Math.ceil(idsChats.length / 150) }, (_, i) => idsChats.slice(i * 150, i * 150 + 150));
    const leidas = await Promise.all(tandas.map((t) => supabase.from("whatsapp_conversaciones").select("id, area, asignada_a").in("id", t)));
    for (const { data: chats } of leidas)
      for (const c of (chats ?? []) as { id: string; area: AreaCrm | null; asignada_a: string | null }[]) if (c.area) chatPor.set(c.id, { area: c.area, asignadaA: c.asignada_a });
  }
  const eventos = (todos ?? [])
    .filter((e) => eventoVisible(e, usuario, (entidad, id) => paisPor.get(`${entidad}:${id}`), listaPaises))
    .filter((e) => !(alcanceLimitado && e.entidad === "wms_compras" && !compraDentro.get(e.entidad_id ?? "")))
    .filter((e) => eventoDeTiendaVisible(e, permitidas, (entidad, id) => unidadPor.get(`${entidad}:${id}`)))
    .filter((e) => eventoCrmVisible(e, usuario, (id) => chatPor.get(id)))
    .map((e) => (e.entidad === "wms_compras" ? eventoCompraParaRol(e, restricciones) : e))
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .slice(0, 200);

  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Centro de notificaciones" oculto>
        Lo que hay que corregir hoy, quién hizo qué en operaciones sensibles, y si las sesiones
        de Dropi siguen vivas — todo en un solo lugar.
      </EncabezadoPagina>

      <ParaTi avisos={avisosSueltos} llegadas={llegadas} />
      <ActualizacionesAvisos actualizaciones={actualizaciones} dias={DIAS_AVISO} />

      <CentroNotificaciones
        pendientes={pendientesVisibles(pendientes, usuario.modulos)}
        eventos={eventos}
        sesionesDropi={sesionesDropi ?? []}
        codigoPais={pais.codigo}
      />
    </Pagina>
  );
}
