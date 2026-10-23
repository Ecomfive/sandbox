import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { requireModulo } from "@/lib/auth";
import { esAdministrador } from "@/lib/permisos/acceso";
import { getPaisActual } from "@/lib/pais";
import { cargarProductos } from "./datos-producto";
import { TablaProducto } from "./tabla-producto";

export const metadata = { title: "Producto" };

export const dynamic = "force-dynamic";

/**
 * Producto: aquí se crea todo lo que se vende. Un producto es simple o compuesto (una combinación de simples: al venderlo se
 * descuenta cada componente) y físico o test (se está probando, todavía no se compra y no tiene stock). Su SKU es la llave
 * con la que una venta de Dropi o de Shopify lo encuentra. Todos se ven en Inventario.
 */
export default async function ProductoPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  // Desde la ficha de una publicación de Dropi (y otras) se llega con `?abrir=<producto>`: abre su ficha al cargar.
  const { abrir } = await searchParams;
  const usuario = await requireModulo("producto");
  const supabase = createServiceClient();
  // El producto es igual para todos los países; el país solo da formato a las fechas de su actividad.
  const pais = await getPaisActual(supabase);

  const { filas, opcionesSimples, referenciasTest } = await cargarProductos(usuario, supabase);

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Producto" oculto />

      <TablaProducto
        productos={[...filas].sort((a, b) => (b.numero ?? 0) - (a.numero ?? 0))}
        opcionesSimples={opcionesSimples}
        codigoPais={pais.codigo}
        abrirInicial={typeof abrir === "string" ? abrir : null}
        puedeEscribir={!usuario.modulosSoloLectura.includes("producto")}
        puedeEliminar={!usuario.modulosSoloLectura.includes("producto") && esAdministrador(usuario)}
        referenciasTest={referenciasTest}
      />
    </Pagina>
  );
}
