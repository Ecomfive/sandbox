import Link from "next/link";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { irAlInicio } from "@/lib/auth";
import { hoyPanama } from "@/lib/af4/fecha";
import { DIAS_LISTA_LLEGADAS, EVENTO_DE_TIPO, desdeDeLista, diasDeLista } from "@/lib/compras/llegadas-avisos";
import { cargarFilasDeLlegadas, destinatariosDe } from "@/lib/compras/llegadas-servidor";
import { esAdministrador } from "@/lib/permisos/acceso";
import { direccionesDeEtiquetas, type EtiquetaPedido } from "@/lib/proveedor/etiquetas-datos";
import { createServiceClient } from "@/lib/supabase/server";
import { requireSesion } from "../ayuda/datos-ayuda";
import { sinAccesoACompras } from "../compras/acceso-compras";
import { ListaLlegadas } from "./lista-llegadas";

export const metadata = { title: "Llegadas a puerto" };

export const dynamic = "force-dynamic";

const textoPeriodo = (dias: number) => (dias === 1 ? "Hoy" : `Últimos ${dias} días`);
const claseOpcion = (activa: boolean) =>
  `rounded-md border px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
    activa ? "border-transparent bg-foreground text-background" : "border-border bg-card text-foreground hover:bg-muted"
  }`;

/**
 * Lo que llegó a puerto, en una sola lista (17 nov 2026, pedido de Logística: ver de una vez los productos, unidades, cajas y etiquetas, no un aviso por compra). Es lo que abre «Ver lista» del aviso
 * de Llegada a Puerto. La abre quien recibe ese aviso, un administrador o quien tiene Compras (con el país y el alcance de sus compras). `?dias=1|7|30|90`. El pago de En Bodega sigue en su propia llegada.
 */
export default async function LlegadasPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const sp = await searchParams;
  const usuario = await requireSesion();
  const supabase = createServiceClient();
  const admin = esAdministrador(usuario);
  const conCompras = usuario.modulos.includes("compras");
  const esDestino = (await destinatariosDe(supabase, EVENTO_DE_TIPO.puerto)).includes(usuario.id);
  if (!esDestino && !admin && !conCompras) irAlInicio(usuario);

  const dias = diasDeLista(sp.dias);
  const filas = await cargarFilasDeLlegadas(supabase, "puerto", desdeDeLista(hoyPanama(), dias));
  if (!esDestino && !admin) {
    const sinAcceso = await sinAccesoACompras(filas.map((f) => f.compraId), usuario);
    if (sinAcceso) irAlInicio(usuario);
  }

  const rutas = [...new Set(filas.flatMap((f) => f.etiquetasRutas))];
  const firmadas = rutas.length ? await direccionesDeEtiquetas(supabase, rutas) : [];
  const porRuta = new Map(firmadas.map((e) => [e.ruta, e]));
  const etiquetas: Record<string, EtiquetaPedido[]> = {};
  for (const f of filas) etiquetas[f.compraId] = f.etiquetasRutas.flatMap((r) => (porRuta.get(r) ? [porRuta.get(r)!] : []));

  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Llegadas a puerto" oculto />
      <nav aria-label="Periodo" className="flex flex-wrap gap-2">
        {DIAS_LISTA_LLEGADAS.map((d) => (
          <Link key={d} href={`/llegadas?tipo=puerto&dias=${d}`} aria-current={d === dias ? "page" : undefined} className={claseOpcion(d === dias)}>
            {textoPeriodo(d)}
          </Link>
        ))}
      </nav>
      <ListaLlegadas filas={filas} etiquetas={etiquetas} periodo={textoPeriodo(dias)} />
    </Pagina>
  );
}
