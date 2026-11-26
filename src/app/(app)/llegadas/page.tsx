import Link from "next/link";
import { AvisosVistos } from "@/components/avisos-vistos";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { irAlInicio } from "@/lib/auth";
import { hoyPanama } from "@/lib/af4/fecha";
import { DIAS_LISTA_LLEGADAS, desdeDeLista, diasDeLista, filaSinMontos, pendientesDeRecibir, yaArchivadas } from "@/lib/compras/llegadas-avisos";
import { cargarFilasDeLlegadas, hayArchivoDeLlegadas } from "@/lib/compras/llegadas-servidor";
import { direccionesDeEtiquetas, type EtiquetaPedido } from "@/lib/proveedor/etiquetas-datos";
import { createServiceClient } from "@/lib/supabase/server";
import { requireSesion } from "../ayuda/datos-ayuda";
import { accesoAPuerto, motivoSinAccesoAPuerto } from "./acceso-llegadas";
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
 * de Llegada a Puerto y, desde el 20 nov 2026, la entrada «Llegadas a puerto» de Fulfillment (módulo `llegadas`). La abre quien tiene ese módulo o recibe el aviso, un administrador o quien
 * tiene Compras (con el país y el alcance de sus compras). `?dias=1|7|30|90`. El pago de En Bodega sigue en su propia llegada.
 */
export default async function LlegadasPage({ searchParams }: { searchParams: Promise<{ dias?: string; vista?: string }> }) {
  const sp = await searchParams;
  const usuario = await requireSesion();
  const supabase = createServiceClient();
  const acceso = await accesoAPuerto(supabase, usuario);
  if (!acceso.ve) irAlInicio(usuario);

  const dias = diasDeLista(sp.dias);
  const todas = await cargarFilasDeLlegadas(supabase, "puerto", desdeDeLista(hoyPanama(), dias));
  if (!acceso.esDestino && !acceso.admin) {
    const sinAcceso = await motivoSinAccesoAPuerto(supabase, usuario, todas.map((f) => f.compraId));
    if (sinAcceso) irAlInicio(usuario);
  }
  const sinArchivo = acceso.puedeArchivar ? !(await hayArchivoDeLlegadas(supabase)) : false;
  const vista = sp.vista === "archivadas" ? "archivadas" : "pendientes";
  const pendientes = pendientesDeRecibir(todas);
  const archivadas = yaArchivadas(todas);
  const filas = vista === "archivadas" ? archivadas : pendientes;

  const rutas = [...new Set(filas.flatMap((f) => f.etiquetasRutas))];
  const firmadas = rutas.length ? await direccionesDeEtiquetas(supabase, rutas) : [];
  const porRuta = new Map(firmadas.map((e) => [e.ruta, e]));
  const etiquetas: Record<string, EtiquetaPedido[]> = {};
  for (const f of filas) etiquetas[f.compraId] = f.etiquetasRutas.flatMap((r) => (porRuta.get(r) ? [porRuta.get(r)!] : []));

  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Llegadas a puerto" oculto />
      <AvisosVistos seccion="llegadas" />
      <nav aria-label="Periodo" className="flex flex-wrap gap-2">
        {DIAS_LISTA_LLEGADAS.map((d) => (
          <Link key={d} href={`/llegadas?tipo=puerto&dias=${d}${vista === "archivadas" ? "&vista=archivadas" : ""}`} aria-current={d === dias ? "page" : undefined} className={claseOpcion(d === dias)}>
            {textoPeriodo(d)}
          </Link>
        ))}
      </nav>
      {/* La lista no muestra montos: no se mandan a la pantalla (auditoría de seguridad, 18 nov 2026). */}
      <ListaLlegadas
        filas={filas.map(filaSinMontos)}
        etiquetas={etiquetas}
        periodo={textoPeriodo(dias)}
        vista={vista}
        conteos={{ pendientes: pendientes.length, archivadas: archivadas.length }}
        hrefVista={{ pendientes: `/llegadas?tipo=puerto&dias=${dias}`, archivadas: `/llegadas?tipo=puerto&dias=${dias}&vista=archivadas` }}
        puedeArchivar={acceso.puedeArchivar}
        sinArchivo={sinArchivo}
      />
    </Pagina>
  );
}
