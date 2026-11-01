import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { RUTA_PORTAL_PROVEEDOR, cuentaDeProveedor } from "@/lib/proveedor/cuenta";
import { BannerVistaPrevia } from "@/components/banner-vista-previa";
import { BarraMigas } from "@/components/barra-migas";
import { LatidoPresencia } from "@/components/latido-presencia";
import { ProveedorModulos } from "@/components/modulos-contexto";
import { ProveedorPais } from "@/components/pais-contexto";
import { NavBar } from "@/components/nav";
import { Sidebar } from "@/components/sidebar";
import { ToastProvider } from "@/components/ui/toast";
import { TransicionPagina } from "@/components/transicion-pagina";
import { getUsuarioActual, getUsuarioIdSesion, getUsuarioSesion } from "@/lib/auth";
import { tieneContrasenaTemporal } from "@/lib/cuenta/contrasena";
import { getPaisActual } from "@/lib/pais";
import { obtenerPlataformasPais } from "@/lib/pais-plataformas";
import { construirAreas } from "@/lib/nav-data";
import { paginasBuscables } from "@/lib/paleta";
import { esAdministrador } from "@/lib/permisos/acceso";
import { ultimaFecha } from "@/lib/ayuda/actualizaciones";
import { NOVEDADES } from "@/lib/ayuda/contenido";
import { PESTANAS_SOLO_ADMIN, pestanasOcultasDe } from "@/lib/permisos/ocultas";
import { createServiceClient } from "@/lib/supabase/server";
import { obtenerFavoritos } from "@/lib/favoritos";
import { obtenerPendientesHoy } from "@/lib/pendientes-hoy";
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
      ]).then(([menu, paraTi]) => conParaTi(menu, paraTi))
    )
    .catch(() => SIN_PENDIENTES);
  const [plataformasPais, favoritosDeSesion, usuario, paisActual] = await Promise.all([
    paisP.then((p) => obtenerPlataformasPais(supabase, p.id)),
    getUsuarioIdSesion().then((id) => (id ? obtenerFavoritos(supabase, id) : [])),
    usuarioP,
    paisP,
  ]);
  // Quien entra con la contraseña temporal que le dio un administrador elige la suya antes de usar el sistema (31 oct 2026).
  if (usuario && tieneContrasenaTemporal(await getUsuarioSesion())) redirect("/elegir-contrasena");
  // Una cuenta del portal del proveedor no tiene perfil: no ve ni el menú del sistema, vuelve a su portal.
  if (!usuario) {
    const usuarioId = await getUsuarioIdSesion();
    if (usuarioId && (await cuentaDeProveedor(usuarioId))) redirect(RUTA_PORTAL_PROVEEDOR);
  }
  const favoritos = usuario ? favoritosDeSesion : [];
  const areas = construirAreas(plataformasPais);
  const pestanasOcultas = usuario
    ? [
        ...pestanasOcultasDe(usuario.afinado),
        ...(esAdministrador(usuario) ? [] : PESTANAS_SOLO_ADMIN),
        // Los KPIs de atención y el panel de Dirección ya no son pestañas: desde el 30 oct 2026 son la Bandeja de Dirección.
      ]
    : [];
  const paginas = paginasBuscables(areas, usuario?.modulos ?? null, pestanasOcultas);

  return (
    <ProveedorModulos modulos={usuario?.modulos ?? null}>
    <ProveedorPais codigo={paisActual.codigo}>
    <ToastProvider>
      {usuario && <LatidoPresencia />}
      {usuario?.vistaPrevia && <BannerVistaPrevia rolNombre={usuario.vistaPrevia.rolNombre} />}
      <div className="flex min-h-full">
        <Sidebar modulosPermitidos={usuario?.modulos ?? null} areas={areas} favoritos={favoritos} pendientes={pendientes} ultimaActualizacion={usuario && esAdministrador(usuario) ? ultimaFecha(NOVEDADES) : null} />
        <div className="flex min-h-full min-w-0 flex-1 flex-col">
          <NavBar paginas={paginas} pendientes={pendientes} plataforma={plataformasPais.find((p) => p.tieneDatos)?.nombre ?? null} />
          <BarraMigas areas={areas} favoritos={favoritos} pestanasOcultas={pestanasOcultas} verAccesos={!!usuario && esAdministrador(usuario)} />
          <TransicionPagina>{children}</TransicionPagina>
        </div>
      </div>
    </ToastProvider>
    </ProveedorPais>
    </ProveedorModulos>
  );
}
