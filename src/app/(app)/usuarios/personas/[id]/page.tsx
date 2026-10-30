import { notFound } from "next/navigation";
import { EtiquetaMiga } from "@/components/migas/etiqueta-miga";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { cobertura, diferencias, nivelesDeRol, nivelesEfectivos, type PermisoPropio, type PermisoRol } from "@/lib/permisos/acceso";
import { contarAjustes, resolverAfinado, type FilaAfinada } from "@/lib/permisos/afinado";
import { MODULOS_AFINABLES, MODULOS_ACCESO, catalogoDe, etiquetaDeModulo, type Nivel } from "@/lib/permisos/catalogo";
import { esUuid } from "@/lib/seguridad/ruta-almacen";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarPuestosDeUsuarios, consultarRoles, consultaSegura } from "../../datos-usuarios";
import { ProveedorPuestosPersona } from "../../puestos-persona";
import { PaisesPersona } from "../../paises-persona";
import { PuestosPersona } from "../../puestos-persona";
import { AccesoEfectivo } from "./acceso-efectivo";
import { CabeceraPersona } from "./cabecera-persona";
import { DatosPersona } from "./datos-persona";
import { RolYAcceso, type AjustePropio } from "./rol-y-acceso";

export const metadata = { title: "Persona · Usuarios y roles" };

export const dynamic = "force-dynamic";

