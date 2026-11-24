# Verificación realizada

## Error de base de datos y revisión en Safari — 23 de noviembre de 2026

- Hostinger respondía a consultas, pero faltaban `image_data`, `labels_json` y `checkbox_state` en `diagram_nodes`, así como los registros de las migraciones 008 y 009. El guardado actual requiere esos campos; el mensaje genérico no significaba que MySQL estuviera detenido.
- Se aplicaron ambas migraciones mediante Chrome/phpMyAdmin y después se registraron sus checksums. La comprobación final confirmó tres columnas nuevas, dos migraciones con checksum correcto, un diagrama y nueve nodos, conservando los recuentos anteriores. No se subieron archivos ni se reemplazaron tablas o registros.
- Safari mostró «Diagram saved» en el diagrama existente. La recarga mediante el botón de Safari recuperó sus nueve ideas y la casilla marcada de la raíz, sin mensaje de base de datos. La comprobación se centró en lectura, guardado y recuperación del diagrama existente.
- MySQL local `mi_rutina` respondió y ya tenía las tres columnas y las migraciones 008/009 con los mismos checksums; no necesitó cambios.
- Evidencia: `tests/.runtime/hostinger-migrations-008-009.png` y `tests/.runtime/safari-database-repaired.png`.

## Nombre propio, hijos vacíos y distribución radial — 23 de noviembre de 2026

- Título independiente en un recuadro fijo arriba a la izquierda: doble clic o Enter/F2 para editar, cursor al final, Enter o pérdida de foco para guardar, Escape para cancelar y nombre vacío para conservar el anterior. Cambiar de diagrama guarda primero el título pendiente. La API conserva el texto raíz, hijos, estilos y anchos al renombrar.
- El botón «+» crea una idea vacía con foco y cursor, sin texto predeterminado. Los borradores vacíos no se envían a la base; escribir activa el guardado y cancelar un borrador no elimina una idea ya enviada o guardada.
- Radial habilitado en el selector, con distribución circular y las mismas opciones de alcance y persistencia que los demás estilos. Las ocho distribuciones están disponibles.
- 122 pruebas JavaScript aprobadas en el estado integrado del proyecto; 136 comprobaciones HTTP y 7 de esquema/fuentes aprobadas en una base aislada. Incluyen independencia del título, concurrencia, cambio de cuenta, validación, guardado y relectura del árbol.
- Navegador local: título guardado y recuperado al recargar, texto raíz intacto, Escape restaura el título, selección de otro diagrama conserva sus nombres; hijo vacío con foco y selección `[0,0]`, texto escrito y recuperado después; Radial conservado al recargar. Sin errores de consola en el recorrido final. Capturas: `tests/.runtime/diagram-title-and-blank-child.png` y `tests/.runtime/diagram-radial-enabled.png`.
- Cambios guardados localmente; no se publicaron archivos. Estas tres funciones utilizan los campos existentes del modelo de diagramas.

## Múltiples diagramas y recarga al seleccionarlos — 23 de noviembre de 2026

- Selector «Mis diagramas» y botón persistente «Crear diagrama», sin límite de cantidad impuesto por la interfaz. Cada creación conserva los árboles anteriores y reinicia el lienzo; las pulsaciones durante una creación en curso no la duplican.
- Seleccionar un diagrama guarda primero las ediciones pendientes, incluidos los cambios hechos durante otra solicitud. Después navega al documento con `?diagram=ID`; recargar conserva ese diagrama aunque otro sea más reciente. Solo se seleccionan identificadores de la lista privada de la cuenta. Los errores de guardado o de validación mantienen abierto el editor actual.
- 122 pruebas JavaScript aprobadas, incluidas creación consecutiva de doce diagramas, selección por URL, navegación, guardado en curso, fallo de conexión y cambio de cuenta. La suite completa posterior pasó 130 comprobaciones HTTP y 7 de esquema/fuentes en una base aislada.
- Navegador: creación de dos diagramas adicionales, nombre independiente, selección de un diagrama anterior mediante navegación completa y recuperación de la misma selección al recargar; sin errores de consola. Captura: `tests/.runtime/multiple-diagrams.jpg`.

## Reparación del guardado de anchos y estilos en Hostinger — 23 de noviembre de 2026

