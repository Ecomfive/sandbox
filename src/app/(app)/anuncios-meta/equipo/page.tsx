import { cargarPaginaMeta, type ParametrosMeta } from "../datos-pagina";
import { MarcoMeta } from "../marco-meta";
import { ResumenDelEquipo, TablaComparativa, TarjetaPersona } from "../panel-equipo";
import { TarjetaMeta } from "../graficas";
import { RegistroActividad } from "../registro-actividad";

export const metadata = { title: "Equipo · Anuncios Meta" };

export const dynamic = "force-dynamic";

/**
 * Anuncios Meta › Equipo (rediseño del 20 nov 2026, pedido de Alcides): la actividad del grupo de trabajo con **todas las cuentas publicitarias juntas** (se puede filtrar por una). Cuántas campañas montó cada
 * persona en cada rango de tiempo (hoy, 7 y 30 días, 3 y 6 meses, 1 año), cada cuánto sube una, cuánto lleva sin subir, por mes y por día de la semana, qué tipo de campaña sube más y qué otros cambios hace en Meta;
 * y el registro de actividad, como el de un CRM. Sale de la fecha de creación de las campañas y del registro de actividad de Meta; si el acceso no trae el registro, lo dice.
 */
export default async function EquipoMetaPage({ searchParams }: { searchParams: ParametrosMeta }) {
  const { datos, escribe, pais, hayToken } = await cargarPaginaMeta(searchParams);
  const a = datos.actividad;
  const sinNada = a.equipo.total === 0 && a.personas.length === 0 && a.reciente.length === 0;
  return (
    <MarcoMeta titulo="Equipo" datos={datos} escribe={escribe} hayToken={hayToken} pais={pais} sinPeriodo>
      {sinNada ? (
        <p className="m-0 rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
          Meta todavía no dijo quién montó las campañas. Pulsa «Leer ahora»; si sigue vacío, el acceso a Meta no trae el registro de actividad de la cuenta (ver «Cuentas»).
        </p>
      ) : (
        <>
          <ResumenDelEquipo r={a.equipo} cuentas={datos.cuentas} cuentaId={datos.cuentaId} porCuenta={a.porCuenta} desde={a.desde} />

          {a.personas.length > 0 && (
            <section aria-labelledby="personas" className="flex flex-col gap-3">
              <h2 id="personas" className="m-0 text-sm font-semibold">
                Cada persona
              </h2>
              <div className="grid min-w-0 gap-4 xl:grid-cols-2">
                {a.personas.map((p, i) => (
                  <TarjetaPersona key={p.persona} p={p} indice={i} />
                ))}
              </div>
              {a.personas.length > 1 && <TablaComparativa personas={a.personas} />}
            </section>
          )}

          <TarjetaMeta titulo="Registro de actividad" derecha={`Últimos 6 meses${datos.cuentas.filter((c) => c.activa).length > 1 && !datos.cuentaId ? " · todas las cuentas" : ""}`} id="registro">
            {a.reciente.length === 0 ? (
              <p className="m-0 text-sm text-muted-foreground">Meta no entregó el registro de cambios de las cuentas: puede faltar el permiso de actividad del acceso (ver «Cuentas»). Las campañas montadas se cuentan igual, por su fecha de creación.</p>
            ) : (
              <RegistroActividad eventos={a.reciente} personas={a.personas.map((p) => p.persona)} hoy={datos.hasta} variasCuentas={datos.cuentas.filter((c) => c.activa).length > 1 && !datos.cuentaId} />
            )}
          </TarjetaMeta>
        </>
      )}
    </MarcoMeta>
  );
}
