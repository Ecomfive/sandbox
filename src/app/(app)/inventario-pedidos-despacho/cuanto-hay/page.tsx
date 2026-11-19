import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { PreguntarCuantoHay } from "@/components/cuanto-hay/preguntar";
import { requireModulo } from "@/lib/auth";
import { cargarPreguntasDeTienda, cargarTiendasCuantoHay } from "@/lib/cuanto-hay/datos";
import { PROVEEDURIA, tiendasDePersona } from "@/lib/cuanto-hay/reglas";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { createServiceClient } from "@/lib/supabase/server";
import { obtenerOpcionesSkuMaestro } from "@/lib/wms/skus-maestros";

export const metadata = { title: "Preguntar cuánto hay" };

export const dynamic = "force-dynamic";

/**
 * Comunicación despacho › Cuánto hay (antes en Pedidos de tienda; se movió el 19 nov 2026, pedido de Hernán). Preguntar cuánto hay (16 nov 2026, migración 0302; prototipo aprobado: https://claude.ai/artifact/BK449CDGnYApU2eQ9BqvxL).
 * La tienda elige un producto del catálogo, escribe una nota si quiere y pregunta; Yiletsi manda a contar a despacho y responde con la cantidad.
 */
export default async function PreguntarCuantoHayPage() {
  const usuario = await requireModulo("tienda-cuanto-hay");
  const supabase = createServiceClient();
  const [todas, permitidas, opciones] = await Promise.all([cargarTiendasCuantoHay(supabase), cargarTiendasPermitidas(), obtenerOpcionesSkuMaestro(supabase)]);
  // Quien ve toda la empresa también pregunta para Proveeduría (sin tienda; 19 nov 2026, migración 0336), y va primero.
  const tiendas = [...(permitidas === null ? [PROVEEDURIA] : []), ...tiendasDePersona(todas, permitidas, (t) => t.unidadId)];
  const { preguntas, faltaMigracion } = await cargarPreguntasDeTienda(supabase, usuario.id, todas);
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-4">
      <EncabezadoPagina titulo="Preguntar cuánto hay" oculto>
        Elige el producto y pregunta: Yiletsi lo manda a contar a despacho y te responde con la cantidad (te llega en «Para ti»).
      </EncabezadoPagina>
      {faltaMigracion ? (
        <p role="alert" className="m-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          Falta correr en Supabase la migración 0302 («¿Cuánto hay?»).
        </p>
      ) : (
        <PreguntarCuantoHay
          tiendas={tiendas.map((t) => ({ id: t.id, nombre: t.nombre }))}
          opciones={opciones.filter((o) => !o.compuesto)}
          preguntas={preguntas}
          puedePreguntar={!usuario.modulosSoloLectura.includes("tienda-cuanto-hay")}
          verTienda={tiendas.length > 1}
        />
      )}
    </Pagina>
  );
}
