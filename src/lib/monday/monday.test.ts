import assert from "node:assert/strict";
import test from "node:test";
import { CAUSA_OTRA, causaDeTexto, codigoDeNombre, leerPalabras, pesoCausas, porDimension, resumenPorMes, textosSinCausa, type Causa, type DespachoAnalisis } from "./causas";
import {
  cambioDesde,
  causaDespacho,
  despachoDeItem,
  enlazarOrden,
  errorMonday,
  fechaDeColumna,
  grupoDeEstado,
  leerColumnas,
  leerPagina,
  leerReglasEstado,
  normalizarPedido,
  prioridadDespacho,
  sugerirMapeo,
  unidadDeTexto,
  validarMapeo,
  variantesPedido,
} from "./columnas";

// Respuestas inventadas con la forma de la API GraphQL v2 de Monday.
const COLUMNAS = {
  data: {
    boards: [
      {
        id: "123",
        name: "Despachos",
        columns: [
          { id: "name", title: "Name", type: "name" },
          { id: "texto_pedido", title: "N° Pedido", type: "text" },
          { id: "tienda", title: "Tienda", type: "dropdown" },
          { id: "estado", title: "Estado", type: "status" },
          { id: "motivo", title: "Motivo rechazo", type: "text" },
          { id: "fecha", title: "Fecha despacho", type: "date" },
          { id: "fecha4", title: "Fecha entrega", type: "date" },
          { id: "repartidor", title: "Courier", type: "people" },
          { id: "guia", title: "Remisión", type: "text" },
        ],
      },
    ],
  },
};

const PAGINA = {
  data: {
    boards: [
      {
        items_page: {
          cursor: "MSw5NzI4MDA5MDAsaV9YcmxJb0p1VEdYc1VWeGlxeF9kLDg4MiwzNXw0MTQ1NzU1MTE5",
          items: [
            {
              id: "9001",
              name: "Pedido A",
              updated_at: "2026-10-20T15:00:00Z",
              column_values: [
                { id: "texto_pedido", text: "#1001", value: '"#1001"', type: "text" },
                { id: "tienda", text: "Tienda Uno", value: null, type: "dropdown" },
                { id: "estado", text: "Rechazado", value: '{"index":2}', type: "status" },
                { id: "motivo", text: "cliente no contesta el teléfono", value: null, type: "text" },
                { id: "fecha", text: "2026-10-02", value: '{"date":"2026-10-02","time":null}', type: "date" },
                { id: "fecha4", text: "", value: null, type: "date" },
                { id: "repartidor", text: "Moto Sur", value: null, type: "people" },
                { id: "guia", text: "R-55", value: null, type: "text" },
              ],
            },
          ],
        },
      },
    ],
  },
};

test("columnas del tablero, mapeo sugerido y validado", () => {
  const c = leerColumnas(COLUMNAS)!;
  assert.equal(c.nombre, "Despachos");
  const m = sugerirMapeo(c.columnas);
  assert.equal(m.pedido, "texto_pedido");
  assert.equal(m.estado, "estado");
  assert.equal(m.causa, "motivo");
  assert.equal(m.fecha_despacho, "fecha");
  assert.equal(m.fecha_entrega, "fecha4");
  assert.equal(m.courier, "repartidor");
  assert.equal(m.remision, "guia");
  assert.ok("mapeo" in validarMapeo(m, c.columnas));
  assert.ok("error" in validarMapeo({ ...m, estado: "" }, c.columnas));
  assert.ok("error" in validarMapeo({ ...m, causa: "no_existe" }, c.columnas));
  assert.equal(leerColumnas({ data: { boards: [] } }), null);
});

test("paginación: primera página y siguientes, errores", () => {
  const p = leerPagina(PAGINA);
  assert.equal(p.items.length, 1);
  assert.ok(p.cursor);
  const sig = leerPagina({ data: { next_items_page: { cursor: null, items: [{ id: 9002, name: "B", column_values: [] }] } } });
  assert.equal(sig.cursor, null);
  assert.equal(sig.items[0].id, "9002");
  assert.equal(errorMonday({ errors: [{ message: "Not Authenticated" }] }), "Not Authenticated");
  assert.equal(errorMonday({ error_message: "Rate limit" }), "Rate limit");
  assert.equal(errorMonday(PAGINA), null);
});

