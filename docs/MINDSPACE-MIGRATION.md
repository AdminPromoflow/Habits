# Actualización de MindSpace

Sube el código de `view/mindspace/`, `model/mindspaces/`, `controller/mindspaces/`, los manifiestos/rutas y los cambios de integración de Home. Conserva la configuración privada de cada servidor.

Ejecuta en el directorio del proyecto, con PHP 8.2 o posterior:

```sh
php bin/migrate.php
```

La migración 013 crea `mindspaces` y `mindspace_items`. Genera un MindSpace privado por usuario e incorpora cada diagrama existente como elemento, conservando su identificador, contenido, enlaces y fechas. No cambia las tablas de usuarios, hábitos ni diagramas existentes. La migración 014 incorpora `parent_id` y el tipo carpeta para permitir carpetas anidadas.

El migrador aplica únicamente archivos pendientes y registra sus SHA-256. No importes una copia inicial de la base encima de una instalación existente. No edites migraciones aplicadas.

En phpMyAdmin, si no se dispone de SSH, ejecuta el contenido exacto de cada SQL pendiente en orden y registra su nombre/checksum en `schema_migrations`. Comprueba primero qué migraciones y tablas existen; una aplicación parcial debe revisarse antes de volver a ejecutar el SQL.

Tras aplicar ambas, recarga Inicio: deben aparecer MindSpace, sus pestañas, el botón + y el explorador de carpetas. El código mantiene el editor anterior mientras la columna `mindspace_items.parent_id` no exista.

Verifica una carpeta con una subcarpeta, crea un documento dentro, muévelo y recarga. Las rutas de carpetas son independientes de la jerarquía de enlaces entre diagramas. El servidor valida la propiedad de cada elemento y destino, rechaza ciclos y protege las ediciones concurrentes mediante versiones.

Pruebas: `node tests/mindspace.cjs` y `PHP_BIN=/opt/homebrew/bin/php python3 tests/functional.py`; esta última crea una base aislada, sin usar los datos reales.

## Verificación en Hostinger, 24 de noviembre de 2026

Se confirmó que producción tenía migraciones 001–012 y no tenía las tablas de MindSpace. Se aplicaron 013 y 014 mediante la sesión existente de phpMyAdmin y se registraron sus checksums originales:

- 013: `97a6a5de7f7375d467cc58cef918248e617bece1190a3feb410455e499d46bc3`
- 014: `4a32209a10ef5db158dc3e7d0517aae90e03baa3bde82fa62f92b1bd2b66b26d`

Antes y después: 3 diagramas y 13 nodos. Los 3 diagramas quedaron referenciados en MindSpace. Se verificó en la sesión de Safari de `aleinarossui.com/MyRemarkableMind/` que aparecen las pestañas, el explorador y New folder. Evidencia local: `tests/.runtime/mindspace-production.png`.


## Revisión del menú contextual en Hostinger, 24 de noviembre de 2026

Se consultó directamente la base `u348170507_habits` mediante la sesión de phpMyAdmin. Servidor: MariaDB 11.8.9. Las migraciones 013 y 014 coinciden con los SHA-256 locales. Se verificaron las dos tablas InnoDB, las seis columnas de `mindspaces`, las doce de `mindspace_items` y las cuatro claves foráneas de MindSpace. No se encontraron padres inválidos, referencias entre carpetas de distintos espacios, diagramas sin elemento ni contenido JSON inválido. Había un espacio, una carpeta y tres documentos guardados.

Los menús contextuales, el renombrado y la eliminación utilizan este esquema existente: no necesitan una migración nueva. Esta revisión ejecutó únicamente consultas de lectura sobre producción; no probó eliminaciones sobre contenido real.

**Pendiente de publicación:** el HTML servido por `https://aleinarossui.com/MyRemarkableMind/` todavía no anuncia `renameMindSpace`, `deleteMindSpace` ni `deleteMindSpaceItem` en `request-routes`. Por tanto, la compatibilidad de la base está comprobada, pero las nuevas acciones no están disponibles todavía en la versión publicada.

Se preparó `tests/.runtime/hostinger-sidebar-context-2026-11-24.zip` con los ocho archivos de aplicación que deben actualizarse juntos:

- `controller/routes.php`
- `controller/mindspaces/mindspaces.php`
- `model/mindspaces/mindspaces.php`
- `model/users/auth.php`
- `translations/en.php`
- `translations/es.php`
- `view/mindspace/mindspace.js`
- `view/mindspace/mindspace.css`

El paquete conserva las rutas relativas y no incluye configuración, contraseñas, base de datos ni archivos de prueba. No se publicó durante esta verificación. Al publicarlo, conservar `config/local.php`, `config/database-password.txt` y `storage`, y recargar la aplicación para obtener las rutas y los recursos nuevos.

