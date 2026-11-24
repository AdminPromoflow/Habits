# MyRemarkable Mind

Plataforma bilingüe de ideas, diagramas, hábitos, rutinas y colaboración. PHP 8.2+, MySQL 8.0.16+ / MariaDB 10.4+, HTML, CSS y JavaScript; sin Node.js, Composer ni Docker en producción.

## Estructura por módulos

El proyecto sigue la separación de vistas, controladores, seguridad y modelos de Dot63. Cada pantalla tiene su plantilla PHP/HTML, su JavaScript y sus estilos en `view/`. El HTML está en plantillas `<template>`: los cambios de pantalla y el editor del diagrama se dibujan en la página actual, sin navegación ni recarga.

```text
index.php                         Entrada de la aplicación
view/
  layout/                         Documento HTML, navegación y marco de la aplicación
  home/                           Inicio: botón y nodo editable del diagrama
  habits/                         Hábitos y sus formularios
  categories/                     Categorías y suscripciones
  category_week/                  Tablero semanal por categoría
  routines/                       Rutinas
  calendar/                       Calendario
  progress/                       Progreso
  sharing/                        Colaboración
  profile/                        Preferencias de la cuenta
  auth/                           Acceso y recuperación de contraseña
  admin/                          Administración
  global/                         AJAX, eventos delegados y componentes compartidos
controller/
  diagrams/index.php              Endpoint AJAX público del módulo
  diagrams/diagrams.php           Controlador de acciones del diagrama
  habits/, categories/, ...      Controladores de los demás módulos
  security/                      Sesiones, CSRF, permisos, validación y errores
  config/                        Conexión PDO y manifiesto de vistas/recursos
  emails/                        Correo de recuperación
  routes.php                     Lista explícita de acciones y módulos
model/
  diagrams/diagrams.php           Consultas de diagramas privados
  habits/, categories/, ...      Operaciones de cada módulo
  base.php                       Contexto de usuario y funciones compartidas
database/migrations/             Cambios de esquema incrementales
translations/                    Textos de interfaz en inglés y español
config/local.php                 Configuración privada de cada instalación
```

Ejemplo del recorrido completo de una acción:

```text
view/home/home.php               HTML del botón y del nodo
  → view/home/home.js            Evento → método → makeRequest()
  → view/global/request.js       Petición AJAX y respuesta JSON
  → controller/diagrams/index.php
  → controller/security/request.php  Sesión, CSRF, acción y método HTTP
  → controller/diagrams/diagrams.php
  → model/diagrams/diagrams.php   Propiedad del registro y consultas preparadas
  → MySQL
  → respuesta JSON → JavaScript → actualización del mismo nodo
```

Los constructores JavaScript registran las acciones una sola vez. Los eventos compartidos delegan al controlador de cada pantalla. Las plantillas reciben campos con nombre, como `{{heading}}` o `{{name}}`; los datos personales se escapan antes de insertarse. Las solicitudes comparten el transporte AJAX para evitar copias divergentes de la lógica de sesiones y errores.

`api.php` y `app/bootstrap.php` se conservan como entradas de compatibilidad; la implementación está en las carpetas nuevas. Solo los `index.php` de controladores enumerados son endpoints públicos. Los modelos, la configuración y los archivos internos de seguridad están bloqueados por el router local y `.htaccess`.

## Primer paso del editor de diagramas

En Inicio, **Crear diagrama** muestra inmediatamente un rectángulo con esquinas redondeadas en el centro y guarda su creación como «Nuevo diagrama». Queda seleccionado, con cinco símbolos alrededor. **Un clic** selecciona el cuadro; **doble clic** habilita la edición del texto. Los símbolos son visuales por ahora, sin acciones asignadas. Pulsar fuera del cuadro oculta los símbolos y guarda la edición. También se puede usar Tab para enfocar el nodo y Enter o F2 para editarlo.

El nodo tiene 10 px de espacio interior y ajusta su altura al texto: durante la edición, **Shift + Enter** añade una línea y **Enter** guarda y termina de editar. Los nombres y saltos de línea se guardan automáticamente y se recuperan al volver a entrar. Escape restaura el último nombre guardado al editar, o deselecciona el cuadro fuera de la edición. Los diagramas son privados y tienen control de versión para no sobrescribir cambios hechos en otra pestaña.

Esta primera entrega incluye el nodo inicial. Las ramas, conexiones y herramientas adicionales se definirán en los siguientes pasos; no depende de servicios externos de SimpleMind.

## Actualizar una instalación existente

Los cambios de esta entrega están guardados localmente y no se publican automáticamente. Tras copiar manualmente el proyecto al servidor, ejecuta con PHP 8.2 o superior:

```sh
php bin/migrate.php
```

La migración `005_diagrams.sql` añade la tabla de diagramas. No importa una base nueva ni reemplaza usuarios, hábitos, rutinas o registros existentes. Conserva el `config/local.php` propio del servidor.

## Abrir la instalación local

- Aplicación: http://localhost:8782
- Cuenta inicial: `aleinarossui@gmail.com`, con roles `admin` y `user`.
- Categorías elegidas por cada persona en Ajustes. Mis hábitos muestra categorías con contenido y abre su tablero semanal; el catálogo global permanece disponible para inscribirse voluntariamente.
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
node --test tests/diagrams.cjs
```

Requiere Python 3, PHP con PDO MySQL y un usuario de MySQL autorizado para crear una base aislada `mi_rutina_test_*`. Configura `RUTINA_TEST_DB_USER` y `RUTINA_TEST_DB_PASSWORD` según tu entorno; el valor predeterminado `root` sin contraseña corresponde únicamente al XAMPP local. No usa la base real de Aleina.

`tests/constraints.php` verifica restricciones SQL, consistencia del calendario del PDF y diccionarios. `tests/serve.py` permite revisar visualmente la última base de pruebas en el puerto 8783. Los datos de pruebas quedan fuera de Git.

## Documentación

- [Instalar y conectar en Hostinger](docs/HOSTINGER.md)
- [Modelo de acceso y decisiones de privacidad](docs/SECURITY.md)

## Exportar para una instalación vacía

`php bin/export.php` crea `storage/hostinger-mi-rutina.sql` con el esquema y los datos reales, en una instantánea consistente. Contiene datos privados y hashes de autenticación: no se publica en Git ni en el directorio web. Se importa solamente en una base **nueva y vacía**, no encima de una instalación existente.
