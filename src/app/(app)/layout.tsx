import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { RUTA_PORTAL_PROVEEDOR, cuentaDeProveedor } from "@/lib/proveedor/cuenta";
import { RUTA_PANEL_REPARTIDOR, cuentaDeRepartidor } from "@/lib/despacho/cuenta-repartidor";
import { BannerVistaPrevia } from "@/components/banner-vista-previa";
import { BarraMigas } from "@/components/barra-migas";
import { LatidoPresencia } from "@/components/latido-presencia";
import { AvisoPedidosNuevos } from "@/components/tienda/aviso-pedidos-nuevos";
import { AvisoInactividad } from "@/components/aviso-inactividad";
import { AvisoPersonal } from "@/components/aviso-personal";
import { ProveedorPendientesVivos } from "@/components/pendientes-vivos";
import { ProveedorModulos } from "@/components/modulos-contexto";
import { ProveedorPais } from "@/components/pais-contexto";
import { ProveedorDescargaPdf } from "@/components/tabla/descarga-pdf-contexto";
import { PUEDEN_DESCARGAR_PDF } from "@/lib/tabla/permiso-pdf";
import { NavBar } from "@/components/nav";
import { Sidebar } from "@/components/sidebar";
import { ToastProvider } from "@/components/ui/toast";
import { TransicionPagina } from "@/components/transicion-pagina";
import { getDosPasos, getUsuarioActual, getUsuarioIdSesion, getUsuarioSesion, irADosPasosSiFalta } from "@/lib/auth";
import { AvisoDosPasos } from "@/components/cuenta/aviso-dos-pasos";
import { tieneContrasenaTemporal } from "@/lib/cuenta/contrasena";
import { getPaisActual } from "@/lib/pais";
import { PAISES_CON_RECEPCION, PAISES_QUE_RECIBEN_COMPRAS } from "@/lib/wms/recepcion";
import { obtenerPlataformasPais } from "@/lib/pais-plataformas";
import { colapsarGestionDeIds, construirAreas, pestanasSinModulo } from "@/lib/nav-data";
import { getPlataformaActual } from "@/lib/plataforma-actual";
import { paginasBuscables } from "@/lib/paleta";
import { esAdministrador } from "@/lib/permisos/acceso";
import { veAlgunaFuente } from "@/lib/actualizar-datos/modulos";
import { REVISAN_CAMBIOS } from "@/lib/ayuda/actualizaciones";
import { contarNovedadesSinVer } from "@/lib/ayuda/novedades-vistas";
import { PESTANAS_POR_PAIS, PESTANAS_SOLO_ADMIN, PESTANAS_USO_SISTEMA, pestanasOcultasDe } from "@/lib/permisos/ocultas";
import { createServiceClient } from "@/lib/supabase/server";
import { obtenerFavoritos } from "@/lib/favoritos";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { modulosSegunTiendas } from "@/lib/finanzas/tiendas-permitidas";
import { obtenerPendientesHoy } from "@/lib/pendientes-hoy";
import { leerUrgentes, SIN_URGENTES } from "@/lib/avisos-urgentes";
import { contarParaTi } from "@/lib/menciones";
import {
  SIN_PENDIENTES,
  calcularPendientesMenu,
  necesitaPendientes,
  conParaTi,
  type PendientesMenu,
} from "@/lib/contadores-menu";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = createServiceClient();
  // Lo que arma el menú no depende una cosa de la otra: se pide todo a la vez, no una consulta tras otra.
  // El usuario y el país arrancan primero; las plataformas dependen del país y los favoritos del id de la
  // sesión (que ya está en memoria por la comprobación de acceso), así que salen sin esperar al perfil.
  const paisP = getPaisActual(supabase);
  const usuarioP = getUsuarioActual();
  // Los contadores arrancan en cuanto se conocen el país y la persona, y no se esperan: el menú lleva la promesa y
  // los números llegan por streaming; si la consulta falla, el menú sale sin contadores en vez de romper la página.
  const pendientes: Promise<PendientesMenu> = Promise.all([paisP, usuarioP])
    .then(([p, u]) =>
      Promise.all([
        u && necesitaPendientes(u.modulos)
          ? obtenerPendientesHoy(supabase, p.id).then((datos) => calcularPendientesMenu(datos, u.modulos))
          : SIN_PENDIENTES,
        // Los avisos «Para ti» (menciones con «@») de esta persona, sin leer.
        u ? contarParaTi(u.id).catch(() => 0) : 0,
        // Las actualizaciones del sistema recientes de sus módulos que no ha visto (migración 0218).
        u ? contarNovedadesSinVer(supabase, u).catch(() => 0) : 0,
        // Sus tareas del equipo sin cerrar (Equipo › Tareas, migración 0215): lo único que cuenta la campana.
        u && u.modulos.includes("tareas")
          ? Promise.resolve(
              supabase.from("tareas_equipo").select("id", { count: "exact", head: true }).eq("responsable_id", u.id).not("estado", "in", "(hecho,archivado)"),
            ).then((r) => (r.error ? 0 : (r.count ?? 0)), () => 0)
          : 0,
        // Pedidos y mercancía en puerto sin ver: ponen el menú en rojo.
        u ? leerUrgentes(supabase, u.id).catch(() => SIN_URGENTES) : SIN_URGENTES,
      ]).then(([menu, paraTi, novedades, tareasMias, urgentes]) => conParaTi(menu, paraTi, novedades, tareasMias, urgentes))
    )
    .catch(() => SIN_PENDIENTES);
  const [plataformasPais, favoritosDeSesion, usuario, permitidas, paisActual, avisoInactividad] = await Promise.all([
    paisP.then((p) => obtenerPlataformasPais(supabase, p.id)),
    getUsuarioIdSesion().then((id) => (id ? obtenerFavoritos(supabase, id) : [])),
    usuarioP,
    // Tiendas permitidas (mejora 99): con límite, el menú no muestra lo que es de toda la empresa.
    usuarioP.then((u) => (u ? cargarTiendasPermitidas() : null)).catch(() => null),
    paisP,
    // Si se le muestra el aviso de 5 minutos sin actividad (Configuración, migración 0249). Sin la migración, a nadie.
    getUsuarioIdSesion().then((id) =>
      id ? supabase.from("perfiles").select("aviso_inactividad").eq("id", id).maybeSingle().then((r) => !r.error && r.data?.aviso_inactividad === true) : false,
    ),
  ]);
  // Quien entra con la contraseña temporal que le dio un administrador elige la suya antes de usar el sistema (31 oct 2026).
  if (usuario && tieneContrasenaTemporal(await getUsuarioSesion())) redirect("/elegir-contrasena");
  // Una cuenta del portal del proveedor no tiene perfil: no ve ni el menú del sistema, vuelve a su portal.
  if (!usuario) {
    // Le falta la verificación en dos pasos (seguridad · 19 nov 2026): sin módulos hasta escribir el código; va a /dos-pasos.
    await irADosPasosSiFalta();
    const usuarioId = await getUsuarioIdSesion();
    if (usuarioId && (await cuentaDeProveedor(usuarioId))) redirect(RUTA_PORTAL_PROVEEDOR);
    // Una cuenta de repartidor (24 nov 2026) tampoco tiene perfil: vuelve a su panel.
    if (usuarioId && (await cuentaDeRepartidor(usuarioId))) redirect(RUTA_PANEL_REPARTIDOR);
  }
  // Quien administra sin la verificación en dos pasos, mientras no es obligatoria: una invitación a activarla.
  const invitarDosPasos = !!usuario && !usuario.vistaPrevia && (await getDosPasos())?.estado === "invitar";
  const favoritos = usuario ? favoritosDeSesion : [];
  const areas = construirAreas(plataformasPais);
  const modulosMenu = usuario ? modulosSegunTiendas(usuario.modulos, permitidas) : null;
  const pestanasOcultas = usuario
    ? [
        ...pestanasOcultasDe(usuario.afinado),
        // Las pestañas de Gestión de tienda cuyo módulo no tiene (17 nov 2026).
        ...pestanasSinModulo(usuario.modulos),
        ...(esAdministrador(usuario) ? [] : PESTANAS_SOLO_ADMIN),
        ...(usuario.modulos.includes("uso-sistema") ? [] : PESTANAS_USO_SISTEMA),
        ...(usuario.modulos.includes("compras-por-pais") ? [] : PESTANAS_POR_PAIS),
        ...(PAISES_QUE_RECIBEN_COMPRAS.includes(paisActual.codigo) ? [] : ["/inventario/recepcion"]),
        ...(PAISES_CON_RECEPCION.includes(paisActual.codigo) ? [] : ["/inventario/cuadro", "/inventario/novedades"]),
        // Los KPIs de atención y el panel de Dirección ya no son pestañas: desde el 30 oct 2026 son la Bandeja de Dirección.
      ]
    : [];
  const paginas = paginasBuscables(areas, modulosMenu, pestanasOcultas);
  // Gestión de IDs es una sola entrada del menú (Dropi, Drop o Effi según la plataforma de la barra); las migas y el buscador siguen viendo las tres.
  const areasMenu = colapsarGestionDeIds(areas, { plataforma: await getPlataformaActual(paisActual.codigo), codigoPais: paisActual.codigo, modulos: modulosMenu });

  return (
    <ProveedorModulos modulos={usuario?.modulos ?? null}>
    <ProveedorPais codigo={paisActual.codigo}>
    <ProveedorPendientesVivos>
    <ProveedorDescargaPdf puede={!!usuario && PUEDEN_DESCARGAR_PDF.has(usuario.id)}>
    <ToastProvider>
      {usuario && <LatidoPresencia />}
      {/* «Nuevo pedido» de las tiendas conectadas a Shopify (12 nov 2026): desde el 16 nov, solo para despacho y en sus páginas; Admin y CEO, sin sonido de entrada. */}
      {usuario?.modulos.includes("despacho-ciudad") && (
        <AvisoPedidosNuevos codigoPais={paisActual.codigo} sonidoPorDefecto={!["admin", "ceo"].includes((usuario.rolNombre ?? "").trim().toLowerCase())} />
      )}
      {/* Avisos personales que alguien tiene que atender (Llegada a Puerto, En Bodega, remisiones), en cualquier página (17 nov 2026). */}
      {usuario && <AvisoPersonal />}
      {usuario && avisoInactividad && <AvisoInactividad />}
      {usuario?.vistaPrevia && <BannerVistaPrevia rolNombre={usuario.vistaPrevia.rolNombre} />}
      {invitarDosPasos && <AvisoDosPasos />}
      <div className="flex min-h-full">
        <Sidebar modulosPermitidos={modulosMenu} areas={areasMenu} favoritos={favoritos} pendientes={pendientes} verActualizaciones={!!usuario && REVISAN_CAMBIOS.has(usuario.id)} verDatos={!!usuario && veAlgunaFuente(usuario.modulos)} />
        <div className="flex min-h-full min-w-0 flex-1 flex-col">
          <NavBar paginas={paginas} pendientes={pendientes} />
          <BarraMigas areas={areas} favoritos={favoritos} pestanasOcultas={pestanasOcultas} verAccesos={!!usuario && esAdministrador(usuario)}
            verTarea={!!usuario && usuario.modulos.includes("tareas") && !usuario.modulosSoloLectura.includes("tareas")}
          />
          <TransicionPagina>{children}</TransicionPagina>
        </div>
      </div>
    </ToastProvider>
    </ProveedorDescargaPdf>
    </ProveedorPendientesVivos>
    </ProveedorPais>
    </ProveedorModulos>
  );
}