## Enlaces desde diagramas a documentos y selecciones

El paquete acumulativo `tests/.runtime/hostinger-mindspace-links-2026-11-24.zip` reemplaza al paquete anterior para publicar juntos los menús de la barra lateral y los enlaces a hojas, celdas, tarjetas, hábitos, notas y carpetas. Incluye los ocho archivos anteriores y estos ocho adicionales:

- `controller/config/assets.php`
- `model/diagrams/diagrams.php`
- `view/home/diagram-links.js`
- `view/home/home.js`
- `view/home/home.css`
- `view/mindspace/link-targets.js`
- `view/mindspace/editors.js`
- `view/mindspace/mindspace.php`

No requiere SQL nuevo: utiliza `diagram_nodes.link_json` (012) y las tablas de MindSpace (013–014), ya verificadas en Hostinger. El código valida cada destino nuevo contra su cuenta y contenido. No se realizaron escrituras de prueba en producción ni se publicó este paquete.

Validación local: 324 pruebas JavaScript, 226 comprobaciones HTTP en una base MySQL aislada y siete comprobaciones de esquema/código. En el navegador se comprobó el enlace a B3, la edición de la celda y el regreso al cuadro de origen conservando el cambio, además de abrir una tarjeta concreta de Kanban resaltada. Al publicar, subir los 16 archivos juntos y recargar la aplicación; la versión antigua del servidor no acepta el nuevo formato de enlace.

El mismo paquete se actualizó para mostrar una flecha de regreso dentro de cada celda, tarjeta o hábito enlazado. Las flechas se calculan a partir de los enlaces existentes: no agregan escrituras ni requieren cambios en la base. Si varios cuadros enlazan el mismo destino, la flecha abre un selector de orígenes. Se verificaron 197 pruebas JavaScript de MindSpace, diagramas y navegación, y en el navegador se probó el regreso desde B3 con clic y teclado, conservando la edición y enfocando el cuadro de origen. Sigue pendiente publicar el paquete en Hostinger.

La actualización de columnas añade una vista previa de Scrum/Kanban por estado, con sus tarjetas dentro, y enlaces `target: {type: 'column', id: 'doing'}`. Incluye columnas vacías y flechas de regreso en su encabezado. Se verificaron 200 pruebas JavaScript, 228 comprobaciones HTTP en MySQL aislado y siete de esquema/código; en el navegador se guardó y reabrió un enlace a En curso, se comprobó el foco y el regreso, y se alternó entre elegir columna y tarjeta. Se actualizó el mismo ZIP de 16 archivos. No requiere SQL nuevo, pero sí publicar juntos el servidor y la interfaz que aceptan este tipo de destino.

La unificación **Kanban - Scrum** deja una sola opción de creación y cuatro columnas iniciales: **Pending, To Do, In Progress y Done**. El botón **+** inferior derecho añade columnas con UUID y nombre único, hasta 50 en total. Se guardan en `mindspace_items.content_json.columns`; las tarjetas y los enlaces usan esos IDs. Los tableros antiguos reciben las cuatro columnas al leerse, conservando sus tarjetas, sprint y enlaces. El ID interno `backlog` sigue identificando Pending. La API acepta `scrum` como alias de `kanban`, y los tableros antiguos se normalizan al guardarse. Si un cliente antiguo omite `columns`, el servidor conserva las columnas guardadas. No requiere migración SQL.

Validación de esta actualización: **203 pruebas JavaScript, 233 comprobaciones HTTP y nueve comprobaciones de esquema/código**, incluida la lectura y el guardado de datos antiguos. En el navegador se verificó la opción única, las cuatro columnas iniciales, la creación de Review desde **+**, el guardado de una tarjeta en ella, la recarga y el traslado a Pending. El ZIP acumulativo de 16 archivos se actualizó; su publicación en Hostinger sigue pendiente.


## Espacios compartidos y permisos independientes

Las migraciones **015_mindspace_shares.sql** y **016_mindspace_share_permissions.sql** crean las invitaciones a espacios, carpetas o documentos, sus cuatro permisos independientes y la relación con la invitación original al volver a compartir. Aplicarlas después de 014 con PHP 8.2+ mediante `php bin/migrate.php`. No modifican el contenido de los documentos. Las invitaciones existentes reciben permisos de lectura, sin ampliación automática de acceso.

Publicar juntos los cambios de rutas, controladores de Sharing/Dashboard, seguridad, modelos, recursos, traducciones e interfaz. El nuevo recurso `view/sharing/workspace.js` debe estar incluido en `controller/config/assets.php`. Una instalación sin 016 muestra un error de configuración al compartir y conserva el resto de MindSpace.

