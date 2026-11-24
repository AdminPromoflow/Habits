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
