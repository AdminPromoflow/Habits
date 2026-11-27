# Instalar en Hostinger

## Requisitos

PHP 8.2 o posterior con `pdo_mysql`, `mbstring`, `json` y `session`; MySQL 8.0.16+ o MariaDB 10.4+; HTTPS y Apache/LiteSpeed con `.htaccess`. La aplicación funciona dentro de un subdirectorio como `/MyRemarkableMind/` porque las rutas del frontend son relativas.

## Sitio de esta instalación

La sesión de hPanel revisada el 23 de noviembre de 2026 corresponde a **aleinarossui.com**. El repositorio MyRemarkableMind está conectado a `public_html/MyRemarkableMind`. La instalación conserva la base **u348170507_habits**, con usuario **u348170507_habits**. Estos nombres no son contraseñas. El archivo `config/local.php` de desarrollo contiene credenciales del MySQL local y no debe copiarse a producción.

## Conexión de producción

Crea directamente en el servidor `public_html/MyRemarkableMind/config/local.php` (se excluye de Git):

```php
<?php
return [
    'db_host' => 'localhost',
    'db_port' => 3306,
    'db_name' => 'u348170507_habits',
    'db_user' => 'u348170507_habits',
    'db_password' => 'CONTRASEÑA_ELEGIDA_EN_HOSTINGER',
    'db_socket' => '',
    'app_url' => 'https://aleinarossui.com/MyRemarkableMind',
    'secure_cookies' => true,
    'session_path' => __DIR__ . '/../storage/sessions',
    'mail_transport' => 'mail',
    'mail_from' => '', // Usa no-reply@aleinarossui.com.
];
```

En la instalación realizada, `local.php` lee la contraseña desde `config/database-password.txt` usando `rtrim(file_get_contents(...), "\r\n")`. Ese archivo contiene únicamente la contraseña, sin comillas, y también está excluido de Git y protegido por `.htaccess`. Este método evita problemas con caracteres especiales dentro de una cadena PHP.

Si utilizas el ejemplo anterior, completa la contraseña real directamente en el servidor. Conserva las comillas; si la contraseña contiene comillas simples o barras invertidas, hay que escaparlas en PHP. No incluyas este archivo en un commit. Los permisos deben permitir su lectura al proceso PHP del alojamiento (normalmente 600/640, según propietario), sin permitir acceso HTTP.

El directorio `storage` y su subdirectorio `sessions` deben poder ser escritos por el usuario de PHP. No uses permisos 777. En Hostinger, PHP suele ejecutarse con el propietario de los archivos; comprueba los permisos reales.

## Importar el esquema y los datos

La exportación `storage/hostinger-mi-rutina.sql` se importa en **la nueva base vacía**, desde phpMyAdmin → Importar. No contiene `CREATE DATABASE`, `DROP DATABASE`, `GRANT`, procedimientos, disparadores ni definidores. Incluye tablas, cuenta de Aleina, roles, preferencias, categorías, plantillas y rutina. No incluye sesiones ni límites de intentos del entorno local.

Si partes desde cero y tienes SSH, ejecuta `php bin/install.php` y `php bin/import-routine.php` después de guardar la conexión. Si ya importaste la exportación, ejecutar el instalador de nuevo es idempotente.

Tras importar, el enlace de activación de Aleina utiliza el mismo token de un solo uso, reemplazando el origen local por `https://aleinarossui.com/MyRemarkableMind/`. Si Aleina ya había activado su cuenta antes de exportar, inicia sesión con la misma contraseña. Para emitir un nuevo enlace, mediante SSH:

```sh
php bin/reset-password.php aleinarossui@gmail.com
```

Este comando invalida sesiones anteriores y genera un enlace que caduca en una hora. No envía correos.

## Recuperación de contraseña

La pantalla de acceso incluye **Recuperar contraseña / Forgot password?**. La cuenta inicial utiliza `aleinarossui@gmail.com`. Aplica `003_password_recovery.sql` con el migrador antes de desplegar la recuperación; para esta instalación, `storage/hostinger-recovery.sql` contiene la migración, su checksum y la corrección autorizada del correo de Aleina, conservando su identificador y contenido.

Configura `mail_transport` como `mail` en el `local.php` de producción. Un `mail_from` vacío usa `no-reply@` seguido del dominio de `app_url`; se incluyen también las cabeceras Date y Message-ID. Si se configura una dirección propia, debe pertenecer al dominio autorizado para enviar. Revisa el buzón y spam para comprobar la entrega. No copies los correos de prueba a producción.

