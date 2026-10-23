import { headers } from "next/headers";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requirePestana } from "@/lib/auth";
import { puedeVerPais } from "@/lib/paises-permitidos";
import { esAdministrador } from "@/lib/permisos/acceso";
import { cargarEspejo } from "@/lib/proveedor/datos";
import { conFotosDeCompras } from "@/lib/proveedor/fotos-pedidos";
import { estadoPagos } from "@/lib/proveedor/pagos-servidor";
import { BUCKET_PROVEEDOR } from "@/lib/proveedor/rutas";
import { traducirTextos } from "@/lib/proveedor/traducir";
import { cargarTareasChin } from "@/lib/proveedor/tareas-datos";
import { cargarRegistro } from "@/lib/proveedor/registro-datos";
import { createServiceClient } from "@/lib/supabase/server";
import { campoOculto, restriccionesDe } from "../permisos-compras";
import type { CuentaPortal } from "./cuenta-proveedor";
import { QueHacerChin } from "./que-hacer-chin";
import { TableroChin } from "./tablero-chin";

export const metadata = { title: "Tablero de Chin · Compras" };

export const dynamic = "force-dynamic";

/**
 * Compras › Tablero de Chin (22 oct 2026; reemplaza a la página «Portal del proveedor»): el portal de Chin tal como lo ve él, en español
 * y solo para ver; «Pagos a Chin» (avisar un pago y lo que falta pagar) y, para un administrador, las cuentas con las que Chin entra (verlas y crear una).
 * Decidir una cotización o marcar una llegada se hace en la compra, cambiando su etapa. Lee el espejo (`proveedor_pedidos`).
 */
export default async function TableroChinPage({ searchParams }: { searchParams: Promise<{ ver?: string | string[] }> }) {
  const usuario = await requirePestana("compras", "tablero-chin");
  const { ver } = await searchParams;
  const supabase = createServiceClient();

  const { data: proveedor, error: errorProveedor } = await supabase.from("proveedores").select("id").eq("activo", true).order("creado_en").limit(1).maybeSingle();
  const espejo = proveedor ? await cargarEspejo(supabase, proveedor.id as string) : null;
  if (errorProveedor || !espejo || "error" in espejo) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Tablero de Chin" oculto />
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          {espejo && "error" in espejo ? espejo.error : "No se pudo cargar el tablero de Chin."}
        </p>
      </Pagina>
    );
  }

  // Las fotos como las ve Chin: la comercial de referencia y, como real, la que subió él (enlaces de una hora) o la de la compra.
  const { pedidos, realDeCompra } = await conFotosDeCompras(
    supabase,
    espejo.pedidos.filter((p) => puedeVerPais(usuario.paisesPermitidos, p.paisCodigo)),
  );
  const activos = pedidos.filter((p) => p.etapa === "por_cotizar" || p.etapa === "cotizado" || p.etapa === "produccion" || p.etapa === "enviado");
  const fotosReales: Record<string, string> = {};
  for (const p of activos) if (realDeCompra[p.id]) fotosReales[p.id] = realDeCompra[p.id];
  const rutas = activos.map((p) => p.fotoRealRuta).filter((r): r is string => !!r);

  // Pagos: quien no ve los montos de Compras tampoco ve los pagos a Chin.
  const veMontos = !campoOculto(restriccionesDe(usuario.afinado.compras), "monto");
  const admin = esAdministrador(usuario);
  const [firmadas, estado, { data: nuevasParaChin }, { data: filasCuentas }, chin] = await Promise.all([
    rutas.length ? supabase.storage.from(BUCKET_PROVEEDOR).createSignedUrls(rutas, 3600).then((r) => r.data ?? []) : Promise.resolve([]),
    veMontos ? estadoPagos(supabase, { ...espejo, pedidos }) : Promise.resolve(null),
    supabase.from("proveedor_novedades").select("id, texto, creado_en").eq("proveedor_id", espejo.proveedor.id).eq("lado", "ecomfive").is("leida_en", null).order("creado_en", { ascending: false }).limit(20),
    supabase.from("proveedor_usuarios").select("id, nombre, email, activo, ultimo_ingreso_en").eq("proveedor_id", espejo.proveedor.id).order("creado_en"),
    cargarTareasChin(supabase, { paisesPermitidos: usuario.paisesPermitidos, veMontos }),
  ]);
  const porRuta = new Map(firmadas.map((f) => [f.path, f.signedUrl]));
  for (const p of activos) if (p.fotoRealRuta && porRuta.get(p.fotoRealRuta)) fotosReales[p.id] = porRuta.get(p.fotoRealRuta)!;

  // El Registro de pagos de Chin, solo de los países que la persona ve.
  const pagos =
    !estado || "error" in estado
      ? null
      : {
          resumen: estado.resumen,
          vencidas: estado.porPagar.filter((c) => c.estado.tono === "peligro").length,
          filas: (await cargarRegistro(supabase, espejo.proveedor.id, estado)).filter((f) => puedeVerPais(usuario.paisesPermitidos, f.paisCodigo)),
          // Cambiar celdas pide modificar Compras (ver los montos ya se pidió para tener `pagos`).
          editable: !usuario.modulosSoloLectura.includes("compras"),
        };

  // Lo que escribe Chin (comentarios de cotización), traducido al español.
  const traducciones = await traducirTextos(supabase, activos.map((p) => p.comentarioProveedor), "es");

  // Las cuentas del proveedor solo las ve (y las crea y administra) un administrador.
  const filaCuenta = filasCuentas?.[0];
  let cuentaPortal: { cuentas: CuentaPortal[]; entrada: string } | null = null;
  if (admin) {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const entrada = host ? `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}/login` : "/login";
    const cuentas = (filasCuentas ?? []).map((c) => ({
      id: c.id as string,
      nombre: c.nombre as string,
      email: (c.email as string | null) ?? null,
      activo: !!c.activo,
      ultimoIngreso: (c.ultimo_ingreso_en as string | null) ?? null,
    }));
    cuentaPortal = { cuentas, entrada };
  }

  const tablero = {
    cuenta: { nombre: (filaCuenta?.nombre as string | undefined) ?? espejo.proveedor.nombre, proveedor: espejo.proveedor.nombre, diasAnticipo: espejo.proveedor.diasAnticipo },
    pedidos: activos,
    plazos: espejo.plazos,
    fotosReales,
    avisos: (nuevasParaChin ?? []).map((a) => ({ id: a.id as string, texto: a.texto as string, creadoEn: a.creado_en as string })),
    pagos: pagos ? { resumen: pagos.resumen, filas: pagos.filas } : null,
    traducciones,
  };

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Tablero de Chin" oculto />
      {chin && <QueHacerChin proveedor={chin.proveedor} tareas={chin.tareas} />}
      <TableroChin
        proveedor={{ id: espejo.proveedor.id, nombre: espejo.proveedor.nombre }}
        tablero={tablero}
        pagos={pagos}
        traducciones={traducciones}
        cuentaPortal={cuentaPortal}
        vistaInicial={ver === "pagos" && pagos ? "pagos" : "tablero"}
      />
    </Pagina>
  );
}
