# Acceso y privacidad

## Autenticación

Contraseñas con `password_hash`/`password_verify`; sesiones regeneradas al entrar/salir; cookies HttpOnly y SameSite; Secure en producción; token CSRF en cada operación de escritura. Las rutas de escritura aceptan POST JSON; consultas con PDO y parámetros preparados. Los intentos de login, registro, invitación, cambio de contraseña y solicitudes se limitan en MySQL. Los errores no muestran credenciales ni consultas SQL.

La cuenta inicial de Aleina solo se crea desde CLI. Su correo está reservado en el registro público. La activación requiere un token aleatorio cuyo hash y fecha de caducidad se almacenan en MySQL; no hay contraseña predeterminada. Un cambio de contraseña o suspensión invalida otras sesiones con `auth_version`.

La recuperación pública envía un enlace de un solo uso que vence en 30 minutos. MySQL conserva únicamente su hash SHA-256 y la versión de autenticación; pedirlo no bloquea el acceso existente. Al confirmar la nueva contraseña se invalidan las sesiones, los demás enlaces y la activación inicial. No se inicia sesión automáticamente. Las cuentas suspendidas no pueden usar la recuperación. La respuesta no revela si el correo existe y se limitan solicitudes por IP, dirección y plataforma.

En Hostinger se utiliza el transporte PHP `mail()` con un remitente del dominio, configurable mediante `mail_from`. La aceptación por el transporte no garantiza la llegada al buzón; los fallos se registran sin direcciones, contraseñas ni tokens. El transporte de archivos solo funciona en el servidor PHP de pruebas con una base `mi_rutina_test_*`, dentro de una carpeta bloqueada por HTTP. Las invitaciones y avisos de colaboración siguen entregándose **dentro de la aplicación**. El registro no incluye una verificación inicial de titularidad del correo.

## Propiedad y permisos

`habits.owner_user_id` nunca se modifica mediante la API. Un administrador puede gestionar la plataforma pero no leer hábitos, notas, categorías privadas o historial de otros usuarios salvo por una invitación aceptada como usuario normal.

- Lector: detalles y progreso permitido, sin escrituras.
- Participante: detalles y su propio progreso.
- Editor: además edita nombre, descripción, horarios y metas. No mueve categorías/rutinas ajenas, no archiva el original y no gestiona invitaciones.
- Propietario: administra contenido y permisos.

Las completaciones se identifican por `(habit_id,user_id,completed_on)`. El usuario se toma de la sesión, jamás del cliente. La meta del registro se conserva en `goal_at_time`, para que un cambio de meta no sobrescriba el historial. Las notas y los registros de peso son siempre privados. No se permite registrar progreso futuro ni fuera de los días programados.

## Invitaciones

No se ofrece un directorio público de correos. El propietario introduce una dirección exacta. Se devuelve el mismo resultado y se guarda un comprobante pendiente incluso si no hay una cuenta receptora; los comprobantes no exponen el identificador interno de entrega. La aceptación o el rechazo es una acción del destinatario autenticado. Las invitaciones a correos que todavía no tienen cuenta no se activan automáticamente al registrarse: el propietario debe revocar el comprobante y reenviar la invitación.

Los permisos efectivos se consultan en `habit_shares` en cada petición. `habit_collaborators` es un registro derivado, nunca la fuente de autorización. Las escrituras bloquean los registros pertinentes durante la transacción. La revocación bloquea el siguiente acceso al servidor; una pantalla abierta se actualiza al recuperar el foco o cada 15 segundos.

Las categorías compartidas guardan una instantánea en `share_habits`. Los hábitos futuros solo se incluyen si `include_future` está activo. Se comprueba el propietario y la categoría actual de cada hábito. Al mover un hábito fuera, se elimina su entrada de la instantánea: moverlo de vuelta no reactiva silenciosamente ese acceso. Una concesión individual vigente sigue siendo independiente de una concesión por categoría.

Los índices únicos condicionales impiden invitaciones activas duplicadas. Las restricciones SQL obligan a elegir exactamente hábito o categoría y prohíben invitaciones a uno mismo.

## Progreso colaborativo

El propietario determina qué parte de su progreso es visible en una invitación. Cada participante mantiene un consentimiento independiente, oculto por defecto. Se aplica la restricción más fuerte entre el consentimiento del participante y la visibilidad de la invitación del observador. Resumen no incluye fechas ni registros; detallado sí incluye cantidad y meta por fecha, nunca notas.

El promedio de grupo usa solo miembros autorizados, visibles y con días programados en el período. No permite inferir valores ocultos por inclusión en agregados. El período del participante empieza cuando se une, según su zona horaria. Las estadísticas usan el calendario vigente y la meta registrada en cada completado; editar retrospectivamente el calendario puede cambiar los días esperados, sin borrar registros históricos.

## Operación

Usa un usuario exclusivo de base de datos. Las credenciales locales y copias privadas están excluidas de Git y bloqueadas por `.htaccess`/router. El servidor PHP integrado es solo para desarrollo. En producción se utiliza HTTPS y Apache/LiteSpeed; no se necesita un proceso Node persistente.

Las migraciones son aditivas y no contienen DROP TABLE, TRUNCATE ni borrado de historial. El registro de checksum evita cambiar silenciosamente migraciones ya aplicadas. Antes de aplicarlas a un esquema ajeno o una versión anterior no incluida en este repositorio, revisa su compatibilidad y respalda los datos.