Los enlaces duran 30 minutos y solo pueden usarse una vez. Pedir un enlace no cambia la contraseña. El restablecimiento invalida las sesiones anteriores y requiere iniciar sesión de nuevo. La aplicación restringe las solicitudes a 3 por dirección/hora, 20 por IP/hora, 8 por minuto y 90 por día para toda la plataforma. Para mayor volumen y entregabilidad, integra un proveedor SMTP autenticado antes de ampliar límites.

## Git y despliegues

Desde el 25 de noviembre de 2026, la usuaria publica los cambios desde su terminal mediante Git. Dejar las modificaciones en el proyecto local, sin crear paquetes ZIP, carpetas de builds ni subir archivos de aplicación a Hostinger. Revisar e indicar si cada cambio requiere migraciones de base de datos. El ajuste de posición y centrado de las flechas de desplazamiento solo modifica CSS y no requiere cambios de base de datos.

Confirmado el 26 de noviembre de 2026: cuando una modificación requiera cambios de base de datos, aplicarlos también en Hostinger y verificar el resultado. Cuando solo cambie el código, dejarlo preparado para que la usuaria lo publique mediante Git. La selección de categorías de My Day Today se conserva en el navegador por cuenta e instalación; no requiere migración.

Se retiraron a la papelera de Hostinger los siete ZIP históricos de `.builds` (planner, categories, week, note, note-fullscreen, flags-scroll y scroll-center), conservando `logs`, y `mindspace-sidebar-update.zip` de la raíz publicada. Se eliminaron también los catorce ZIP temporales locales de `/private/tmp` y `tests/.runtime`; las referencias posteriores a esos paquetes son un registro histórico.

Para los enlaces entre diagramas/cuadros, aplicar `012_diagram_node_links.sql` antes de habilitar el modelo actualizado. Se aplicó en esta instalación el 24 de noviembre de 2026, conservando dos diagramas y quince nodos. El guardado pendiente del enlace en Safari pasó de `error_database` a «Diagram saved» al reintentar después de añadir `link_json`.

Para la selección voluntaria de categorías, aplica `004_category_choices.sql` antes de desplegar esa versión. Conserva inscripciones de categorías globales que ya tengan hábitos/rutinas; las categorías privadas propias permanecen disponibles. El catálogo global se conserva en Hostinger, mientras que cada usuario elige en Ajustes cuáles añadir. En Mis hábitos se muestran las categorías con hábitos, y cada una abre su tablero semanal.

Para el editor de diagramas, aplica todas las migraciones pendientes antes de desplegar los archivos nuevos. Actualmente llegan hasta `011_diagram_connections.sql`: la 005 crea `diagrams`, la 006 añade los nodos, la 007 sus anchos individuales, la 008 imágenes/etiquetas, la 009 casillas, la 010 permite ideas vacías y la 011 añade conexiones adicionales. Si falta una tabla o columna requerida, la consulta o el guardado devuelve `error_database`, aunque MySQL esté funcionando. El migrador registra el nombre y el SHA-256 de cada archivo en `schema_migrations`.

El 24 de noviembre de 2026 se aplicaron 010 y 011 en Hostinger mediante phpMyAdmin: se retiró `chk_diagram_node_text`, se añadió `connections_json` y se registraron los checksums. Se conservaron un diagrama y doce nodos. Safari volvió a abrir el diagrama al reintentar. La versión anterior del controlador confundía el rechazo SQL de un cuadro vacío con un elemento duplicado.

Sube los archivos de aplicación, incluidos `.htaccess`, `assets`, `app`, `controller`, `model`, `view` y `translations`. Los archivos `config/local.php` y el contenido de `storage` no se versionan. No despliegues `tests/.runtime`, archivos SQL privados ni la carpeta `.git` a una ruta pública.

Comprueba que la estrategia de despliegue de Hostinger conserva archivos no versionados. Si reemplaza todo `public_html/MyRemarkableMind`, conserva la configuración y las sesiones fuera de la carpeta reemplazada y proporciona sus rutas/valores mediante variables `RUTINA_DB_*`, `RUTINA_APP_URL`, `RUTINA_SESSION_PATH` y `RUTINA_SECURE_COOKIES=1`.

## Reparación de diagramas del 23 de noviembre de 2026

En la revisión posterior desde Safari se confirmó que Hostinger no tenía `image_data`, `labels_json` ni `checkbox_state`. Se aplicaron las migraciones 008 y 009 mediante Chrome/phpMyAdmin y se registraron los checksums de los archivos locales. Se conservaron el diagrama y sus nueve nodos. Safari mostró «Diagram saved» y recuperó los nueve cuadros después de recargar; la instalación local ya tenía ambas migraciones. No se subieron archivos del proyecto.

