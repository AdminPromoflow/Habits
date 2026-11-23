# Verificación realizada

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
