import { after } from "next/server";
import { BarraTienda, FaltaMigracionTienda, SinTiendas } from "@/components/tienda/barra-tienda";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { tiendasVisibles } from "@/lib/confirmacion-ia/acceso";
import { analizarPendientes, cargarAnalisis, cargarConfig, SIN_MIGRACION_CONFIRMACION } from "@/lib/confirmacion-ia/servidor";
import { getPaisActual } from "@/lib/pais";
import { esAdministrador } from "@/lib/permisos/acceso";
import { proveedoresConectados } from "@/lib/publicaciones/ia/proveedor";
import { createServiceClient } from "@/lib/supabase/server";
import { tiendaElegida } from "@/lib/tienda/datos";
import { contarEjemplos, listarMetodosPago, listarPalabrasZona } from "../ia-actions";
import { ConfirmacionIA } from "./confirmacion-ia";

export const metadata = { title: "Confirmación con IA" };

export const dynamic = "force-dynamic";
// Al abrirla se analizan (después de mostrar la página) los confirmados que se hayan quedado sin analizar: dos IA por pedido.
export const maxDuration = 120;

/** La hora de ahora, para «hace cuánto» (se calcula una vez en el servidor). */
const ahoraMismo = () => Date.now();

/**
 * Gestión de tienda › Confirmación › Con IA (16 nov 2026, pedido de Hernán): cuando iComfly deja un pedido «Confirmada», el sistema analiza su dirección con ChatGPT y Claude, propone la
 * etiqueta de zona (CIUDAD o INTERIOR/SERVIENTREGA en Panamá) y, si falta un dato, se lo pide al cliente por WhatsApp. Por ahora solo propone: no cambia etiquetas en Shopify.
 * Un país sin tiendas todavía (Costa Rica, 19 nov 2026, pedido de Jhokser) también abre: se dejan listos los ejemplos, las palabras de zona y las pruebas de direcciones para cuando se conecte la primera tienda.
 */
export default async function ConfirmacionIAPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("tienda-confirmacion");
  const sp = await searchParams;
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { tiendas, limitado, faltaMigracion } = await tiendasVisibles(supabase, pais.id);
  const tienda = tiendaElegida(tiendas, sp.tienda);
  const { config, faltaMigracion: sinTablas } = await cargarConfig(supabase, pais.id);
  const ids = tienda ? [tienda.id] : limitado ? tiendas.map((t) => t.id) : null;
  const [{ filas }, totalEjemplos, { palabras }, { metodos: metodosPago }] = sinTablas
    ? [{ filas: [] }, 0, { palabras: [] }, { metodos: [] }]
    : await Promise.all([cargarAnalisis(supabase, pais.id, ids, config), contarEjemplos(), listarPalabrasZona(), listarMetodosPago()]);
  if (config.activa) after(() => analizarPendientes(createServiceClient(), pais.id, 5));
  const ahora = ahoraMismo();

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-5">
      <EncabezadoPagina titulo="Confirmación con IA" oculto>
        Analiza la dirección de los pedidos que iComfly deja confirmados y propone si van por ciudad o por interior. Aquí mismo se le enseña con ejemplos y palabras de zona.
      </EncabezadoPagina>
      {faltaMigracion ? (
        <FaltaMigracionTienda />
      ) : sinTablas ? (
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          {SIN_MIGRACION_CONFIRMACION}
        </p>
      ) : !tiendas.length && limitado ? (
        <SinTiendas pais={pais.nombre} />
      ) : (
        <>
          {tiendas.length > 1 && <BarraTienda ruta="/tienda-pedidos/confirmacion/ia" tiendas={tiendas} tiendaId={tienda?.id ?? null} />}
          <ConfirmacionIA
            config={config}
            paisNombre={pais.nombre}
            paisCodigo={pais.codigo}
            etiquetasTexto={config.etiquetaCiudad || config.etiquetaInterior ? [config.etiquetaCiudad, config.etiquetaInterior].filter(Boolean).join(" · ") : null}
            esAdmin={esAdministrador(usuario)}
            puedeEscribir={!usuario.modulosSoloLectura.includes("tienda-confirmacion")}
            filas={filas}
            tiendas={tiendas.map((t) => ({ id: t.id, nombre: t.nombre }))}
            tiendaElegida={tienda?.id ?? null}
            ahora={ahora}
            apagadaPorFaltaDeIA={proveedoresConectados().length === 0}
            ejemplos={{ total: totalEjemplos, tiendaObligatoria: limitado }}
            palabras={palabras}
            metodosPago={metodosPago}
            instrucciones={esAdministrador(usuario) ? config.instrucciones : null}
          />
        </>
      )}
    </Pagina>
  );
}