Se comprobó mediante Chrome y phpMyAdmin que producción tenía 21 tablas y las migraciones `001`–`004`, pero no `diagrams`. Se aplicó únicamente `005_diagrams.sql` y se registró su checksum `485f348de5d73507f7b262655be8bea654df2537890c47fb72a7f33da00184cb` en `schema_migrations`.

La comprobación posterior mostró 22 tablas, checksum correcto y la clave foránea `diagrams.owner_user_id → users.id` con `ON DELETE CASCADE`. Los conteos comparados antes y después se conservaron: 1 usuario, 41 hábitos, 1 rutina y 1 registro de cumplimiento. La tabla nueva quedó vacía. No se importaron datos iniciales ni se desplegaron archivos de aplicación durante esta reparación.

El modelo documentado desde las migraciones está en [database-model](database-model/). La página pública cargó el formulario de acceso y la usuaria confirmó posteriormente que, al iniciar sesión, el panel volvió a abrir correctamente y desapareció `error_database`.

## Verificación en producción

Para esta instalación, verificar siempre la base publicada desde Hostinger/phpMyAdmin en Chrome al revisar cambios o incidencias; las pruebas locales no sustituyen esa comprobación. Utilizar consultas de solo lectura para revisar migraciones, columnas y datos, y comprobar también la carga real del sitio.

### Auditoría de todos los chats del proyecto — 27 de noviembre de 2026

Se revisaron los mensajes y resultados de **21 chats**: los 20 asociados a MyRemarkableMind y el chat original de creación en Habits. Se contrastaron las solicitudes vigentes con el código actual, sin reactivar diseños sustituidos posteriormente (horario semanal, filtro All, columna To Do o pantalla completa automática).

**Despliegue confirmado:** hPanel → GIT mostró **Completed**, raíz `public_html/MyRemarkableMind`, rama `main`, repositorio `AdminPromoflow/MyRemarkableMind` y commit `5dffdd0d93fcf1a034a75e0d5bbcd661f06121de`, idéntico al HEAD local al terminar la revisión. El remoto local todavía usa la dirección `AdminPromoflow/Habits`; esa diferencia de nombre no produjo una diferencia de commit. El último commit solo añadió/actualizó bytecode de pruebas; los archivos de aplicación corresponden a la versión que se probó. No se publicó código desde esta auditoría.

**Archivos públicos:** se descargaron y compararon por SHA-256 los 69 archivos versionados de JavaScript, CSS, imágenes, fuentes y bibliotecas públicas. Coincidieron exactamente 68, incluido todo el JavaScript, CSS y las fuentes. La única diferencia fue `assets/planner/notepaper.png`: ambas copias miden 902 × 1272, pero tienen distinta compresión/metadatos y 293 canales de color difieren como máximo en 1 nivel de 255. La hoja publicada conserva el diseño; no se sustituyó la imagen.

**Base de datos:** phpMyAdmin confirmó las **25 migraciones (001–025)**, con todos los checksums exactos. Se comparó además la estructura real contra una instalación aislada creada con esas migraciones: **33 tablas, 254 columnas y 64 relaciones** coincidentes. La firma de columnas incluye tabla, nombre, tipo de dato, nulabilidad y longitud máxima de texto; la firma de relaciones incluye las columnas de origen y destino. No quedaron migraciones pendientes ni fue necesario modificar datos de producción.

| Cambios revisados | Evidencia |
| --- | --- |
| Home, espacios, carpetas, pestañas persistentes, títulos editables y menús de tres puntos/clic derecho | Código publicado idéntico y pruebas de navegación/MindSpace. |
| Diagramas: nodos, imágenes, etiquetas, casillas, conexiones, estilos, enlaces, zoom, guías, reordenación y deshacer | Código publicado idéntico y pruebas del editor, geometría, permisos y persistencia. |
| Hojas de cálculo: plantillas, fechas, selección múltiple, estilos, copiar/pegar y limpieza de celdas | Código publicado idéntico, pruebas de hoja y documento existente cargado en producción. |
| Kanban–Scrum: Pending/In Progress/Done, columnas propias, varios sprints, edición/eliminación y calendario de tarjetas | Tablero real con dos sprints, calendarios y formulario Edit sprint verificados sin guardar cambios. Sincronización de cumplimientos probada en la base aislada. |
| My Day Today: hoja diaria, categorías, colores, filtros persistentes, orden por día y Pendings | Código publicado idéntico, filtros actuales visibles y pruebas del planificador. |
| Inicio/fin de tareas y hábitos, fechas, horas AM/PM y metas asociadas | Formulario publicado revisado; selector de hora y cierre automático del calendario al elegir el día comprobados. |
| My Goals y contribuciones en My Progress | Metas existentes, formulario de nueva meta y sección de avance presentes en producción; asociaciones, permisos y guardado probados en la base aislada. |
| Gráficas por día, semana, mes y año | Cuatro pestañas y gráfica por categoría visibles en producción; cálculos y curvas comprobados por pruebas. |
| Notas con hojas, fechas, tipografías y PDF | Nota existente con Edwardian y paginación cargada; descarga real de `New note (1).pdf`, 401.742 bytes y cabecera PDF válida. |
| Compartir, participantes, invitaciones y permisos independientes | All / Shared with me / Shared by me / Invitations presentes; permisos y aislamiento comprobados en las pruebas. No se enviaron invitaciones. |

