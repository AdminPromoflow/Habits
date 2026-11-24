# Verificación realizada

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
