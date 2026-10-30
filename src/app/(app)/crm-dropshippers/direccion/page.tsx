import Link from "next/link";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { anilloFoco } from "@/components/ui/field";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { accesoCrm, MODULO_DIRECCION } from "@/lib/crm/areas";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarDireccion } from "./datos-direccion";
import { cargarEquipo } from "./datos-equipo";
import { PanelDireccion } from "./panel-direccion";
import { VistaEquipo } from "./vista-equipo";

export const metadata = { title: "Dirección" };

export const dynamic = "force-dynamic";

const PERIODOS = [7, 30, 90];

const VISTAS = [
  { valor: "clientes", etiqueta: "Clientes", href: "/crm-dropshippers/direccion" },
  { valor: "equipo", etiqueta: "Equipo", href: "/crm-dropshippers/direccion?vista=equipo" },
] as const;

/**
 * CRM › Dirección (módulo `crm-direccion`). Dos vistas:
 *  - Clientes (30 oct 2026, fase 1): la salud de cada dropshipper con cuenta de Dropi en el país, la cola «Qué atender hoy» y los pedidos
 *    por semana.
 *  - Equipo (`?vista=equipo`, fase 2): cómo responde cada persona, qué tiene esperando, sus tareas y su cartera.
 * Solo lo ve Dirección: los chats y las pantallas de Comercial y Atención no cambian.
 */
export default async function DireccionCrmPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo(MODULO_DIRECCION);
  const { vista: vistaParam, dias: diasParam } = await searchParams;
  const vista = vistaParam === "equipo" ? "equipo" : "clientes";
  const dias = PERIODOS.includes(Number(diasParam)) ? Number(diasParam) : 30;
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const datos = await cargarDireccion(supabase, pais.id);
  const equipo = vista === "equipo" && !("error" in datos) ? await cargarEquipo(supabase, dias, datos.filas) : null;
  const error = "error" in datos ? datos.error : equipo && "error" in equipo ? equipo.error : null;

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Dirección" oculto>
        La salud de la cartera, a quién atender hoy y cómo trabaja el equipo.
      </EncabezadoPagina>
      <nav aria-label="Vistas de Dirección" className="flex gap-1 border-b border-border">
        {VISTAS.map((v) => (
          <Link
            key={v.valor}
            href={v.href}
            aria-current={vista === v.valor ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${vista === v.valor ? "border-primario font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"} ${anilloFoco}`}
          >
            {v.etiqueta}
          </Link>
        ))}
      </nav>
      {error ? (
        <p role="alert" className="m-0 rounded-lg border border-warning bg-warning-soft px-4 py-3 text-sm text-warning">
          {error}
        </p>
      ) : vista === "equipo" && equipo && !("error" in equipo) ? (
        <VistaEquipo datos={equipo} periodos={PERIODOS} codigoPais={pais.codigo} />
      ) : (
        !("error" in datos) && <PanelDireccion datos={datos} codigoPais={pais.codigo} escribe={accesoCrm(usuario).escribeDireccion} usuarioId={usuario.id} />
      )}
    </Pagina>
  );
}