Pasaron **465 pruebas JavaScript**, **385 comprobaciones HTTP** y **9 verificaciones de esquema/código**. Las pruebas de escritura, eliminación y permisos utilizaron una base MySQL aislada; en producción se comprobaron estructura, despliegue, carga y controles sin crear actividades de prueba ni cambiar contenido. Se cerró la pestaña de auditoría, conservando la pestaña original de la usuaria.

Chats incluidos: «Agregar menú contextual al clic derecho», «Convertir MindSpace en pestañas», «Filtrar tareas por categoría», «Convert My Day to weekly schedule», «Añadir gráficas por periodo», «Iguala el formato de My Day Today», «Añadir agenda de hábitos y tareas», «Mostrar iconos al pulsar Enter», «Add New submenu to menu», «Add sibling reorder guides», «Simplifica Home y el slider», «Elimina la sección de Excel», «Mejorar menú de espacios y folders», «Ajusta conectores en diagramas listing», «Añadir descarga de PDF por elemento», «Corrige el error», «Permite crear varios diagramas», «Actualiza el panel de hábitos», «Activa controles del cuadrito», «Agregar checklist de progreso» y «Crear plataforma Mi Rutina 3.0».

### Inicio y fin de actividades — 26 de noviembre de 2026

El formulario compartido por tareas y hábitos muestra **Inicio** (fecha y hora) y **Fin** (fecha y hora). La fecha y la hora finales son opcionales e independientes; la hora inicial sigue siendo opcional. Las tareas de una sola fecha conservan ahora su fecha de fin al guardar, sin convertirse en actividades repetitivas. Los hábitos mantienen su límite de repetición y los pendientes se guardan sin fechas ni horas.

Se aplicó `024_activity_end_time.sql` en local y en Hostinger mediante phpMyAdmin, con SHA-256 `958d345732921e6b69572ebfa31f94ea382c6700b73c913f6a0ab30ea803c5d0`. Añade `end_time TIME NULL` a `habits` y `calendar_tasks`. Se verificaron ambas columnas y el registro de migración. Los conteos permanecieron iguales: 40 hábitos y 0 tareas en local; 48 hábitos y 3 tareas en producción. No se ejecutaron semillas ni se subieron archivos de aplicación; el código queda para publicar mediante Git.

Pasaron 366 comprobaciones HTTP, 9 de esquema/código y 31 pruebas JavaScript. La revisión en navegador de la base aislada confirmó los cuatro campos al reabrir una tarea después de recargar, un hábito con hora final sin fecha final y las etiquetas en inglés y español.

En la revisión posterior del aviso de que la hora no cambiaba, Hostinger todavía mostraba el formulario anterior: **Date / Time (optional)**, sin los campos de fin. La publicación del código mediante Git sigue pendiente. Se comprobó en la base aislada la edición de horas sin cambiar fechas: una tarea pasó de `00:15 / 01:45` a `14:20 / 15:55`; un hábito guardó `10:10 / 11:40` manteniendo la fecha final vacía. Ambos recuperaron las nuevas horas tras recargar. En producción solo se inspeccionó y cerró el formulario, sin guardar actividades.

La hoja de **Mi día a día** muestra ahora el intervalo horario en pequeño a la derecha de cada actividad. Al pasar el mouse, enfocar con el teclado o tocarlo, aparece un detalle de dos líneas con las fechas y horas de inicio y fin. Los datos opcionales sin definir se indican explícitamente; un pequeño reloj permite consultar las fechas de actividades sin horas. Escape cierra el detalle. Se comprobaron tareas, hábitos, hover sin foco y navegación por teclado; pasaron las 31 pruebas JavaScript del calendario y la navegación. Este ajuste solo modifica código y traducciones, no requiere otra migración y queda para publicar mediante Git.

### Selectores de fecha y hora — 27 de noviembre de 2026

