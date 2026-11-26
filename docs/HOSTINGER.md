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

### Hoja diaria de tareas — 25 de noviembre de 2026

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

## Referencias oficiales consultadas

- [Crear una base MySQL](https://www.hostinger.com/support/1583542-how-to-create-a-new-mysql-database-in-hostinger/)
- [Importar y configurar una base](https://www.hostinger.com/support/1864324-how-to-upload-and-set-up-your-database-at-hostinger/)
- [Seleccionar la versión de PHP](https://www.hostinger.com/support/1575755-how-to-change-the-php-version-of-your-hostinger-hosting-plan/)
- [Envío PHP en Hostinger](https://www.hostinger.com/tutorials/how-to-send-emails-using-php-mail-function/)
- [Límites del alojamiento](https://www.hostinger.com/support/6976044-parameters-and-limits-of-hosting-plans-in-hostinger/)
