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

Para la selección voluntaria de categorías, aplica `004_category_choices.sql` antes de desplegar esa versión. Conserva inscripciones de categorías globales que ya tengan hábitos/rutinas; las categorías privadas propias permanecen disponibles. El catálogo global se conserva en Hostinger, mientras que cada usuario elige en Ajustes cuáles añadir. En Mis hábitos se muestran las categorías con hábitos, y cada una abre su tablero semanal.

Para el editor de diagramas, aplica las migraciones pendientes hasta `007_diagram_node_width.sql` antes de desplegar los archivos nuevos. La 005 crea `diagrams`, la 006 añade los nodos y la 007 sus anchos individuales. Si falta una tabla o columna requerida, la consulta o el guardado devuelve `error_database`. El migrador registra el nombre y el SHA-256 de cada archivo en `schema_migrations`.

Sube los archivos de aplicación, incluidos `.htaccess`, `assets`, `app`, `controller`, `model`, `view` y `translations`. Los archivos `config/local.php` y el contenido de `storage` no se versionan. No despliegues `tests/.runtime`, archivos SQL privados ni la carpeta `.git` a una ruta pública.

Comprueba que la estrategia de despliegue de Hostinger conserva archivos no versionados. Si reemplaza todo `public_html/MyRemarkableMind`, conserva la configuración y las sesiones fuera de la carpeta reemplazada y proporciona sus rutas/valores mediante variables `RUTINA_DB_*`, `RUTINA_APP_URL`, `RUTINA_SESSION_PATH` y `RUTINA_SECURE_COOKIES=1`.

## Reparación de diagramas del 23 de noviembre de 2026

Se comprobó mediante Chrome y phpMyAdmin que producción tenía 21 tablas y las migraciones `001`–`004`, pero no `diagrams`. Se aplicó únicamente `005_diagrams.sql` y se registró su checksum `485f348de5d73507f7b262655be8bea654df2537890c47fb72a7f33da00184cb` en `schema_migrations`.

La comprobación posterior mostró 22 tablas, checksum correcto y la clave foránea `diagrams.owner_user_id → users.id` con `ON DELETE CASCADE`. Los conteos comparados antes y después se conservaron: 1 usuario, 41 hábitos, 1 rutina y 1 registro de cumplimiento. La tabla nueva quedó vacía. No se importaron datos iniciales ni se desplegaron archivos de aplicación durante esta reparación.

El modelo documentado desde las migraciones está en [database-model](database-model/). La página pública cargó el formulario de acceso y la usuaria confirmó posteriormente que, al iniciar sesión, el panel volvió a abrir correctamente y desapareció `error_database`.

## Verificación en producción

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