Los cuatro campos de Inicio/Fin del formulario compartido por tareas y hábitos abren selectores propios. El calendario se cierra al elegir un día, incluso al volver a elegir el día guardado. Permite cambiar mes/año, respeta la fecha mínima de fin y admite flechas y Enter. La ventanita de hora ofrece hora, minutos y AM/PM; **Usar hora** confirma y cierra. Los campos opcionales pueden borrarse individualmente, y Escape cierra el selector sin cerrar la actividad. No requiere migración; el código queda para publicar mediante Git.

Se probaron en la base aislada los dos calendarios, febrero de 2028, fechas finales anteriores deshabilitadas, selección por teclado, los selectores de hábitos y tareas, y guardado/recarga de `12 PM` como `12:00` y `12 AM` como `00:00`. Pasaron las 32 pruebas JavaScript de calendario/navegación; después del ajuste del cambio de año se repitieron las nueve del calendario y la comprobación en navegador.

### Pendientes, calendario de tarjetas y orden diario — 26 de noviembre de 2026

El aviso «The database is unavailable» al guardar una actividad pendiente correspondía a un esquema desactualizado: producción solo tenía las migraciones 001–020. Se descargó primero una copia SQL completa desde phpMyAdmin (`u348170507_habits.sql`, 72.837 bytes, en Descargas; contiene datos privados y no se incorpora al repositorio). Después se aplicaron las tres migraciones pendientes y se registraron sus checksums:

| Migración | Cambio | SHA-256 |
| --- | --- | --- |
| `021_planner_pending.sql` | Recurrencia `pending` y fecha inicial anulable en hábitos y tareas. | `60a7b92dc13815cbbb7df2d0fc0caf4c6bf26a82daebc489a1a263e337ac3170` |
| `022_card_calendar.sql` | Vínculo de hábitos y tareas con el tablero y la tarjeta de origen. | `22848c3066726cd77bde65b68d1cec18b5ca4cd5b81fb9f2e21e36cc778e589f` |
| `023_planner_day_order.sql` | Tabla `calendar_day_orders` para conservar el orden por usuario y día. | `e2fc8acdf96ae87eafe0bd1c3f81ebd3f86cbb2d9d76673fc2b73170985217ef` |

Las consultas posteriores confirmaron las columnas, la tabla nueva y la coincidencia exacta de los tres hashes. Los conteos inmediatamente antes y después de las migraciones fueron iguales: 46 hábitos, 0 tareas, 17 diagramas, 56 nodos y 25 elementos. La cuenta siguió utilizándose durante la revisión; otra consulta confirmó dos tareas pendientes con fecha nula y vínculos válidos a tarjetas, y un orden diario con JSON válido. La recarga final de la agenda recuperó tres tareas pendientes.

En Chrome se abrió el calendario de una tarjeta Scrum existente y se guardó su actividad pendiente sin cambiar sus valores. Se confirmó «Saved to My day to day», la reapertura de la misma actividad y su presencia en **Pendings**, bajo la categoría de la carpeta. También se comprobó la hoja diaria y que el clic derecho sobre el tablero ofrece **New / Rename / Share / Delete** tanto en la barra lateral como en el listado principal, igual que los tres puntos; el diagrama del listado abrió esas mismas opciones.

Durante la primera comprobación, el guardado cerró el formulario pero la actualización posterior recibió un HTTP 404 en `controller/dashboard/index.php?action=data`. La navegación directa a ese endpoint respondió `ok: true`; después de recargar la aplicación, el guardado y la actualización terminaron correctamente. No se determinó la causa de ese 404 transitorio. No se crearon actividades de prueba ni se desplegaron archivos de aplicación desde esta revisión; la publicación del código continúa mediante Git desde la terminal de la usuaria.

### Hoja diaria de tareas — 25 de noviembre de 2026

Las flechas globales se centraron horizontalmente en `main` (o en el documento ampliado) mediante `.builds/mrm-scroll-center-20261125.zip`, con dos archivos y SHA-256 `329ec41f171f55e70f88aaed14c3795303fddc999ce204b4ec8930dbeadf0322`. Se comprobó localmente que ambas coinciden con el centro del contenido en vista normal y pantalla completa. Chrome confirmó la posición centrada tras publicar y recargar en Hostinger. Evidencia: `tests/.runtime/scroll-centered-hostinger.png`.

Se publicaron las banderitas de categoría y las flechas globales de desplazamiento mediante `.builds/mrm-flags-scroll-20261125.zip` (ocho archivos; SHA-256 `c3a3901d1ebca6014e552d89e30f1b089001c1f5e813d167f54c375f86c6145e`). Cada banderita aparece entre checkbox y tarea, usa el color de la categoría y muestra su nombre hacia la derecha al pasar el mouse, enfocar o tocar. Las flechas globales van al inicio/final de `main`, o del documento ampliado, y se ocultan en cada extremo o cuando no hay contenido que desplazar; el pie de página por sí solo no las activa.

