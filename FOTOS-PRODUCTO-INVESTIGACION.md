# Fotos de una publicación: qué necesita ver el comprador y cómo debe verse cada una

Investigación del 22 oct 2026 que sirve de **base del Asistente de IA** (pestaña Fotos de Gestión de IDs Dropi). El código vive en
`src/lib/publicaciones/ia/fotos-base.ts` (`TIPOS_FOTO`, `FICHA_FOTO`, `JUEGO_BASE`, `NO_SE_GENERA`) y se agrega al plan de fotos y al
pedido de cada foto que genera Gemini. Lo que el equipo suba en Reglas › Imágenes modelo se suma a esto, no lo reemplaza.

## Qué dice la investigación

**Cuántas fotos.** Amazon deja 9 (1 principal + 8) y solo se ven **7** en la ficha (6 si hay video); Alibaba admite 6 por producto; un
blog de Mercado Libre recomienda 8 como mínimo. Por eso la regla del sistema es 7 como mínimo y el plan de IA pide hasta 6 de una vez
(7 menos la principal que ya existe).

**Qué fotos, en orden de importancia.** Coinciden las guías de Amazon (Helium 10, Jungle Scout), Alibaba, GS1 y Mercado Libre:

1. **Principal**: el producto solo, completo, ≥ 85 % del cuadro (Amazon y Alibaba; Mercado Libre pide cerca del 95 %), fondo liso, sin texto, sin logos,
   sin objetos que no vengan. Es la miniatura del catálogo.
2. **Ingredientes / etiqueta** (suplementos y cuidado personal): Baymard probó con compradores que quien busca un suplemento mira la galería
   para ver los ingredientes; lo que está más abajo en la página se pasa por alto. Recomiendan una imagen **aparte** del panel
   «Supplement Facts», derecha y legible, mejor que la foto de la parte de atrás del frasco. GS1 distingue el panel, la lista de ingredientes
   y una imagen de beneficios. Es un panel con cifras exactas: se usa **la foto real de la etiqueta del proveedor**, no una generada.
3. **Beneficios** (infografía de 1 o 2 diferenciadores): Helium 10 y Jungle Scout. Texto corto, vista plana, fondo mínimo.
4. **En uso / estilo de vida**: una persona que se parezca al comprador usando el producto en un ambiente real; Jungle Scout aclara que una foto de
   teléfono sirve si muestra bien el uso y advierte que un montaje mal editado perjudica la marca.
5. **Cómo se usa** (instrucciones): Helium 10 y Jungle Scout, sobre todo si hay dudas de uso; reduce devoluciones.
6. **Tamaño / escala**: Baymard (2017) encontró que el **42 %** de los compradores trata de calcular el tamaño con las fotos, que sin referencia se
   equivocan, y que el 28 % de los 60 sitios más grandes no tiene ninguna imagen «a escala». La referencia es una mano, una taza, un celular.
7. **Detalle / zoom**: textura, acabado, etiqueta (Jungle Scout, Alibaba pide detalles como las etiquetas).
8. **Qué incluye**: lo que trae el pedido (Helium 10, Mercado Libre).
9. **Comparación** y **estilo cliente**: relleno, solo si falta para llegar al mínimo.

**Lo que no se debe generar con IA.**

- **Antes y después de una persona.** Helium 10 y Jungle Scout lo listan como una opción, pero para suplementos y productos de salud las fuentes de
  políticas de publicidad lo tratan como contenido que implica una transformación médica o física: la ASA del Reino Unido pide autorización para
  las alegaciones de adelgazamiento o salud en suplementos aunque sean implícitas, y las guías de Meta que encontré no coinciden entre sí (son
  blogs, no la política de Meta). Una imagen generada, además, sería un resultado inventado. Queda fuera.
- Sellos, certificaciones, premios, reseñas, estrellas: solo si existen de verdad.
- El panel de información con cifras (arriba).

**Mercado Libre.** Su guía oficial (vía resultados de búsqueda; la página devolvió 403 al leerla) dice que los fondos blancos ya no son obligatorios en
casi todas las categorías, que recomienda fondos de contexto y que el producto ocupe cerca del 95 %; mínimo 1200 × 1200 px para el zoom; sin logos, QR,
bordes, textos ni datos de contacto; y afirma que mejorar las fotos subió la facturación de una publicación entre 15 y 30 % (dato de la propia
plataforma). Tiene incluso un botón «Generar fotos con IA» en su editor. Amazon: la foto **principal** debe ser una fotografía real del producto
(no mockups ni ilustraciones); el uso de IA es para las secundarias, y el vendedor responde por que sean fieles al producto.

## Cómo pedírselo a Gemini (guía de Google)