El acceso al espacio compartido usa `sharedMindSpace` y `sharedMindSpaceAction`; los endpoints privados conservan su comprobación de propiedad. Cada operación valida los permisos y el alcance vigente, incluidos sus antecesores. Los destinos de movimiento deben estar dentro de ese alcance. Mover un recurso fuera de la carpeta que daba acceso o revocar la invitación original cierra las invitaciones dependientes. Las escrituras mantienen las versiones de los documentos.

Verificar All, Shared with me, Shared by me e Invitations; elegir un participante; abrir y editar una nota compartida; recargar; regresar al espacio propio; probar permisos por separado; cambiar permisos y revocar; comprobar el contador rojo de notificaciones en ambas cuentas. El correo requiere el transporte `mail` y URL HTTPS de esa instalación; la base aislada de pruebas utiliza salida a archivos y no envía correos externos.

Pruebas: `node --test tests/mindspace.cjs tests/diagrams.cjs tests/sharing.cjs` y `PHP_BIN=/opt/homebrew/bin/php python3 tests/functional.py`. Esta actualización se verifica localmente; no constituye una publicación en Hostinger.

Validación local del 24 de noviembre de 2026: migraciones 015 y 016 aplicadas sin reemplazar datos; 192 pruebas JavaScript, 244 comprobaciones HTTP y nueve comprobaciones de esquema/código aprobadas. Sintaxis PHP y JavaScript correcta. En el navegador se verificaron las cuatro pestañas, participantes, New/Rename/Share/Delete, las casillas independientes, guardado y recarga de notas compartidas, movimiento con permiso Move sin Edit, bloqueo de edición de diagramas, actualización de permisos y restauración del catálogo privado al salir. Evidencia: `tests/.runtime/sharing-permissions.jpg`. El correo saliente local está desactivado (`mail_transport=disabled`); las notificaciones internas están verificadas.

## Corrección en Hostinger, 24 de noviembre de 2026

El formulario publicado devolvía `error_mindspace_sharing_setup`: la interfaz estaba actualizada, pero `u348170507_habits` solo tenía las migraciones hasta 014 y no existía `mindspace_shares`. Se aplicaron los archivos originales 015 y 016 mediante la sesión de phpMyAdmin y se registraron sus checksums:

- 015: `a9bad33c6ad0f0314a33fd4f468fff88321e4fa22b8dadce29ea72bd030b9c8b`
- 016: `de8df8f0b112e0b146e45ea8e2d979bbfc7ce22ceb7d5c29ff841c1a63ac5d07`

La comprobación posterior confirmó ambos checksums y las cuatro columnas de permisos. Antes y después se conservaron los conteos: un usuario, dos espacios, un elemento, cero diagramas y cero nodos. No se envió la invitación del formulario abierto ni se alteró su texto. El usuario puede reintentar el envío; el mensaje anterior permanece en el formulario hasta la siguiente solicitud. Evidencia: `tests/.runtime/hostinger-sharing-migrations-015-016.png`.


## Destinatarios pendientes y navegación lateral

Shared by me y All incluyen ahora las invitaciones enviadas pendientes. El emisor abre el contenido original con sus propios permisos antes de la aceptación; no se amplía el acceso del destinatario. La sección lateral Sharing & collaboration se expande y conserva ese estado por cuenta. Lista participantes de ambas direcciones e incluye invitaciones pendientes. Los nombres no disponibles se muestran como correos, sin revelar información de cuentas que aún no aceptaron. Seleccionar una persona desde la barra lateral reúne sus recursos de ambas direcciones; una invitación recibida pendiente lleva a Invitations.

Al seleccionar una persona con un único workspace se abre directamente el editor. Si hay varios recursos se muestran en una lista. El workspace abierto muestra el árbol de MindSpace dentro de la barra lateral bajo el participante, con carpetas, archivos y sus controles. Cambiar de participante guarda primero los cambios y se cancela si el guardado falla.

Validación local: 44 pruebas JavaScript, 245 comprobaciones HTTP y nueve comprobaciones de esquema/código. En el navegador se verificaron destinatarios pendientes, edición antes de aceptar, guardado al cambiar de persona, ambas direcciones y expansión/contracción de la barra lateral. Evidencia: `tests/.runtime/sharing-participant-sidebar.jpg`.

Paquete preparado: `tests/.runtime/hostinger-sharing-sidebar-2026-11-24.zip`, con seis archivos de interfaz; no contiene configuración ni datos y no requiere SQL adicional. Este cambio de interfaz todavía no se ha publicado en Hostinger.