Las doce pruebas de calendario/navegación y las verificaciones de sintaxis pasaron. La revisión local confirmó límites de desplazamiento en la hoja, Ajustes, Inicio sin desbordamiento y pantalla completa; a 390 px, el tooltip permaneció dentro de pantalla y separado del checkbox. En Chrome/Hostinger se confirmó el tooltip **Ejercicios**, las banderitas de distintos colores, la flecha superior como único control al llegar abajo y la inferior como único control al volver arriba. No se modificaron actividades reales. Evidencia: `tests/.runtime/planner-flags-scroll-hostinger.png`.

Se añadió después el control de pantalla completa compartido con los diagramas mediante `.builds/mrm-note-fullscreen-20261125.zip` (dos archivos: plantilla y CSS; SHA-256 `38b7d83f18499d9f7ac4e02dbfbad566af9e6a279375290d8ce605664b1a6b92`). La hoja ampliada alcanza 820 px en escritorio, conserva los controles de tareas y ofrece una **X** para salir. La revisión local en escritorio y móvil confirmó entrada, salida, navegación entre días y recarga en vista normal. Chrome confirmó también en Hostinger el botón inicial desactivado, la X al ampliar, la salida y el regreso a vista normal al recargar desde pantalla completa. Evidencia: `tests/.runtime/planner-note-fullscreen-hostinger.png`.

Se sustituyó la agenda semanal por la hoja ilustrada solicitada, con título **Tareas**, fecha, checkbox con color de categoría, nombre y hora tenue. El paquete `.builds/mrm-note-20261125.zip` contiene ocho archivos de aplicación e imagen, con SHA-256 `8b96a9f467e5f0d4555c7390cf10fae22b1e5cddf72d82d760a4dd3dc19e2324`, y se extrajo en `public_html/MyRemarkableMind`. No requiere migraciones ni incluye configuración, sesiones o datos.

Después de recargar, Chrome mostró las diez actividades existentes del 25 de noviembre. Se verificó en producción que la flecha superior abre el calendario mensual, elegir el 23 vuelve a su hoja, la flecha derecha avanza al 24 y **Today** vuelve al 25. Evidencia: `tests/.runtime/planner-note-hostinger.png`. No se modificaron actividades reales durante estas comprobaciones.

Pasaron las doce pruebas de calendario y navegación, las comprobaciones de sintaxis y `git diff --check`. La revisión visual local cubrió escritorio y móvil de 390 px, texto largo en varios renglones, tachado persistente al completar y tres hojas de una misma fecha antes de avanzar al siguiente día. Retroceder abre la última hoja del día anterior. Las dieciocho tareas temporales se retiraron de la base aislada de pruebas al finalizar.

### Horario semanal y colores por categoría — 25 de noviembre de 2026

Se confirmó que Hostinger todavía entregaba las vistas Day/Week/Month/Year después de recargar. Se publicó `.builds/mrm-week-20261125.zip` en `public_html/MyRemarkableMind`, actualizando únicamente los siete archivos de calendario, estado/navegación y traducciones. No requiere migraciones ni incluye configuración, sesiones o datos.

Chrome confirmó la vista única **Week**, las columnas Monday–Sunday, las 07:00 como primera hora visible y las actividades existentes. La flecha siguiente avanzó de 23–29 de noviembre a 30 de noviembre–6 de diciembre; **Today** volvió a la semana actual. Los bloques toman el color almacenado de su categoría, con una tonalidad suave de fondo y el color exacto en el borde, también en las listas de tareas por categoría. Los hábitos compartidos utilizan el color que acompaña al hábito si su categoría no aparece en el catálogo personal.

La consulta de solo lectura de `habit_categories` en phpMyAdmin confirmó Ejercicios `#CBE8DD`, My day to day `#B8A4D4` y Nutrition `#F8D8C5`, coherentes con las tarjetas de Categorías y el horario publicado. No se crearon ni modificaron actividades de prueba en producción. Pasaron las 10 pruebas de calendario y navegación. Evidencia: `tests/.runtime/planner-week-hostinger.png`.

### Categorías y navegación del planificador — 25 de noviembre de 2026

Se aplicó `020_planner_categories.sql` tanto en local como en Hostinger mediante phpMyAdmin, registrando el SHA-256 `8e6994d38bd11b612a2b9dd9ea609f9d4fd6cc2346096f7657835406fb0f5edc`. Añade la categoría opcional de las tareas y el vínculo de las categorías con carpetas o espacios principales. Los conteos de producción antes y después se conservaron: 42 hábitos, 0 tareas, 14 diagramas y 7 categorías.

