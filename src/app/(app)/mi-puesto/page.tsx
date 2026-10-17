import Link from "next/link";
import { AvatarPersona } from "@/components/ui/avatar-persona";
import { Badge } from "@/components/ui/badge";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { Seccion } from "@/components/ui/seccion-ficha";
import {
  CheckIcon,
  PersonaIcon,
  PuestosIcon,
  UniversidadIcon,
} from "@/lib/nav-icons";
import {
  cargarHechos,
  cargarPuestos,
  estadosDe,
  type FilaPuesto,
  type Persona,
} from "@/lib/puestos/datos";
import {
  avanceOnboarding,
  textoAvance,
  type EstadoEnlace,
} from "@/lib/puestos/onboarding";
import { jefesDe, puestosACargo } from "@/lib/puestos/organigrama";
import { ETAPAS, ETIQUETA_ETAPA, type Etapa } from "@/lib/puestos/puesto";
import { requireSesion } from "../ayuda/datos-ayuda";
import { TextoManual } from "../ayuda/manuales/texto-manual";
import { AvisoSinMigracion } from "../puestos/aviso-sin-migracion";

export const metadata = { title: "Mi puesto" };

export const dynamic = "force-dynamic";

/**
 * «Mi puesto»: lo abre cualquiera con sesión (no es un módulo) y muestra solo lo suyo: misión, responsabilidades, áreas de
 * resultado y autoridad de cada puesto que ocupa (el principal primero), su jefe, su equipo y su onboarding con el avance.
 */