test("ítem → despacho con el mapeo, estados y fechas", () => {
  const c = leerColumnas(COLUMNAS)!;
  const d = despachoDeItem(leerPagina(PAGINA).items[0], sugerirMapeo(c.columnas));
  assert.equal(d.numero_pedido, "#1001");
  assert.equal(d.estado_grupo, "rechazado");
  assert.equal(d.fecha_despacho, "2026-10-02");
  assert.equal(d.fecha_entrega, null);
  assert.equal(d.courier, "Moto Sur");
  assert.equal(d.remision, "R-55");
  assert.equal(despachoDeItem(leerPagina(PAGINA).items[0], { pedido: "name", estado: "estado" }).numero_pedido, "Pedido A");
  assert.equal(grupoDeEstado("Entregado ✅"), "entregado");
  assert.equal(grupoDeEstado("Devuelto"), "rechazado");
  assert.equal(grupoDeEstado("Cancelada"), "cancelado");
  assert.equal(grupoDeEstado("En ruta"), "en_ruta");
  assert.equal(grupoDeEstado(""), "sin_estado");
  assert.equal(grupoDeEstado("Listo", leerReglasEstado({ listo: "entregado", malo: "x" })), "entregado");
  assert.equal(fechaDeColumna({ text: "2026-09-01 10:00", value: null }), "2026-09-01");
  assert.equal(fechaDeColumna({ text: "", value: "{mal" }), null);
});

test("lectura incremental y enlace con la orden", () => {
  assert.ok(cambioDesde({ updated_at: "2026-10-20T00:00:00Z" }, null));
  assert.ok(cambioDesde({ updated_at: "2026-10-19T12:00:00Z" }, "2026-10-20T00:00:00Z"));
  assert.ok(!cambioDesde({ updated_at: "2026-10-10T00:00:00Z" }, "2026-10-20T00:00:00Z"));
  assert.equal(normalizarPedido(" #OF-1001 "), "OF1001");
  assert.deepEqual(variantesPedido("#1001"), ["#1001", "1001"]);
  const cand = [
    { id: "a", unidad_id: "u1", numero: "#1001", periodo: "2026-10-01" },
    { id: "b", unidad_id: "u2", numero: "#1001", periodo: "2026-10-01" },
    { id: "c", unidad_id: "u2", numero: "#2002", periodo: "2026-10-01" },
  ];
  assert.equal(enlazarOrden("1001", "u2", cand)?.id, "b");
  assert.equal(enlazarOrden("1001", null, cand), null);
  assert.equal(enlazarOrden("2002", null, cand)?.id, "c");
  const unidades = [{ id: "u1", nombre: "TIENDA UNO" }, { id: "u2", nombre: "OFERFY" }];
  assert.equal(unidadDeTexto("Tienda uno", unidades), "u1");
  assert.equal(unidadDeTexto("Oferfy Panamá", unidades), "u2");
  assert.equal(unidadDeTexto("", unidades), null);
});

const CATALOGO: Causa[] = [
  { codigo: "no_responde", nombre: "No responde", palabras: ["NO CONTESTA", "NO RESPONDE"], orden: 10, activo: true },
  { codigo: "rechaza", nombre: "Rechaza", palabras: ["RECHAZ"], orden: 20, activo: true },
  { codigo: "inactiva", nombre: "Inactiva", palabras: ["CLIENTE"], orden: 1, activo: false },
  { codigo: CAUSA_OTRA, nombre: "Otra", palabras: [], orden: 999, activo: true },
];

test("causas: palabras clave, asignación a mano y otro", () => {
  assert.equal(causaDeTexto("Cliente no contesta el teléfono", CATALOGO, new Map()), "no_responde");
  assert.equal(causaDeTexto("lo rechazó en la puerta", CATALOGO, new Map()), "rechaza");
  assert.equal(causaDeTexto("se mudó", CATALOGO, new Map()), CAUSA_OTRA);
  assert.equal(causaDeTexto("se mudó", CATALOGO, new Map([["SE MUDO", "rechaza"]])), "rechaza");
  assert.equal(causaDeTexto("", CATALOGO, new Map()), null);
  assert.deepEqual(leerPalabras("no contesta, Apagado,, x"), ["NO CONTESTA", "APAGADO"]);
  assert.equal(codigoDeNombre("Cliente de viaje"), "cliente_de_viaje");
});