Se publicaron los 13 archivos de aplicación y migración del paquete `mrm-categories-20261125.zip`, conservando la configuración y las sesiones. Chrome confirmó el acceso único **My day to day** en la barra lateral, las pestañas **My day to day / Categories**, **Day** como vista inicial y el selector **Category** con carpetas, categorías existentes y **New category**. La pestaña Categories mostró los conteos de hábitos y tareas y la acción **View activities**. No se crearon actividades de prueba en producción.

La validación aislada pasó 297 comprobaciones HTTP, 9 comprobaciones de esquema/código y 4 pruebas JavaScript. Incluye reutilización de categorías de carpetas, cambios de categoría, permisos, compatibilidad con clientes anteriores y reversión completa cuando falla el guardado. La revisión visual local confirmó la creación de una categoría desde el formulario y su recuperación al editar una tarea.

### Planificador — 24 de noviembre de 2026

El error «The database is unavailable» del formulario correspondía a la ausencia de la migración 018 en producción. Se aplicaron mediante phpMyAdmin `018_daily_planner.sql` (SHA-256 `a7b90378878401bdce41d8338f0e1f5ae512a9fb43122e9a47722c7e0bb6ff47`) y `019_planner_recurrence.sql` (SHA-256 `ae33f9f20f6e2065ab2841624c23a4516b9a009e81e23ea0aaaf6bae26233b25`), y se registraron en `schema_migrations`.

La verificación confirmó los campos de recurrencia y vínculo al diagrama en `habits` y `calendar_tasks`. Se conservaron los 42 hábitos y 14 diagramas existentes. Se publicaron los archivos del formulario, modelos, controlador y traducciones mediante el administrador de archivos de Hostinger, conservando la configuración del servidor y las sesiones. El paquete de despliegue quedó en `.builds`, fuera de `public_html`.

La página publicada cargó **My day to day**, el selector **Habit / Task**, las opciones de repetición y **Delete habit** al abrir un hábito existente. No se eliminaron hábitos reales ni se crearon actividades de prueba en producción. En una base aislada pasaron 285 comprobaciones HTTP y las tres pruebas JavaScript del calendario; la revisión visual comprobó el guardado mensual y que el icono del diagrama reabre la misma actividad con su nombre inicial.

El 24 de noviembre de 2026 se revisó un aviso `error_server` que desapareció al reintentar; la usuaria confirmó su recuperación. En Chrome, la petición publicada `controller/dashboard/index.php?action=bootstrap` respondió **200** y el diagrama abrió correctamente. La causa del aviso puntual no quedó identificada. En Hostinger se verificaron la migración 017 y su checksum, los tres campos de colores mediante `SHOW COLUMNS`, un diagrama con diez nodos, cero nodos huérfanos y cero documentos con JSON inválido. No se modificaron datos durante esta comprobación.

### Colores del diagrama — 24 de noviembre de 2026

Se verificó la instalación publicada en Chrome. La base tenía las migraciones 001–016, pero faltaban los campos de colores. Se aplicó `017_diagram_colors.sql` mediante phpMyAdmin y se registró el SHA-256 `a980129b25bcad7cb3ba598808673ebf3cf883daf1aa5268412c1d7fa6e9e7c5`. La comprobación posterior confirmó `color_theme VARCHAR(32)`, `diagram_color CHAR(7)` y `canvas_color CHAR(7)`, todos anulables, y el checksum correcto. Se conservaron un diagrama y diez nodos; no había documentos MindSpace con JSON inválido.

El sitio HTTPS cargó el acceso, el espacio y el diagrama después del inicio de sesión. El selector publicado mostró las siete combinaciones y los controles de color del diagrama y del fondo. La aplicación confirmó «Diagram saved» y recuperó los colores al recargar. Una consulta posterior confirmó el tema y un fondo personalizado guardados en MySQL. Durante la comprobación, la usuaria también probó combinaciones; esos cambios explicaron las diferencias entre recargas. No se desplegaron archivos de aplicación durante esta revisión.

La migración 007 se aplicó mediante Chrome/phpMyAdmin el 23 de noviembre de 2026 tras comprobar que faltaba `node_width`. Se registró su checksum, se conservaron un diagrama y ocho nodos, y la usuaria confirmó que el guardado funciona al reintentar. Si una pestaña conserva cambios pendientes tras un error, usar «Try again» antes de recargar para recuperarlos.