export default async function MiPuestoPage() {
  const usuario = await requireSesion();
  const datos = await cargarPuestos();
  if (!datos) {
    return (
      <Pagina ancho="media" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Mi puesto" oculto />
        <AvisoSinMigracion />
      </Pagina>
    );
  }

  const mios = datos.ocupantes
    .filter((o) => o.usuarioId === usuario.id)
    .sort((a, b) => Number(b.principal) - Number(a.principal));
  const puestos = mios
    .map((o) => datos.puestos.find((p) => p.id === o.puestoId))
    .filter((p): p is FilaPuesto => !!p);
  const persona = new Map(
    datos.puestos.flatMap((p) => p.ocupantes).map((o) => [o.id, o as Persona]),
  );
  const jefe = jefesDe(usuario.id, datos.puestos, datos.ocupantes);
  const jefes = (jefe?.usuarioIds ?? [])
    .map((id) => persona.get(id))
    .filter((p): p is Persona => !!p);
  const aCargo = puestosACargo(
    puestos.map((p) => p.id),
    datos.puestos,
  ).map((p) => datos.puestos.find((x) => x.id === p.id)!);
  const hechos = (await cargarHechos([usuario.id], datos.manuales))(usuario.id);
  // Si nadie ocupa los puestos de arriba, se dice a qué puesto reporta (vacante), no que es la cabeza.
  const puestoJefeVacante = jefes.length === 0 && puestos[0]?.reportaA ? datos.puestos.find((p) => p.id === puestos[0].reportaA) : undefined;

  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Mi puesto" oculto />
      {puestos.length === 0 ? (
        <p className="rounded-[10px] border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          Todavía no tienes un puesto asignado.
        </p>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-[10px] border border-border bg-card p-5">
              <Seccion icono={PersonaIcon} titulo="Reportas a">
                {puestoJefeVacante ? (
                  <p className="flex items-center gap-2 text-sm">
                    <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-warning" />
                    {puestoJefeVacante.nombre} · vacante
                  </p>
                ) : jefes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nadie: eres la cabeza del organigrama.
                  </p>
                ) : (
                  <ListaPersonas
                    personas={jefes}
                    detalle={
                      datos.puestos.find((p) => p.id === jefe?.puestoId)?.nombre
                    }
                  />
                )}
              </Seccion>
            </div>
            <div className="rounded-[10px] border border-border bg-card p-5">
              <Seccion icono={PuestosIcon} titulo="Tu equipo">
                {aCargo.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Ningún puesto te reporta.
                  </p>
                ) : (
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {aCargo.map((p) => (
                      <li key={p.id} className="flex flex-col gap-1">
                        <span className="text-sm font-medium">{p.nombre}</span>
                        {p.ocupantes.length === 0 ? (
                          <span className="text-sm text-muted-foreground">
                            Vacante
                          </span>
                        ) : (
                          <ListaPersonas personas={p.ocupantes} />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Seccion>
            </div>
          </div>

          {puestos.map((p, i) => (
            <FichaMiPuesto
              key={p.id}
              puesto={p}
              principal={i === 0 && mios[0].principal}
              estados={estadosDe(p.enlaces, hechos)}
              avance={avanceOnboarding(p.enlaces, hechos)}
            />
          ))}
        </>
      )}
    </Pagina>
  );
}

function ListaPersonas({
  personas,
  detalle,
}: {
  personas: Persona[];
  detalle?: string;
}) {
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
      {personas.map((p) => (
        <li key={p.id} className="flex items-center gap-2 text-sm">
          <AvatarPersona
            nombre={p.nombre}
            email={p.email}
            avatarUrl={p.avatarUrl}
            tamano="sm"
          />
          <span className="flex flex-col">
            {p.nombre}
            {detalle && (
              <span className="text-xs text-muted-foreground">{detalle}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

const ESTADO: Record<
  EstadoEnlace,
  { texto: string; tono: "success" | "neutral" | "warning" }
> = {
  hecho: { texto: "Hecho", tono: "success" },
  pendiente: { texto: "Pendiente", tono: "neutral" },
  desactualizado: { texto: "Volver a leer", tono: "warning" },
};

function FichaMiPuesto({
  puesto,
  principal,
  estados,
  avance,
}: {
  puesto: FilaPuesto;
  principal: boolean;
  estados: Map<string, EstadoEnlace>;
  avance: ReturnType<typeof avanceOnboarding>;
}) {
  const grupos: { etapa: Etapa | null; titulo: string }[] = [
    ...ETAPAS.map((e) => ({
      etapa: e as Etapa | null,
      titulo: ETIQUETA_ETAPA[e],
    })),
    { etapa: null, titulo: "De consulta" },
  ];
  return (
    <article className="flex flex-col gap-4 rounded-[10px] border border-border bg-card p-5">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="m-0 text-lg font-semibold">{puesto.nombre}</h2>
        <Badge tone="neutral">{puesto.area}</Badge>
        {principal && <Badge tone="info">Puesto principal</Badge>}
      </header>
      {puesto.mision && <p className="m-0 text-base">{puesto.mision}</p>}
      <div className="flex flex-col divide-y divide-border">
        {puesto.kra.length > 0 && (
          <Seccion icono={CheckIcon} titulo="Áreas de resultado">
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm">
              {puesto.kra.map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ul>
          </Seccion>
        )}
        {puesto.responsabilidades && (
          <Seccion icono={CheckIcon} titulo="Responsabilidades">
            <div className="text-sm">
              <TextoManual texto={puesto.responsabilidades} />
            </div>
          </Seccion>
        )}
        {puesto.autoridad && (
          <Seccion icono={PuestosIcon} titulo="Lo que puedes decidir">
            <div className="text-sm">
              <TextoManual texto={puesto.autoridad} />
            </div>
          </Seccion>
        )}

        {puesto.enlaces.length > 0 && (
          <Seccion
            icono={UniversidadIcon}
            titulo={`Onboarding · ${textoAvance(avance)}`}
          >
            {grupos.map((g) => {
              const enlaces = puesto.enlaces.filter((e) => e.etapa === g.etapa);
              if (enlaces.length === 0) return null;
              const deEtapa = avance.etapas.find((a) => a.etapa === g.etapa);
              return (
                <div key={g.titulo} className="flex flex-col gap-1.5">
                  <h3 className="m-0 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.titulo}
                    {deEtapa && (
                      <span className="font-normal normal-case tracking-normal">
                        {textoAvance(deEtapa)}
                      </span>
                    )}
                  </h3>
                  <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-md border border-border p-0">
                    {enlaces.map((e) => {
                      const estado =
                        estados.get(`${e.tipo}:${e.id}`) ?? "pendiente";
                      return (
                        <li
                          key={`${e.tipo}:${e.id}`}
                          className="flex items-center gap-2 px-3 py-2"
                        >
                          <Badge
                            tone={e.tipo === "manual" ? "neutral" : "azul"}
                          >
                            {e.tipo === "manual" ? "Manual" : "Curso"}
                          </Badge>
                          <Link
                            href={
                              e.tipo === "manual"
                                ? `/ayuda/manuales/${e.id}`
                                : `/ayuda/universidad/${e.id}`
                            }
                            className="min-w-0 flex-1 truncate text-sm underline-offset-2 hover:underline"
                          >
                            {e.titulo}
                          </Link>
                          <Badge tone={ESTADO[estado].tono}>
                            {ESTADO[estado].texto}
                          </Badge>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </Seccion>
        )}
      </div>
    </article>
  );
}
