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
import { cargarDuplicados, cargarEntregas, cargarSecuenciaAlta } from "./datos-fase4";
import { cargarProductos } from "./datos-productos";
import { PanelDireccion } from "./panel-direccion";
import { VistaAutomatizaciones } from "./vista-automatizaciones";
import { VistaDuplicados } from "./vista-duplicados";
import { VistaEntregas } from "./vista-entregas";
import { VistaEquipo } from "./vista-equipo";
import { VistaProductos } from "./vista-productos";

export const metadata = { title: "Dirección" };

export const dynamic = "force-dynamic";

const PERIODOS_EQUIPO = [7, 30, 90];
const PERIODOS_ENTREGAS = [30, 60, 90];

const VISTAS = [
  { valor: "clientes", etiqueta: "Clientes" },
  { valor: "productos", etiqueta: "Productos" },
  { valor: "entregas", etiqueta: "Entregas" },
  { valor: "equipo", etiqueta: "Equipo" },
  { valor: "duplicados", etiqueta: "Duplicados" },
  { valor: "automatizaciones", etiqueta: "Automatizaciones" },
] as const;
type Vista = (typeof VISTAS)[number]["valor"];

/**
 * CRM › Dirección (módulo `crm-direccion`). Vistas:
 *  - Clientes (30 oct 2026, fase 1): la salud de cada dropshipper con cuenta de Dropi en el país, la cola «Qué atender hoy» y los pedidos
 *    por semana; al abrir un cliente, lo que vende con su stock y qué recomendarle (fase 3), y la lista del segmento para una difusión.
 *  - Productos (fase 3): lo que vende la cartera con stock, días de stock, lo que viene en camino y quién lo vende.
 *  - Entregas (fase 4): qué parte se entrega, por transportadora y por dropshipper.
 *  - Equipo (fase 2): cómo responde cada persona, qué tiene esperando, sus tareas y su cartera.
 *  - Duplicados (fase 4): los dropshippers que parecen la misma persona.
 *  - Automatizaciones (fase 4): el interruptor de la secuencia de alta (empieza apagada).
 * Solo lo ve Dirección: los chats y las pantallas de Comercial y Atención no cambian, y no se envía nada desde aquí.
 */
export default async function DireccionCrmPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo(MODULO_DIRECCION);
  const { vista: vistaParam, dias: diasParam } = await searchParams;
  const vista: Vista = VISTAS.some((v) => v.valor === vistaParam) ? (vistaParam as Vista) : "clientes";
  const periodos = vista === "entregas" ? PERIODOS_ENTREGAS : PERIODOS_EQUIPO;
  const dias = periodos.includes(Number(diasParam)) ? Number(diasParam) : vista === "entregas" ? 60 : 30;
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const datos = await cargarDireccion(supabase, pais.id);
  const ok = !("error" in datos);
  const filas = ok ? datos.filas : [];
  const [equipo, productos, entregas, duplicados, secuencia] = await Promise.all([
    vista === "equipo" && ok ? cargarEquipo(supabase, dias, filas) : null,
    (vista === "clientes" || vista === "productos") && ok ? cargarProductos(supabase, pais.id, usuario, filas.map((f) => f.id)) : null,
    vista === "entregas" ? cargarEntregas(supabase, pais.id, dias) : null,
    vista === "duplicados" ? cargarDuplicados(supabase) : null,
    vista === "automatizaciones" ? cargarSecuenciaAlta(supabase) : null,
  ]);
  const errorDe = (x: unknown) => (x && typeof x === "object" && "error" in x ? String((x as { error: string }).error) : null);
  const error =
    errorDe(datos) ?? errorDe(equipo) ?? errorDe(entregas) ?? errorDe(secuencia) ?? (vista === "productos" ? errorDe(productos) : null);
  const escribe = accesoCrm(usuario).escribeDireccion;

  function contenido() {
    if (!ok) return null;
    if (vista === "equipo" && equipo && !("error" in equipo)) return <VistaEquipo datos={equipo} periodos={PERIODOS_EQUIPO} codigoPais={pais.codigo} />;
    if (vista === "productos" && productos && !("error" in productos)) return <VistaProductos datos={productos} clientes={filas} codigoPais={pais.codigo} />;
    if (vista === "entregas" && Array.isArray(entregas)) return <VistaEntregas filas={entregas} clientes={filas} dias={dias} periodos={PERIODOS_ENTREGAS} codigoPais={pais.codigo} />;
    if (vista === "duplicados" && duplicados) return <VistaDuplicados datos={duplicados} />;
    if (vista === "automatizaciones" && secuencia && !("error" in secuencia)) return <VistaAutomatizaciones datos={secuencia} personas={ok ? datos.personas : []} escribe={escribe} />;
    if (vista === "clientes" && ok)
      return <PanelDireccion datos={datos} productos={productos && !("error" in productos) ? productos : null} codigoPais={pais.codigo} escribe={escribe} usuarioId={usuario.id} />;
    return null;
  }

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Dirección" oculto>
        La salud de la cartera, a quién atender hoy, qué se vende, cómo se entrega y cómo trabaja el equipo.
      </EncabezadoPagina>
      <nav aria-label="Vistas de Dirección" className="flex gap-1 overflow-x-auto border-b border-border">
        {VISTAS.map((v) => (
          <Link
            key={v.valor}
            href={v.valor === "clientes" ? "/crm-dropshippers/direccion" : `/crm-dropshippers/direccion?vista=${v.valor}`}
            aria-current={vista === v.valor ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap ${vista === v.valor ? "border-primario font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"} ${anilloFoco}`}
          >
            {v.etiqueta}
          </Link>
        ))}
      </nav>
      {error ? (
        <p role="alert" className="m-0 rounded-lg border border-warning bg-warning-soft px-4 py-3 text-sm text-warning">
          {error}
        </p>
      ) : (
        contenido()
      )}
    </Pagina>
  );
}