La edición de títulos con doble clic se aplica a los encabezados del área de trabajo (MindSpace y carpeta/documento), con selección completa, Enter o desenfoque para guardar y Escape para cancelar. Los permisos y las versiones se comprueban mediante las rutas existentes; el contenido pendiente se guarda antes de renombrar. Un fallo conserva el texto y bloquea la navegación hasta guardar o cancelar. No necesita migración SQL. Paquete incremental sobre la aplicación actual: `tests/.runtime/hostinger-title-edit-2026-11-24.zip` (cinco archivos de interfaz y traducciones). Pendiente de publicación en Hostinger.

Validación: 223 pruebas JavaScript aprobadas y sintaxis PHP/JavaScript correcta. En el navegador se comprobó clic simple sin edición, doble clic con selección completa, renombrado y recarga de diagrama, hoja y carpeta, guardado al hacer clic fuera y cancelación con Escape. Evidencia: `tests/.runtime/mindspace-title-edit.jpg`.

El selector de fechas abre un calendario desde las celdas Fecha/Date y las fechas de proyectos, con el día actual preseleccionado en celdas vacías, OK para confirmar y guardado directo al elegir un día. Las fechas existentes se conservan al abrir y se guardan en formato `AAAA-MM-DD` usando el contenido de la hoja existente; no requiere SQL. El paquete incremental `tests/.runtime/hostinger-date-picker-2026-11-24.zip` contiene seis archivos de interfaz/traducciones y sigue pendiente de publicación. En el navegador se verificaron hoy, otro día, cancelación, cambio de mes/año, 29 de febrero de 2028 y persistencia al recargar. Evidencia: `tests/.runtime/mindspace-date-picker.jpg`. Las pruebas `tests/mindspace-dates.cjs` cubren el cambio de día en Bogotá, años bisiestos, permisos y errores de guardado.

## Plantillas de hojas de cálculo

Crear una hoja abre un selector con Libro de contabilidad, Presupuesto mensual, Inventario, Seguimiento de proyectos y Hoja en blanco. El endpoint de creación genera la plantilla de forma atómica y conserva la idempotencia de `client_key`. Las hojas anteriores siguen siendo cuadrículas libres. Las nuevas guardan `template` y `template_language` dentro de `mindspace_items.content_json`; no hay migración SQL.

El servidor conserva la plantilla si un cliente antiguo omite sus metadatos y restablece sus encabezados y fórmulas calculadas al guardar. La interfaz protege esas celdas y extiende las fórmulas al añadir o pegar filas. El libro calcula cada movimiento en centavos y muestra saldo acumulado y totales en vivo. Las fechas válidas determinan los colores mensuales; los errores de importes se propagan a los saldos afectados y al resumen. Presupuesto calcula disponible e Inventario calcula el valor de las existencias. Los permisos y versiones del espacio compartido siguen vigentes.

Validación: 207 pruebas JavaScript de MindSpace, Sharing y diagramas; 255 comprobaciones HTTP y nueve de esquema/código en una base aislada. Prueba de navegador: Crear → selector → libro, movimientos de cuatro meses, errores de importes, pegado de seis columnas sin sobrescribir saldos, ampliación de filas, guardado y recarga, presupuesto y temas claro/oscuro. También se comprobó la ventana de 390 px, con los totales arriba y la tabla desplazable sin desbordar la página. Evidencias: `tests/.runtime/spreadsheet-template-picker.jpg`, `tests/.runtime/spreadsheet-ledger.jpg`, `tests/.runtime/spreadsheet-ledger-dark.jpg` y `tests/.runtime/spreadsheet-ledger-mobile.jpg`.

Paquete acumulativo preparado: `tests/.runtime/hostinger-spreadsheet-templates-2026-11-24.zip`. Incluye los seis archivos del paquete de navegación compartida y los archivos de modelos, traducciones y editor requeridos por las plantillas. Publicar juntos para que creación, validación y presentación utilicen la misma versión. No contiene configuración privada ni datos. Pendiente de publicación en Hostinger.

Comprobación directa en Hostinger: MariaDB `11.8.9-MariaDB-log`, tabla `mindspace_items` con motor InnoDB, `content_json` de tipo MEDIUMTEXT y las siete columnas requeridas por creación/guardado presentes (`mindspace_id`, `parent_id`, `kind`, `name`, `content_json`, `client_key`, `version`). La consulta devolvió cero documentos con JSON inválido y validó el JSON de una plantilla de contabilidad. Fue una consulta de solo lectura; no se añadieron movimientos ni hojas de prueba en producción. Evidencia: `tests/.runtime/hostinger-spreadsheet-database.png`. El guardado de extremo a extremo se comprobó en la base local aislada; queda comprobarlo en la web después de publicar los archivos.