- Diagnóstico en Chrome/phpMyAdmin: la columna `diagram_nodes.node_width` y la migración 007 no existían. Todos los guardados del árbol incluyen esa columna, por lo que fallaban también los cambios de estilo e hijos.
- Se ejecutó exactamente `007_diagram_node_width.sql`, después se registró su SHA-256. La consulta posterior confirmó columna y checksum presentes, con el mismo diagrama y ocho nodos. No se reemplazaron datos ni se subieron archivos.
- Safari conservaba los cambios pendientes y el botón «Try again». Se indicó reintentar antes de recargar; la usuaria confirmó: «Sí, ahora guarda correctamente». Localhost ya tenía aplicada la 007.
- Evidencia: `tests/.runtime/hostinger-migration-007.png`.

## Ancho individual con el icono de dos triángulos — 23 de noviembre de 2026

- Icono exterior activo como control de ancho: arrastre horizontal con captura de puntero, cursor de ajuste, límites de 100–600 px y escala compensada por el zoom. Se mantiene la esquina superior izquierda del cuadro durante el ajuste, se redistribuye el texto y se recalculan las conexiones. Teclado: flechas, Shift para pasos de 50 px e Inicio/Fin.
- Se guarda solo al terminar el arrastre; el ancho pertenece al cuadro, no se hereda ni cambia al aplicar una distribución. Se conserva selección, edición por doble clic, desplazamiento del lienzo y guardado con control de versión. Cancelación del puntero y pérdida de foco liberan la captura; cambiar de cuenta cancela sin guardar en la nueva sesión.
- Migración 007 aplicada a `mi_rutina` local, sin reemplazar datos. Añade `node_width`, validación y compatibilidad con clientes que omiten el campo. Preparada para aplicar en Hostinger antes de habilitar los archivos nuevos; no se publicaron archivos ni se modificó Hostinger en esta revisión.
- 99 pruebas JavaScript aprobadas (47 del editor, 41 de distribución y 11 de cámara), 120 comprobaciones HTTP y 7 de esquema/fuentes en una base aislada. Incluyen límites, redondeo, ancho con zoom, estilos, persistencia, compatibilidad y aislamiento entre cuentas.
- Navegador local: arrastre real 220 → 320 → 150 px; texto pasa de una a tres líneas con altura 48 → 96 px y se recupera al recargar. Un hijo cambia de 220 a 260 px mientras su padre conserva 150 px. Sin errores de consola. Captura: `tests/.runtime/diagram-node-width.png`.

## Alcance del cambio de distribución — 23 de noviembre de 2026

- El selector incluye dos opciones excluyentes debajo de las direcciones: «Modificar todo el diagrama» y «Modificar todos los hijos» (predeterminada, incluye el cuadro seleccionado). Afectan tanto al modo como a la dirección.
- Todo el diagrama aplica el estilo desde la raíz, aunque se abra el panel desde un hijo. La opción de hijos solo cambia el cuadro seleccionado y sus descendientes. En el grupo elegido se limpian los estilos propios y las posiciones manuales anteriores; las ramas externas conservan sus valores. «Heredar del padre» cambia a «Predeterminado» al elegir todo el diagrama.
- 81 pruebas JavaScript aprobadas: 39 del editor, 31 de distribución/conectores y 11 de cámara. Las nuevas comprobaciones cubren alcance, herencia, aislamiento de ancestros/hermanos, guardado único y recuperación tras recargar.
- Navegador local sobre base aislada: aplicar Horizontal/Derecha a todo el diagrama desde un hijo; recargar y comprobar raíz y herencia del hijo; aplicar Vertical/Abajo solo a la rama y recuperar esa elección, manteniendo Horizontal en su padre. Vista móvil de 390 × 844 sin desbordamiento horizontal, opciones y Aplicar accesibles. Capturas: `tests/.runtime/diagram-layout-scope-desktop.png` y `diagram-layout-scope-mobile.png`.
- Cambios locales, sin publicación ni cambios del esquema de base de datos. Este alcance reemplaza el comportamiento anterior que conservaba las excepciones de las subramas al cambiar el estilo del padre.

## Desplazamiento, zoom, manito y conectores — 23 de noviembre de 2026

