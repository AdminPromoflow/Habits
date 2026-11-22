# MI RUTINA 3.0

Plataforma bilingüe de hábitos, rutinas y colaboración. PHP 8.2+, MySQL 8.0.16+ / MariaDB 10.4+, HTML, CSS y JavaScript; sin Node.js, Composer ni Docker en producción.

## Abrir la instalación local

- Aplicación: http://localhost:8782
- Cuenta inicial: `AleinaRoseroy@gmail.com`, con roles `admin` y `user`.
- La contraseña se elige con el enlace privado de un solo uso en `storage/initial-access.txt`. No existe una contraseña predeterminada.
- Iniciar el servidor: `php -S 127.0.0.1:8782 router.php`, desde esta carpeta, con PHP 8.2 o superior.
- En este Mac, PHP compatible está en `/opt/homebrew/bin/php`. El PHP de Apache/XAMPP es 8.0 y no es la versión de producción recomendada.

## Instalación nueva

1. Crea una base MySQL vacía y un usuario exclusivo con acceso a ella.
2. Copia `config/example.php` a `config/local.php` y completa los datos reales. No subas `local.php` a Git.
3. Ejecuta `php bin/install.php` para aplicar migraciones, cargar categorías/plantillas y crear una única cuenta de Aleina.
4. Ejecuta `php bin/import-routine.php` para importar la rutina solicitada.
5. Abre el enlace de `storage/initial-access.txt` y elige la contraseña de Aleina.

El instalador es CLI; no existe un instalador público. Volver a ejecutarlo no modifica la contraseña, preferencias ni el historial. Las migraciones tienen un registro de versión y checksum; nunca edites una migración ya aplicada.

## Incluye

- Autenticación por sesiones, cambio de contraseña y múltiples roles.
- Idioma inglés/español persistente en MySQL; cookie de idioma para visitantes.
- Categorías globales y privadas; aprobación/rechazo con comentarios.
- Rutinas dentro de categorías, hábitos con días/horarios/metas y registro individual por fecha.
- Calendario, progreso parcial, rachas y registros privados de peso.
- Invitaciones internas a hábitos, selección de hábitos o categorías completas.
- Permisos lector, participante y editor; aceptación previa y revocación inmediata en el servidor.
- Consentimiento independiente para mostrar el progreso de cada participante.
- Administración de usuarios, categorías, plantillas, estadísticas agregadas y configuración.
- Diseño pastel adaptable a móvil y escritorio, tema claro/oscuro.

## Rutina incorporada

Categoría privada **Ejercicios** → **Mi semana de entrenamiento** → 40 ejercicios semanales, ocho por día de lunes a viernes, desde el 23/11/2026 hasta el 31/12/2026. Son 232 actividades programadas en ese intervalo. Se conservaron nombres, enfoques, horas, series y repeticiones del PDF; no se inventó historial de completados.

El importador utiliza identificadores de origen para no duplicar rutinas ni ejercicios. Acepta opcionalmente `completions` por ejercicio, con `date`, `amount` y `note`, y nunca reemplaza registros existentes.

## Pruebas

```sh
PHP_BIN=/opt/homebrew/bin/php python3 tests/functional.py
```

Requiere Python 3, PHP con PDO MySQL y un usuario de MySQL autorizado para crear una base aislada `mi_rutina_test_*`. Configura `RUTINA_TEST_DB_USER` y `RUTINA_TEST_DB_PASSWORD` según tu entorno; el valor predeterminado `root` sin contraseña corresponde únicamente al XAMPP local. No usa la base real de Aleina.

`tests/constraints.php` verifica restricciones SQL, consistencia del calendario del PDF y diccionarios. `tests/serve.py` permite revisar visualmente la última base de pruebas en el puerto 8783. Los datos de pruebas quedan fuera de Git.

## Documentación

- [Instalar y conectar en Hostinger](docs/HOSTINGER.md)
- [Modelo de acceso y decisiones de privacidad](docs/SECURITY.md)

## Exportar para una instalación vacía

`php bin/export.php` crea `storage/hostinger-mi-rutina.sql` con el esquema y los datos reales, en una instantánea consistente. Contiene datos privados y hashes de autenticación: no se publica en Git ni en el directorio web. Se importa solamente en una base **nueva y vacía**, no encima de una instalación existente.
