import Link from "next/link";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { irAlInicio } from "@/lib/auth";
import { hoyPanama } from "@/lib/af4/fecha";
import { DIAS_LISTA_LLEGADAS, EVENTO_DE_TIPO, desdeDeLista, diasDeLista, type TipoLlegada } from "@/lib/compras/llegadas-avisos";
import { cargarFilasDeLlegadas, destinatariosDe } from "@/lib/compras/llegadas-servidor";
import { esAdministrador } from "@/lib/permisos/acceso";
import { direccionesDeEtiquetas, type EtiquetaPedido } from "@/lib/proveedor/etiquetas-datos";
import { createServiceClient } from "@/lib/supabase/server";
import { requireSesion } from "../ayuda/datos-ayuda";
import { sinAccesoACompras } from "../compras/acceso-compras";
import { campoOculto, restriccionesDe } from "../compras/permisos-compras";
import { ListaLlegadas } from "./lista-llegadas";

export const metadata = { title: "Llegadas de compras" };

export const dynamic = "force-dynamic";

const textoPeriodo = (dias: number) => (dias === 1 ? "Hoy" : `Últimos ${dias} días`);
const claseOpcion = (activa: boolean) =>
  `rounded-md border px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
    activa ? "border-transparent bg-foreground text-background" : "border-border bg-card text-foreground hover:bg-muted"
  }`;

/**
 * Todas las llegadas de compras en una sola lista (17 nov 2026, pedido de Logística: ver de una vez lo que llegó a puerto, no un aviso por compra). La abre quien recibe ese aviso, un administrador o
 * quien tiene Compras (con el país y el alcance de sus compras), igual que la página de una llegada. `?tipo=puerto|bodega` y `?dias=1|7|30|90`.
 */
export default async function LlegadasPage({ searchParams }: { searchParams: Promise<{ tipo?: string; dias?: string }> }) {
  const sp = await searchParams;
  const usuario = await requireSesion();
  const supabase = createServiceClient();
  const admin = esAdministrador(usuario);
  const conCompras = usuario.modulos.includes("compras");
  const [destPuerto, destBodega] = await Promise.all([destinatariosDe(supabase, EVENTO_DE_TIPO.puerto), destinatariosDe(supabase, EVENTO_DE_TIPO.bodega)]);
  const esDestino: Record<TipoLlegada, boolean> = { puerto: destPuerto.includes(usuario.id), bodega: destBodega.includes(usuario.id) };
  if (!esDestino.puerto && !esDestino.bodega && !admin && !conCompras) irAlInicio(usuario);

  const tipo: TipoLlegada = sp.tipo === "bodega" ? "bodega" : sp.tipo === "puerto" ? "puerto" : !esDestino.puerto && esDestino.bodega ? "bodega" : "puerto";
  const dias = diasDeLista(sp.dias);
  const filas = await cargarFilasDeLlegadas(supabase, tipo, desdeDeLista(hoyPanama(), dias));
  if (!esDestino[tipo] && !admin) {
    const sinAcceso = await sinAccesoACompras(filas.map((f) => f.compraId), usuario);
    if (sinAcceso) irAlInicio(usuario);
  }
  const verMontos = esDestino[tipo] || admin || (conCompras && !campoOculto(restriccionesDe(usuario.afinado.compras), "pago2"));

  const rutas = tipo === "puerto" ? [...new Set(filas.flatMap((f) => f.etiquetasRutas))] : [];
  const firmadas = rutas.length ? await direccionesDeEtiquetas(supabase, rutas) : [];
  const porRuta = new Map(firmadas.map((e) => [e.ruta, e]));
  const etiquetas: Record<string, EtiquetaPedido[]> = {};
  for (const f of filas) etiquetas[f.compraId] = f.etiquetasRutas.flatMap((r) => (porRuta.get(r) ? [porRuta.get(r)!] : []));

  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Llegadas de compras" oculto />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Tipo de llegada" className="flex gap-2">
          <Link href={`/llegadas?tipo=puerto&dias=${dias}`} aria-current={tipo === "puerto" ? "page" : undefined} className={claseOpcion(tipo === "puerto")}>
            A puerto
          </Link>
          <Link href={`/llegadas?tipo=bodega&dias=${dias}`} aria-current={tipo === "bodega" ? "page" : undefined} className={claseOpcion(tipo === "bodega")}>
            A bodega
          </Link>
        </nav>
        <nav aria-label="Periodo" className="flex flex-wrap gap-2">
          {DIAS_LISTA_LLEGADAS.map((d) => (
            <Link key={d} href={`/llegadas?tipo=${tipo}&dias=${d}`} aria-current={d === dias ? "page" : undefined} className={claseOpcion(d === dias)}>
              {textoPeriodo(d)}
            </Link>
          ))}
        </nav>
      </div>
      <ListaLlegadas tipo={tipo} filas={filas} etiquetas={etiquetas} verMontos={verMontos} periodo={textoPeriodo(dias)} />
    </Pagina>
  );
}
