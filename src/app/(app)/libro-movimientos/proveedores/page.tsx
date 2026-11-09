import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { Pagina } from "@/components/ui/pagina";
import { ultimaActualizacionLibro } from "@/lib/af4/cargar-contexto";
import { mesEnCursoPanama, sumarMeses } from "@/lib/af4/fecha";
import { dineroKpi, entero, porcentaje } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { leerMovimientosCalidad, leerProveedores } from "@/lib/finanzas/cargar-calidad";
import { proveedorCrudo, sugerirUnificaciones } from "@/lib/finanzas/proveedores";
import { validarRucDv } from "@/lib/finanzas/ruc-panama";
import { createServiceClient } from "@/lib/supabase/server";
import { VistaProveedores, type FilaProveedor, type NombreSinProveedor } from "./vista-proveedores";

export const metadata = { title: "Proveedores" };

export const dynamic = "force-dynamic";

/**
 * Catálogo único de proveedores: los del catálogo con sus alias y su gasto de los últimos 12 meses, los nombres del libro
 * que todavía no son de ningún proveedor y las sugerencias para unificarlos.
 */
export default async function ProveedoresPage() {
  const usuario = await requireModulo("libro-movimientos");
  const supabase = createServiceClient();
  const desde = sumarMeses(mesEnCursoPanama(), -11);
  const [prov, actualizado, permitidas] = await Promise.all([leerProveedores(supabase), ultimaActualizacionLibro(supabase), cargarTiendasPermitidas()]);
  if (prov.falta) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Proveedores" imprimir={false} />
        <EstadoVacioAF4 titulo="Falta el catálogo de proveedores">Correr la migración 0925 en Supabase.</EstadoVacioAF4>
      </Pagina>
    );
  }
  // Permisos por tienda (mejora 99): el gasto sale solo de los movimientos de sus tiendas.
  const movs = await leerMovimientosCalidad(supabase, desde, prov.catalogo, permitidas);
  if ("error" in movs) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Proveedores" imprimir={false} />
        <EstadoVacioAF4 titulo="No se pudo leer el libro">{movs.error}</EstadoVacioAF4>
      </Pagina>
    );
  }
  const vivos = movs.filter((m) => !m.anulado);
  const porProveedor = new Map<string, { veces: number; monto: number }>();
  const sinProveedor = new Map<string, { veces: number; monto: number; ejemplo: string }>();
  for (const m of vivos) {
    if (m.proveedor_id) {
      const x = porProveedor.get(m.proveedor_id) ?? { veces: 0, monto: 0 };
      x.veces++;
      x.monto += Math.abs(m.monto);
      porProveedor.set(m.proveedor_id, x);
      continue;
    }
    const nombre = proveedorCrudo(m.descripcion);
    if (!nombre) continue;
    const x = sinProveedor.get(nombre) ?? { veces: 0, monto: 0, ejemplo: m.descripcion };
    x.veces++;
    x.monto += Math.abs(m.monto);
    sinProveedor.set(nombre, x);
  }
  const filas: FilaProveedor[] = prov.proveedores.map((p) => {
    const v = p.ruc ? validarRucDv(p.ruc, p.dv ?? "") : null;
    const g = porProveedor.get(p.id) ?? { veces: 0, monto: 0 };
    return {
      id: p.id,
      nombre: p.nombre,
      ruc: p.ruc,
      dv: p.dv,
      rucValido: v ? !v.error : null,
      activo: p.activo,
      alias: prov.alias.filter((a) => a.proveedor_id === p.id).map((a) => ({ id: a.id, alias: a.alias })),
      veces: g.veces,
      monto: Math.round(g.monto * 100) / 100,
    };
  });
  const nombres: NombreSinProveedor[] = [...sinProveedor]
    .map(([nombre, x]) => ({ nombre, veces: x.veces, monto: Math.round(x.monto * 100) / 100, ejemplo: x.ejemplo }))
    .sort((a, b) => b.monto - a.monto)
    .slice(0, 400);
  const grupos = sugerirUnificaciones(nombres)
    .slice(0, 40)
    .map((g) => ({ ...g, existente: prov.proveedores.find((p) => p.nombre.toUpperCase() === g.canonico.toUpperCase())?.id ?? null }));
  const total = vivos.reduce((s, m) => s + Math.abs(m.monto), 0);
  const conProveedor = vivos.filter((m) => m.proveedor_id).reduce((s, m) => s + Math.abs(m.monto), 0);

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Proveedores" actualizado={actualizado} imprimir={false} />
      <FilaKpiAF4>
        <KpiAF4 titulo="Proveedores" valor={entero(filas.filter((f) => f.activo).length)} subtexto={`${entero(prov.alias.length)} alias`} />
        <KpiAF4 titulo="Monto con proveedor" valor={porcentaje(total ? (100 * conProveedor) / total : 0, { decimales: 0 })} subtexto={`${dineroKpi(conProveedor)} de ${dineroKpi(total)} · 12 meses`} />
        <KpiAF4 titulo="Sugerencias de unificación" tono={grupos.length ? "warning" : "success"} valor={entero(grupos.length)} />
      </FilaKpiAF4>
      <VistaProveedores proveedores={filas} nombres={nombres} grupos={grupos} puedeEscribir={!usuario.modulosSoloLectura.includes("libro-movimientos")} />
    </Pagina>
  );
}