- Cámara independiente de los datos: arrastre del fondo con clic mantenido, desplazamiento horizontal/vertical con trackpad y zoom de pinza (20 %–300 %) anclado al cursor. Se atienden eventos wheel de Chromium y gestos acumulativos de Safari, evitando procesar el mismo zoom dos veces. La cámara se conserva durante los redibujados de la página y se reinicia al cambiar de cuenta.
- El cuadro seleccionado muestra cursor de mano abierta, y mano cerrada al arrastrar. Raíces y ramas se pueden mover en cualquier distribución. Las coordenadas consideran el zoom, se guardan, y los hijos acompañan a la rama. Aplicar una nueva distribución limpia las posiciones manuales del subárbol y conserva sus estilos propios.
- Conectores con tramos ortogonales y giros redondeados de hasta 6 px. Los conectores alineados permanecen rectos; se usan rutas exteriores cuando la ruta habitual atraviesa otro cuadro.
- 78 pruebas JavaScript aprobadas: 36 del editor, 31 de distribución/conectores y 11 de cámara. Cubren herencia, posiciones, zoom y anclaje, normalización de la rueda, selección, guardado, cancelación/captura, pérdida de foco, cambio de cuenta y conservación de la cámara.
- Navegador local sobre base aislada: arrastre del fondo en ambos ejes sin mover la página, desplazamiento vertical/horizontal por rueda, cursor grab, arrastre y guardado de raíz, recuperación después de recargar, zoom 125 % y arrastre equivalente (50 px en pantalla a 125 % = 40 unidades del diagrama). Eventos de pinza Safari simulados mediante controles locales temporales: ampliación 150 % y retorno al 100 %; los controles se eliminaron tras la prueba. No se simularon gestos físicos del hardware.
- Cambios guardados únicamente en archivos locales; sin publicación ni modificación del esquema de la base de datos.

## Reparación de Hostinger y comprobación local — 23 de noviembre de 2026

- En Hostinger faltaba `diagram_nodes`; `schema_migrations` solo incluía las versiones 001–005. Se aplicó exactamente `006_diagram_nodes.sql` en la base del proyecto mediante Chrome/phpMyAdmin y se registró el checksum `8252174bd6ea4d20893b9e3366db05aa9a9a8ac767e93f8ce8814eb697ed867b`.
- Resultado remoto: 1 diagrama y 1 nodo raíz; cero diagramas sin raíz, cero padres inexistentes y cero diferencias entre el texto raíz y el nombre original. El checksum registrado coincide.
- Localhost/XAMPP: migraciones 001–006 presentes, tabla con sus dos claves foráneas y restricciones, cero relaciones inconsistentes. La base local todavía no contiene diagramas; no se añadieron datos de prueba.
- Tras la sesión iniciada por la usuaria en Safari, se recargó la página pública: desapareció `error_database`, abrió «Hello Aleina» y mostró el diagrama guardado.
- Modelo generado localmente desde migraciones 001–006: 23 tablas, 164 columnas y 36 claves foráneas. PNG general rápido en `docs/database-model/00-vista-rapida.png`; versión completa en `01-modelo-general.png`. No se usó generación de imágenes con IA.
- Evidencia de la reparación remota en `tests/.runtime/hostinger-migration-006.png`. No se subieron archivos del proyecto.

## Distribución y herencia por rama — 23 de noviembre de 2026

- Iconos exteriores de 28 px, panel de doce herramientas y selector central de distribución abierto desde el símbolo de ramas. Los demás botones del menú continúan deshabilitados. El signo «+» crea un hijo con estilo heredado.
- Distribuciones libre, horizontal, vertical, lista, descendente, lineal y matriz, con sus direcciones. Radial se muestra deshabilitado como en las capturas. Cada nodo guarda una elección propia o hereda la del ancestro más cercano; las excepciones de las subramas se conservan.
- 47 pruebas JavaScript del editor y motor de distribución; 114 comprobaciones HTTP y 7 de esquema/fuentes. Cubren herencia, excepciones, reintentos, concurrencia, cuentas distintas, ciclos, límites, multilinea y posiciones manuales.
- Navegador local: doble clic deja ambos extremos de selección al final; creación/edición de hijos; aplicar y cancelar; Escape y foco; distribución descendente, matriz y libre; elección horizontal propia de una rama recuperada tras recargar; arrastre manual recuperado con la misma posición relativa.
- Revisado el panel en escritorio de 1280 × 900 y móvil de 320 × 740: sin desbordamiento horizontal del diálogo ni de la página, con desplazamiento interno y Aplicar accesible. Capturas: `tests/.runtime/diagram-layout-panel-desktop.png`, `diagram-layout-panel-mobile.png` y `diagram-layout-tree-desktop.png`.
- Migración 006 aplicada a la base aislada y a la base local de XAMPP. No se publicaron archivos ni se modificó Hostinger. La instalación pública necesita aplicar la migración antes de habilitar los archivos nuevos.

## Selección del nodo y doble clic para editar — 23 de noviembre de 2026