const d = (p: Partial<DespachoAnalisis>): DespachoAnalisis => ({ periodo: "2026-09-01", unidadId: "u1", tienda: "A", courier: "X", estadoGrupo: "entregado", causa: null, fechaDespacho: "2026-09-05", monto: 50, costoEnvio: 4, ...p });

test("peso de las causas, por tienda y courier, y resumen del mes", () => {
  const lista = [
    d({}),
    d({ estadoGrupo: "rechazado", causa: "no_responde", monto: 30 }),
    d({ estadoGrupo: "rechazado", causa: "no_responde", monto: 10, courier: "Y" }),
    d({ estadoGrupo: "rechazado", causa: "rechaza", monto: 60, tienda: "B", unidadId: "u2" }),
    d({ estadoGrupo: "en_ruta", fechaDespacho: "2026-09-28" }),
    d({ estadoGrupo: "en_ruta", fechaDespacho: "2026-09-02" }),
    d({ estadoGrupo: "cancelado", fechaDespacho: null }),
  ];
  const p = pesoCausas(lista);
  assert.equal(p[0].codigo, "no_responde");
  assert.equal(p[0].pedidos, 2);
  assert.equal(Math.round(p[0].pctDinero), 40);
  assert.equal(p[1].dinero, 60);
  const t = porDimension(lista, "tienda");
  assert.equal(t.find((x) => x.clave === "A")?.despachados, 5);
  assert.equal(t.find((x) => x.clave === "B")?.tasaEntrega, 0);
  assert.equal(porDimension(lista, "courier").find((x) => x.clave === "Y")?.causas.no_responde, 1);
  const r = resumenPorMes(lista, "2026-10-01").get("2026-09-01")!;
  assert.equal(r.despachados, 6);
  assert.equal(r.entregados, 1);
  // El del 28 de septiembre todavía no cumple 10 días al 1 de octubre.
  assert.equal(r.elegibles, 5);
  assert.equal(r.conEstado, 4);
  assert.equal(r.pctConEstado, 80);
  assert.equal(resumenPorMes(lista, "2026-10-01", new Set(["u2"])).get("2026-09-01")?.despachados, 1);
  assert.deepEqual(textosSinCausa([{ texto: "se mudó", codigo: CAUSA_OTRA }, { texto: "Se mudo", codigo: CAUSA_OTRA }, { texto: "x", codigo: "rechaza" }]), [{ texto: "SE MUDO", pedidos: 2 }]);
});

test("tablero de Panamá: la fecha es el grupo («02/11/2026») y el pedido, el nombre del ítem", () => {
  // «DELIVERY REPORTES DIARIOS»: sin columna de fecha; cada grupo es un día.
  const columnas = [
    { id: "tienda", titulo: "Tienda", tipo: "status" },
    { id: "delivery", titulo: "Delivery", tipo: "status" },
    { id: "estado", titulo: "Estado", tipo: "status" },
  ];
  const m = sugerirMapeo(columnas);
  assert.equal(m.pedido, "name");
  assert.equal(m.fecha_despacho, "group");
  assert.ok("mapeo" in validarMapeo({ ...m, estado: "estado" }, columnas));
  const pagina = leerPagina({
    data: { boards: [{ items_page: { cursor: null, items: [{ id: "77", name: "1377", updated_at: "2026-11-02T20:00:00Z", group: { title: "02/11/2026" }, column_values: [{ id: "estado", text: "ENTREGADO", value: null }] }] } }] },
  });
  assert.equal(pagina.items[0].grupo, "02/11/2026");
  const d = despachoDeItem(pagina.items[0], { ...m, estado: "estado" });
  assert.equal(d.numero_pedido, "1377");
  assert.equal(d.fecha_despacho, "2026-11-02");
  assert.equal(d.estado_grupo, "entregado");
  assert.equal(fechaDeColumna({ text: "31/10/2026", value: null }), "2026-10-31");
  assert.equal(fechaDeColumna({ text: "31/02/2026", value: null }), null);
});