La guía de Google para Gemini (Nano Banana) dice: pedir la foto como un fotógrafo (**tipo de plano, sujeto, ambiente, luz, cámara y lente, formato**);
estudio con «tres softboxes»; lente 85 mm para retrato con fondo desenfocado, macro para detalle, gran angular para escala; **describir lo que sí debe
aparecer** en vez de lo que no (mejor «una calle vacía» que «sin autos»); ser específico con materiales y colores; y, con fotos de referencia, decir
explícitamente **qué debe quedar exactamente igual**. Por eso cada ficha de `FICHA_FOTO` está escrita en positivo y con cámara y luz.

**Texto dentro de la imagen.** Esa misma guía dice que los modelos actuales escriben texto legible si se les da el texto exacto entre comillas, se nombra
la tipografía y se piden primero los textos; no documenta cuántas veces falla. Tras la prueba con la crema Perfect (22 oct 2026), donde las imágenes de
beneficios, ingredientes y uso salían solo visuales, **las fotos informativas llevan texto** (beneficios, ingredientes y cómo se usa) y las demás no. El
texto no lo inventa Gemini: lo escribe el plan o el equipo, se le pide tal cual y después se lee la imagen para comprobarlo.

## Cómo quedó en el sistema

- **Tipos de foto** (`TIPOS_FOTO`): se suman «Ingredientes», «Cómo se usa» y «Tamaño» a los siete que había.
- **Juego prioritario por producto** (`JUEGO_BASE`, `familiaDeProducto`): suplemento (principal › ingredientes › beneficios › uso › cómo se usa › qué
  incluye › detalle › tamaño), belleza (principal › detalle › uso › beneficios › ingredientes › tamaño…) y general (principal › uso › beneficios ›
  tamaño › detalle…). Un suplemento manda sobre belleza («cápsulas para el cabello»).
- **Ficha de cada foto** (`FICHA_FOTO`): qué duda resuelve, cómo hacerla (composición, luz, cámara) y qué cuidar. El plan de fotos recibe el juego y
  lo que resuelve cada tipo; cada foto recibe su ficha en el pedido a Gemini.
- **Texto en las fotos informativas** (`TIPOS_CON_TEXTO`, `texto-imagen.ts`): beneficios (hasta 4), ingredientes (hasta 6) y cómo se usa (hasta 4 pasos) llevan
  texto escrito; cuadro editable «Textos de la imagen»; se rechaza lo que promete curar o tratar; la imagen generada se lee con la IA de texto y, si el
  texto quedó mal escrito (tildes incluidas), se genera una vez más. La foto dice «Texto verificado» o «Revisar el texto».
- **Lo que no se genera** (`NO_SE_GENERA`): se le dice a la IA para que lo avise en el análisis y el equipo use la foto real.

## Fuentes

- Amazon (reglas de la foto principal, secundarias y uso de IA, citadas en el foro oficial de vendedores): <https://sellercentral.amazon.com/seller-forums/discussions/t/0149bdb3-2056-42ce-b0bb-9eef94e3d2b8> y <https://sellercentral.amazon.com/seller-forums/discussions/t/a40898ca-7fe7-43e2-bb35-7965bbb003d4>
- Helium 10, tipos de imagen de Amazon: <https://www.helium10.com/blog/amazon-images-checklist-for-fba-sellers/>
- Jungle Scout, imágenes secundarias y límite de 7 visibles: <https://www.junglescout.com/blog/amazon-product-images/>
- Baymard, imagen aparte del panel de suplementos: <https://baymard.com/research-articles/supplement-facts-label-image>
- Baymard, imágenes a escala (42 %, 28 %): <https://baymard.com/research-articles/in-scale-product-images>
- GS1, imágenes secundarias (panel, ingredientes, «sidekick»): <https://gs1.org/docs/images/Basics-Secondary-1-Pager.pdf>
- Mercado Libre, guía de fotos de calidad (resultado de búsqueda): <https://vendedores.mercadolibre.com.mx/nota/fotos-de-calidad-la-clave-para-destacar-y-vender-mas>
- Alibaba, fotos de un producto (Global Gold Supplier): <https://activity.alibaba.com/ggs/Product_photo.html>
- Google, cómo pedir imágenes a Gemini: <https://developers.googleblog.com/how-to-prompt-gemini-2-5-flash-image-generation-for-the-best-results/> y <https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana>
- ASA (Reino Unido), antes y después: <https://asa.org.uk/advice-online/before-and-after-photos.html>

Casi todo viene de guías de terceros (blogs de vendedores) y de resultados de búsqueda: las cifras de tamaño de imagen difieren entre fuentes (1000, 1200 y
1600 px) y no se pudo leer el texto oficial de Amazon ni el de Mercado Libre. Antes de tomar una cifra como regla, confirmarla en el Centro de ayuda
de cada plataforma.