- Un clic selecciona el cuadro y muestra los cinco símbolos de referencia; el texto permanece de solo lectura. Doble clic habilita el editor; la revisión posterior coloca el cursor al final sin seleccionar el texto. Los símbolos son únicamente visuales, conforme a la confirmación de la usuaria.
- Un clic fuera guarda la edición y oculta los símbolos. La creación sigue guardándose inmediatamente, pero el nuevo nodo queda seleccionado sin entrar automáticamente al editor. El teclado permite enfocar con Tab, editar con Enter/F2 y deseleccionar con Escape.
- 20 pruebas JavaScript completadas, incluidas las regresiones de guardado, múltiples líneas, autoaltura, cambio de cuenta y reintentos. Comprobadas sintaxis PHP/JavaScript y diferencias sin errores de espacios.
- Navegador local y base aislada: un clic mantiene `readonly`, doble clic lo desactiva y enfoca el texto; edición con Shift + Enter, guardado al pulsar fuera y recuperación tras recargar. Los símbolos vuelven a estar ocultos al abrir la página.
- Revisado escritorio y móvil de 320 × 740: los cinco símbolos caben en pantalla, sin desbordamiento horizontal. Capturas en `tests/.runtime/diagram-selected-desktop.png` y `tests/.runtime/diagram-selected-mobile.png`.

Cambios únicamente locales; sin publicación ni cambios de esquema o datos en Hostinger.

## Nodo compacto y texto multilínea — 23 de noviembre de 2026

- Espacio interior de 10 px, altura inicial de una línea y crecimiento/reducción automática al escribir, borrar, recargar y cambiar el ancho de la ventana.
- Shift + Enter inserta un renglón sin salir del editor. Enter guarda y termina la edición. Los saltos de línea iniciales, interiores y finales se conservan en MySQL; un nombre compuesto únicamente por espacios o saltos sigue siendo inválido.
- 13 pruebas JavaScript y 101 comprobaciones HTTP completadas en una base aislada; también pasaron las 7 comprobaciones existentes de esquema y datos.
- Navegador: una línea ocupa 48 px de altura total; dos líneas, 72 px; tres líneas, 96 px, con padding calculado de 10 px. Comprobado que una línea vacía final permanece tras recargar. Vista móvil de 390 × 844 sin desbordamiento horizontal ni texto recortado.
- Capturas locales: `tests/.runtime/compact-multiline-desktop.png` y `tests/.runtime/compact-multiline-mobile.png`.

No cambia el esquema de la base. Esta revisión está guardada localmente, sin publicación ni cambios en Hostinger.

## Nodo redondeado y creación persistente — 23 de noviembre de 2026

- Nodo inicial cambiado a rectángulo de 220 × 128 px con esquinas de 24 px.
- Pulsar Crear diagrama guarda inmediatamente un registro con el nombre traducido «Nuevo diagrama» / «New diagram». El texto queda seleccionado para reemplazarlo. No hace falta escribir para conservar la creación al recargar.
- 8 pruebas JavaScript completadas: creación inmediata, recuperación al recargar, edición durante la creación, doble clic, reintento con la misma clave y regresiones de guardado, cambio de cuenta y validación.
- Comprobación real en navegador y base de pruebas aislada: creación sin escribir → recarga → nodo recuperado; cambio a «Mi primer diagrama» → recarga → nombre conservado. Revisadas las vistas de escritorio y móvil (390 × 844).
- Sintaxis JavaScript/PHP y `git diff --check` correctos. Capturas en `tests/.runtime/rounded-diagram-desktop.png` y `tests/.runtime/rounded-diagram-mobile.png`.

Este cambio está únicamente en los archivos locales. Usa la tabla `diagrams` existente; no requiere una nueva migración ni cambia el modelo relacional. No se publicaron archivos ni se modificó Hostinger durante esta revisión.

## Reorganización local y primer nodo del diagrama — 23 de noviembre de 2026

Esta actualización se realizó únicamente en la carpeta local MyRemarkableMind. No se publicó ni se sincronizó con Hostinger o Git remoto.

- 100 comprobaciones HTTP y 7 de esquema/datos completadas en una base aislada. Incluyen los recorridos anteriores, endpoints por módulo, bloqueo de los nuevos archivos internos, propiedad de diagramas, CSRF, nombres válidos, reintentos de creación y conflictos de versión.
- 4 pruebas de JavaScript completadas para escritura durante un guardado, respuesta perdida de creación, cambio de cuenta con una solicitud pendiente y validación de nombres vacíos.
- Navegador local: botón centrado, creación inmediata del nodo con foco, nombre editable, guardado y recuperación al recargar; inglés/español; un nombre con etiquetas HTML permanece como texto. Revisados tamaños de 1440 × 1000 y 390 × 844, sin desbordamiento horizontal en Inicio.
- Revisadas las pantallas personales y administrativas. Comprobado el tablero semanal de Ejercicios y el guardado de un hábito adicional exclusivamente en la base de pruebas. Sin errores de consola durante estos recorridos.
- Migración `005_diagrams.sql` aplicada a la base local. Los recuentos de registros de 11 tablas anteriores se compararon antes y después y permanecieron iguales.