test("los tableros de repartidores toman las columnas del consolidado por su título", async () => {
  const { mapeoPorTitulos } = await import("./tableros-extra");
  const principal = [
    { id: "estado_15", titulo: "Estado", tipo: "status" },
    { id: "estado_11", titulo: "Tienda", tipo: "status" },
    { id: "estado_18", titulo: "Delivery", tipo: "status" },
    { id: "texto", titulo: "Comentario", tipo: "text" },
  ];
  const extra = [
    { id: "status", titulo: "ESTADO", tipo: "status" },
    { id: "status_1", titulo: "tienda", tipo: "status" },
    { id: "people", titulo: "Delivery", tipo: "status" },
  ];
  const m = mapeoPorTitulos({ pedido: "name", estado: "estado_15", tienda: "estado_11", courier: "estado_18", causa: "texto", fecha_despacho: "group" }, principal, extra);
  assert.deepEqual(m, { pedido: "name", estado: "status", tienda: "status_1", courier: "people", fecha_despacho: "group" });
  assert.equal(mapeoPorTitulos({ pedido: "name", estado: "estado_15" }, principal, [{ id: "x", titulo: "Otra", tipo: "text" }]), null, "sin columna de estado no se lee");
});

test("tablero de devoluciones (13 nov 2026): FALLIDO y POSPUESTO siguen en ruta; DESINTEGRADO de los asesores es devuelto", () => {
  assert.equal(grupoDeEstado("FALLIDO"), "en_ruta");
  assert.equal(grupoDeEstado("POSPUESTO"), "en_ruta");
  assert.equal(grupoDeEstado("RECHAZADO"), "rechazado");
  const columnas = [
    { id: "name", titulo: "Elemento", tipo: "name" },
    { id: "estado_1", titulo: "Estado", tipo: "status" },
    { id: "estado_9", titulo: "ESTADO ASESORES", tipo: "status" },
    { id: "texto_9", titulo: "OBSERVACIONES ASESORES", tipo: "text" },
  ];
  const m = sugerirMapeo(columnas as never);
  assert.equal(m.estado, "estado_1");
  assert.equal(m.estado_asesores, "estado_9");
  assert.equal(m.observaciones_asesores, "texto_9");
  const item = (asesores: string) => ({
    id: "1",
    name: "1468",
    updated_at: "2026-11-13T10:00:00Z",
    grupo: "DEVOLUCION CIUDAD",
    column_values: [
      { id: "estado_1", text: "POSPUESTO", value: null },
      { id: "estado_9", text: asesores, value: null },
      { id: "texto_9", text: "no quiere el pedido", value: null },
    ],
  });
  const pendiente = despachoDeItem(item("PENDIENTE"), { ...m, pedido: "name" });
  assert.equal(pendiente.estado_grupo, "en_ruta");
  assert.equal(pendiente.observaciones_asesores, "no quiere el pedido");
  const cerrado = despachoDeItem(item("DESINTEGRADO"), { ...m, pedido: "name" });
  assert.equal(cerrado.estado_grupo, "rechazado");
  assert.equal(cerrado.causa_rechazo, "no quiere el pedido");
});

test("prioridad entre tableros (13 nov 2026): ENTREGADO, luego DESINTEGRADO; PROCESADO no tapa al repartidor", () => {
  assert.equal(prioridadDespacho("entregado", null), "3");
  assert.equal(prioridadDespacho("entregado", "PROCESADO"), "3");
  assert.equal(prioridadDespacho("rechazado", "DESINTEGRADO"), "2");
  assert.equal(prioridadDespacho("en_ruta", "PROCESADO"), "1");
  assert.equal(prioridadDespacho("en_ruta", "PENDIENTE"), "1");
  assert.equal(prioridadDespacho("en_ruta", null), "1");
  assert.equal(causaDespacho(null, "DESINTEGRADO", "no quiere el pedido"), "Devolución (desintegrado): no quiere el pedido");
  assert.equal(causaDespacho("No contesta", "PROCESADO", "quiere recibir el sábado"), "Asesores (procesado): quiere recibir el sábado · repartidor: No contesta");
  assert.equal(causaDespacho("no rpd llamada", "DESINTEGRADO", "3er msj sin respuesta"), "Devolución (desintegrado): 3er msj sin respuesta · repartidor: no rpd llamada");
  assert.equal(causaDespacho("No contesta", null, null), "No contesta");
});