1. Abre `/MyRemarkableMind/` y comprueba que aparece el formulario de acceso.
2. Verifica que `/MyRemarkableMind/config/local.php`, `/MyRemarkableMind/storage/initial-access.txt` y `/MyRemarkableMind/.git/config` devuelven 403/404.
3. Inicia sesión, cambia el idioma, recarga y confirma que se conserva.
4. Comprueba la categoría Ejercicios y la rutina de noviembre/diciembre.
5. Comprueba que Aleina puede alternar entre el panel personal y administración.
6. Verifica que las cookies de sesión sean `Secure`, `HttpOnly` y `SameSite=Lax`.
7. Excluye `/MyRemarkableMind/`, `/MyRemarkableMind/api.php` y `/MyRemarkableMind/controller/` del almacenamiento en caché de páginas/CDN. Las respuestas privadas envían `Cache-Control: no-store, private`.
8. Conserva copias de seguridad de MySQL. Para futuras actualizaciones, respalda primero y ejecuta `php bin/migrate.php`; no vuelvas a importar una copia inicial encima de datos existentes.

### Metas personales — 27 de noviembre de 2026

Aplicada `025_personal_goals.sql` en la base local `mi_rutina` y en Hostinger `u348170507_habits`, con SHA-256 `b7d2db2c51b0706ecf0cbeb5ed4192f8a562a2ca22c7f9bf789a53db1b02f1c1`. Crea `goals`, `goal_tasks`, `goal_habits` y `goal_cards`; todas las asociaciones se eliminan en cascada al borrar la meta, sin borrar las actividades. Se ejecutó únicamente esta migración y su registro, sin semillas ni reimportación de datos. Los conteos de Hostinger permanecieron en 48 hábitos y 4 tareas; los locales, en 40 hábitos y 0 tareas.

El código añade My Goals / Mis metas, selección múltiple de metas en tareas, hábitos y tarjetas propias de Kanban, y una sección en My Progress con el total de metas, las tareas cumplidas y sus fechas. El avance distingue las actividades con al menos un cumplimiento de la cantidad de aportes recurrentes. Las tarjetas vinculadas a actividades programadas se cuentan por el historial de la actividad, sin duplicarlas. El usuario puede marcar una meta como lograda. Las metas y sus asociaciones son privadas y no se incluyen en el contenido compartido del tablero.

Los archivos de aplicación quedan en el proyecto para el despliegue habitual por Git de la usuaria. Debe incluirse `.htaccess`, que permite el nuevo endpoint `controller/goals/index.php`, además de las nuevas carpetas `controller/goals`, `model/goals` y `view/goals`. No se subió código mediante el administrador de archivos. La verificación visual se realizó en una base aislada con datos de prueba.

Validación final: 385 comprobaciones HTTP, 9 de esquema/código y 45 pruebas JavaScript. En navegador se verificó crear, editar y eliminar metas, crear una meta sin cerrar el formulario de una tarea, asignar dos metas a una actividad, registrar su cumplimiento, guardar una tarjeta Kanban en Done y conservar los aportes al recargar My Progress.

### Reordenar filas de hojas de cálculo — 27 de noviembre de 2026

Los números de fila permiten seleccionar una fila completa y arrastrarla a otra posición. Se muestra el cursor de mano y una línea de inserción; también se admite Alt + Arriba/Abajo. El endpoint `moveSpreadsheetRow` guarda el movimiento con control de versión y permiso de edición. Mueve las celdas, formatos y comprobantes adjuntos, ajusta las referencias de las fórmulas y reconstruye los cálculos de las plantillas. La fila de encabezados de una plantilla permanece fija; en hojas en blanco también se puede mover la primera fila.

Este cambio reutiliza las tablas existentes y no requiere una migración en Hostinger. Los archivos quedan preparados para el despliegue habitual por Git. Validación aislada: 397 comprobaciones HTTP, 9 de esquema, 13 de transformación de filas y 90 pruebas JavaScript. El navegador confirmó el arrastre de la fila 3 a la posición 2, el cursor `grab`, la selección completa y la conservación del nuevo orden al recargar.

## Referencias oficiales consultadas

- [Crear una base MySQL](https://www.hostinger.com/support/1583542-how-to-create-a-new-mysql-database-in-hostinger/)
- [Importar y configurar una base](https://www.hostinger.com/support/1864324-how-to-upload-and-set-up-your-database-at-hostinger/)
- [Seleccionar la versión de PHP](https://www.hostinger.com/support/1575755-how-to-change-the-php-version-of-your-hostinger-hosting-plan/)
- [Envío PHP en Hostinger](https://www.hostinger.com/tutorials/how-to-send-emails-using-php-mail-function/)
- [Límites del alojamiento](https://www.hostinger.com/support/6976044-parameters-and-limits-of-hosting-plans-in-hostinger/)