Capturas locales de prueba: `tests/.runtime/diagram-desktop.jpg` y `tests/.runtime/diagram-mobile.jpg` (fuera de Git). El historial de despliegue que sigue corresponde a revisiones anteriores; esta entrega requiere subir los archivos y ejecutar `php bin/migrate.php` manualmente en el servidor.

## Historial anterior

Fecha: 22 de noviembre de 2026.

## Automatizada

Se ejecutaron satisfactoriamente **86 comprobaciones HTTP** y **7 comprobaciones de esquema/datos** con PHP 8.4.26 y MariaDB 10.4.28. Las bases de pruebas usan prefijo `mi_rutina_test_` y están separadas de los datos reales.

Se comprobó idioma inglés/español entre sesiones y dispositivos; autenticación y CSRF; roles de Aleina; denegación de administración a usuarios normales; privacidad de hábitos y categorías; aprobación/rechazo; invitaciones individuales, seleccionadas y por categoría; aceptación y rechazo; permisos de lector/participante/editor; consentimiento de progreso; cálculo del promedio 80/60 = 70; aislamiento de notas y registros; revocación; incorporación explícita de hábitos futuros; retirada al cambiar de categoría; suspensión; configuración; invalidación de sesiones al cambiar contraseña; y bloqueo HTTP de archivos privados.

Se verificaron la reejecución de migraciones y la importación idempotente de la rutina: una rutina, 40 ejercicios y 232 fechas programadas, sin completados ficticios.

La recuperación se probó con correos guardados exclusivamente en el entorno aislado: respuesta equivalente para cuentas existentes/desconocidas, CSRF, idioma y URL, almacenamiento del hash, caducidad, enlace falsificado, contraseña débil, uso único, revocación de sesiones y enlaces, activación pendiente y rechazo de cuentas suspendidas.

Las categorías se probaron sin inscripciones predeterminadas, con inscripción idempotente, persistencia entre dispositivos, aislamiento de elecciones y categorías privadas, plantillas de categorías elegidas, rechazo de creación en categorías no elegidas, conservación de hábitos al retirar categorías y aprobación que inscribe solo al solicitante.

Se capturó también el transporte PHP mail en un archivo temporal, sin envío externo, para comprobar remitente, destinatario, Date, Message-ID y contenido UTF-8.

## Navegador local

Inspeccionadas las pantallas de acceso, panel personal, lista de hábitos y tablero de rutina. Comprobado cambio inmediato a español y preservación de los nombres originales. Revisados escritorio y móvil de 390 px; el contenido principal no desborda horizontalmente. El tablero de cinco días utiliza desplazamiento horizontal en pantallas pequeñas. No se observaron errores de consola en el panel personal durante la revisión.

Revisado el nuevo recorrido Ajustes → categorías elegidas → Mis hábitos → tablero semanal: Ejercicios conserva 40 hábitos en cinco días; otra categoría con frecuencia diaria muestra siete días sin mezclar ejercicios. Comprobados alta/baja voluntaria en el catálogo, categoría precargada al crear un hábito, regreso al catálogo personal y vista móvil sin desbordar la página.

## Hostinger

- Base creada: `u348170507_habits`.
- Importación SQL: confirmación de phpMyAdmin de **80 consultas ejecutadas correctamente** y 19 tablas.
- PHP detectado en la respuesta de producción: **8.3.37**.
- Archivo `config/local.php` preparado directamente en el servidor para la base y el usuario de Hostinger.
- Contraseña desacoplada en `config/database-password.txt`, excluida de Git y bloqueada desde HTTP (403 verificado).
- Conexión verificada: `bootstrap` responde HTTP 200 y `ok: true`; la pantalla de acceso carga en Chrome.
- Correo de la cuenta corregido a `aleinarossui@gmail.com` conservando su identificador y datos.
- Migración de recuperación aplicada en Hostinger; la tabla adicional conserva solo hashes de tokens.

No se ha sustituido una base existente ni se han importado cuentas o completados de prueba en producción.