export default async function PersonaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await requireModulo("usuarios");
  if (!esUuid(id)) notFound();
  const supabase = createServiceClient();

  const [{ data: perfil }, paisesPersona, roles, authUsuario] = await Promise.all([
    supabase.from("perfiles").select("id, email, nombre, avatar_url, activo, rol_id, creado_en, primer_ingreso_en, foto_recordada_en, ultima_actividad_en").eq("id", id).maybeSingle(),
    // Aparte: sin la migración 0087 la columna no existe y la ficha se carga igual.
    supabase.from("perfiles").select("paises_permitidos").eq("id", id).maybeSingle(),
    consultarRoles(supabase),
    supabase.auth.admin.getUserById(id),
  ]);
  if (!perfil) notFound();

  const rol = roles.find((r) => r.id === perfil.rol_id) ?? null;
  const [permisosRol, propios, afinadosPersona, afinadosRol, puestos] = await Promise.all([
    perfil.rol_id ? consultaSegura<PermisoRol>(supabase.from("permisos_rol").select("modulo, solo_lectura").eq("rol_id", perfil.rol_id)) : Promise.resolve([] as PermisoRol[]),
    consultaSegura<PermisoPropio>(supabase.from("permisos_persona").select("modulo, nivel").eq("perfil_id", id)),
    consultaSegura<FilaAfinada>(supabase.from("permisos_persona_afinados").select("modulo, tipo, clave, valor").eq("perfil_id", id)),
    perfil.rol_id ? consultaSegura<FilaAfinada>(supabase.from("permisos_afinados").select("modulo, tipo, clave, valor").eq("rol_id", perfil.rol_id)) : Promise.resolve([] as FilaAfinada[]),
    cargarPuestosDeUsuarios(usuario.modulos, usuario.modulosSoloLectura),
  ]);

  const delRol = nivelesDeRol(permisosRol);
  const efectivos = nivelesEfectivos(permisosRol, propios);
  const diffs = diferencias(permisosRol, efectivos);

  // Cuántos ajustes tiene en cada módulo afinable (del rol y propios juntos, y solo los propios).
  const ajustesPropios: Record<string, number> = {};
  const ajustesTotales: Record<string, number> = {};
  for (const modulo of MODULOS_AFINABLES) {
    const catalogo = catalogoDe(modulo);
    ajustesPropios[modulo] = afinadosPersona.filter((f) => f.modulo === modulo).length;
    ajustesTotales[modulo] = contarAjustes(resolverAfinado(catalogo, [...afinadosRol.filter((f) => f.modulo === modulo), ...afinadosPersona.filter((f) => f.modulo === modulo)]));
  }

  // La lista de «Permisos propios»: cada módulo donde la persona se aparta de su rol, en el orden de la matriz.
  const propiosPorModulo = new Map(propios.map((p) => [p.modulo, p]));
  const modulosConAjuste = new Set([...propios.map((p) => p.modulo), ...MODULOS_AFINABLES.filter((m) => ajustesPropios[m] > 0)]);
  const lista: AjustePropio[] = MODULOS_ACCESO.filter((m) => modulosConAjuste.has(m.clave)).map((m) => {
    const antes: Nivel = delRol[m.clave] ?? "n";
    const despues: Nivel = efectivos[m.clave] ?? "n";
    return {
      modulo: m.clave,
      etiqueta: m.etiqueta,
      delRol: antes,
      efectivo: despues,
      tienePropio: propiosPorModulo.has(m.clave),
      ajustes: ajustesPropios[m.clave] ?? 0,
    };
  });

  const nombre = perfil.nombre ?? perfil.email;
  const esYo = perfil.id === usuario.id;
  const puedeEscribir = !usuario.modulosSoloLectura.includes("usuarios");
  const cob = cobertura(efectivos);
  const sinCambios = MODULOS_ACCESO.filter((m) => (efectivos[m.clave] ?? "n") !== "n" && !diffs.some((d) => d.modulo === m.clave)).map((m) => ({ modulo: m.clave, etiqueta: m.etiqueta, nivel: efectivos[m.clave] as Nivel }));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo={nombre} oculto />
      <EtiquetaMiga texto={nombre} />
      <CabeceraPersona
        persona={{
          id: perfil.id,
          email: perfil.email,
          nombre: perfil.nombre,
          avatarUrl: perfil.avatar_url,
          activo: perfil.activo,
          rolId: perfil.rol_id,
          rolNombre: rol?.nombre ?? null,
          rolColor: rol?.color ?? null,
          creadoEn: perfil.creado_en,
          primerIngresoEn: perfil.primer_ingreso_en,
          ultimoIngresoEn: authUsuario.data?.user?.last_sign_in_at ?? null,
          ultimaActividadEn: perfil.ultima_actividad_en,
          fotoRecordadaEn: perfil.foto_recordada_en,
          conSegundoPaso: (authUsuario.data?.user?.factors ?? []).some((f) => f.status === "verified"),
        }}
        propios={lista.length}
        esYo={esYo}
        puedeEscribir={puedeEscribir}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,34%)]">
        <div className="flex min-w-0 flex-col gap-5">
          <RolYAcceso
            personaId={perfil.id}
            nombre={nombre}
            roles={roles.map((r) => ({ id: r.id, nombre: r.nombre }))}
            rolId={perfil.rol_id}
            lista={lista}
            modulosConPropio={[...propiosPorModulo.keys()]}
            nivelesDelRol={delRol}
            ajustesTotales={ajustesTotales}
            puedeEscribir={puedeEscribir}
          />
          {!esYo && puedeEscribir && <PaisesPersona key={perfil.id} id={perfil.id} nombre={nombre} inicial={paisesPersona.error ? undefined : ((paisesPersona.data?.paises_permitidos as string[] | null) ?? null)} />}
          <ProveedorPuestosPersona valor={puestos}>
            <PuestosPersona key={`puesto-${perfil.id}`} personaId={perfil.id} nombre={nombre} />
          </ProveedorPuestosPersona>
          <DatosPersona
            persona={{ id: perfil.id, email: perfil.email, nombre: perfil.nombre, avatarUrl: perfil.avatar_url, rolId: perfil.rol_id, primerIngresoEn: perfil.primer_ingreso_en, ultimoIngresoEn: authUsuario.data?.user?.last_sign_in_at ?? null, fotoRecordadaEn: perfil.foto_recordada_en }}
            puedeEscribir={puedeEscribir}
          />
        </div>

        <AccesoEfectivo
          cobertura={cob}
          diferencias={diffs.map((d) => ({ modulo: d.modulo, etiqueta: etiquetaDeModulo(d.modulo), delRol: d.delRol, efectivo: d.efectivo, ajustes: ajustesPropios[d.modulo] ?? 0 }))}
          sinCambios={sinCambios}
        />
      </div>
    </Pagina>
  );
}
