# MyRemarkable Mind

Plataforma bilingüe de ideas, diagramas, hábitos, rutinas y colaboración. PHP 8.2+, MySQL 8.0.16+ / MariaDB 10.4+, HTML, CSS y JavaScript; sin Node.js, Composer ni Docker en producción.

## Estructura por módulos

El proyecto sigue la separación de vistas, controladores, seguridad y modelos de Dot63. Cada pantalla tiene su plantilla PHP/HTML, su JavaScript y sus estilos en `view/`. El HTML está en plantillas `<template>`: los cambios de pantalla y la edición del diagrama se dibujan en la página actual. Seleccionar otro diagrama recarga el documento completo para abrir el elegido.

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

## Editor de diagramas

El **asterisco** crea una sola idea hermana del cuadro seleccionado: comparte su padre y copia distribución, direcciones, ancho, imagen, etiquetas y estado de casilla, sin copiar descendientes ni el texto principal. El nuevo cuadro aparece vacío y con el cursor listo. Si la idea seleccionada no tiene padre, su hermana también queda sin padre dentro del mismo diagrama; cada idea principal puede tener su propio árbol. Las posiciones se calculan de nuevo para separar los cuadros. Se guarda automáticamente aunque su texto esté vacío, igual que un hijo nuevo.

Cada diagrama tiene un nombre propio en el recuadro de la esquina superior izquierda del lienzo. **Doble clic** lo convierte en un campo editable con el cursor al final; **Enter** o salir del campo guarda el nombre y **Escape** cancela. Un nombre vacío conserva el anterior. El título es independiente del texto de la idea central y permanece fijo al desplazar o ampliar el lienzo.

Se pueden crear múltiples diagramas, sin un límite de cantidad impuesto por la aplicación. **Mis diagramas** permite elegir cualquiera de los guardados y **Crear diagrama** permanece disponible junto al selector. Cada selección guarda los cambios pendientes y recarga la página con el diagrama elegido; su identificador queda en la URL para conservarlo al volver a recargar. Si el guardado falla, se mantiene abierto el diagrama actual para reintentar. Cada creación empieza con un lienzo independiente y conserva los diagramas anteriores.

En Inicio, **Crear diagrama** muestra inmediatamente un rectángulo con esquinas redondeadas en el centro y guarda su creación como «Nuevo diagrama». Queda seleccionado, con cinco símbolos alrededor. **Un clic** selecciona el cuadro; **doble clic** habilita la edición con el cursor al final del texto, sin seleccionarlo. Los iconos exteriores miden 28 px. Los tres puntos abren el panel de herramientas; el símbolo de ramas abre el selector central de distribución. El botón «+» añade una idea hija al cuadro seleccionado. Las herramientas de formato, enlaces, calendario y flechas diagonales siguen pendientes de definir. Pulsar fuera del cuadro oculta los símbolos y guarda la edición. También se puede usar Tab para enfocar el nodo y Enter o F2 para editarlo.

El botón «+» crea un hijo vacío, sin «New idea» ni texto de ejemplo, con el cursor listo para escribir. Se guarda automáticamente aunque no tenga texto; hacer clic fuera o pulsar Enter conserva el cuadro vacío. Escape permite cancelar un borrador que todavía no se ha enviado. El nodo tiene 10 px de espacio interior y ajusta su altura al texto: durante la edición, **Shift + Enter** añade una línea y **Enter** guarda y termina de editar. Los textos y saltos de línea se guardan automáticamente y se recuperan al volver a entrar. Escape restaura el último texto guardado al editar, o deselecciona el cuadro fuera de la edición. Los diagramas son privados y tienen control de versión para no sobrescribir cambios hechos en otra pestaña.

El icono de dos triángulos debajo a la derecha ajusta el ancho del cuadro seleccionado: mantener presionado y arrastrar horizontalmente permite estrecharlo o ensancharlo entre 100 y 600 px. El texto se redistribuye y la altura se ajusta automáticamente. El ancho se guarda al soltar, es independiente para cada cuadro y se conserva al cambiar de estilo. Con el icono enfocado, las flechas izquierda/derecha cambian 10 px (Shift: 50 px), e Inicio/Fin seleccionan los límites. El arrastre tiene en cuenta el zoom del lienzo.

En los tres puntos, la segunda opción de la segunda fila abre las casillas. Los radios «Solo este cuadro» y «Este cuadro y todos sus hijos» permiten elegir dónde se aplicará la acción: «Sin casilla», «Alternar estado», «Casilla sin marcar» o «Casilla marcada». La segunda opción aplica el mismo estado al cuadro seleccionado y a todos sus descendientes, sin cambiar sus padres ni otras ramas. Cada vez que se abre el menú empieza seleccionado «Solo este cuadro»; elegir un radio no modifica datos hasta pulsar una acción. La casilla aparece a la izquierda del texto y se puede pulsar directamente o con Espacio al enfocarla, cambiando solo ese cuadro. Los estados se guardan y se recuperan al recargar. «Alternar estado» se deshabilita cuando el cuadro seleccionado no tiene casilla. Escape vuelve al panel de herramientas. La migración `009_diagram_node_checkbox.sql` añade este estado; ejecutar `php bin/migrate.php` antes de habilitar la actualización en el servidor.

El selector ofrece distribución libre, horizontal, vertical, lista, de arriba abajo, lineal, radial y matriz; las ocho opciones están habilitadas. Radial coloca las ramas alrededor del cuadro central. Debajo se elige «Modificar todos los hijos» (el cuadro seleccionado y sus descendientes) o «Modificar todo el diagrama» (todos los cuadros desde la raíz). Aplicar guarda el estilo y la dirección en el grupo elegido, reemplazando sus estilos propios anteriores; Cancelar o Escape descartan la elección. «Heredar del padre» toma el estilo del ancestro más cercano. Para todo el diagrama, esta opción cambia a «Predeterminado», que usa horizontal.

Los cuadros y sus conexiones se redistribuyen en el mismo lienzo, sin recargar. Un clic selecciona un cuadro y muestra la manito; mantener el clic y arrastrar mueve el cuadro y su rama en cualquier distribución, guardando su posición. Al aplicar otro estilo se redistribuye el grupo elegido y se limpian sus posiciones manuales. Los conectores salen del centro del lado del padre y comparten una ramificación a mitad del espacio hacia los hijos, respetando la orientación de la distribución incluso en grupos altos o anchos. Tienen tramos horizontales y verticales con giros suavizados de hasta 6 px. El fondo se desplaza manteniendo el clic y arrastrando, o deslizando dos dedos en el trackpad. Separar o juntar dos dedos acerca o aleja el lienzo entre 20 % y 300 %, tomando como referencia el cursor. El desplazamiento y el zoom son ajustes de la vista y no modifican los datos del diagrama. Cada diagrama admite hasta 200 ideas. El editor no depende de servicios externos de SimpleMind.

El menú de tres puntos permite **Copiar**, **Cortar**, **Pegar** y **Eliminar** el cuadro con toda su rama. Con un cuadro seleccionado y enfocado, **Delete/Suprimir** o **Retroceso** (la tecla Delete del Mac) elimina ese cuadro y todos sus hijos. Mientras se edita un texto, las teclas solo borran caracteres. Mantener la tecla oprimida no elimina consecutivamente los cuadros restantes. Pegar añade la copia como hija del cuadro seleccionado, con identificadores nuevos y conservando texto, ancho, estilo, casilla, imagen y etiquetas. El portapapeles permanece en la pestaña al cambiar de diagrama; no utiliza el portapapeles del sistema. Eliminar la única idea principal pide confirmar el borrado del diagrama completo; si hay otras ideas principales, se conservan sus árboles.

**Imagen** permite subir, reemplazar o quitar una imagen PNG, JPG, WebP o GIF de hasta 10 MB. Se optimiza a una imagen fija de hasta 1024 px y 256 KiB; el diagrama admite hasta 2 MiB de imágenes codificadas. Se almacenan con los nodos privados. **Etiqueta** permite añadir, editar y quitar hasta diez etiquetas por cuadro: **Label** aparece fuera y **Label in topic** dentro. Imágenes y etiquetas se guardan automáticamente y se conservan al recargar.

## Actualizar una instalación existente

Los cambios de esta entrega están guardados localmente y no se publican automáticamente. Tras copiar manualmente el proyecto al servidor, ejecuta con PHP 8.2 o superior:

```sh
php bin/migrate.php
```

La migración `005_diagrams.sql` añade la tabla de diagramas; `006_diagram_nodes.sql` añade los nodos, sus padres, estilos y posiciones, y conserva los cuadros ya existentes; `007_diagram_node_width.sql` añade el ancho individual; `008_diagram_node_content.sql` añade imágenes y etiquetas; `009_diagram_node_checkbox.sql` añade casillas; `010_empty_diagram_nodes.sql` permite guardar el texto vacío de las ideas sin cambiar el título del diagrama. Aplica todas las migraciones pendientes antes de habilitar los archivos nuevos en Hostinger; consulta [las instrucciones de actualización](docs/DIAGRAM-NODES-MIGRATION.md). No importa una base nueva ni reemplaza usuarios, hábitos, rutinas o registros existentes. Conserva el `config/local.php` propio del servidor.

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
node --test tests/diagrams.cjs tests/diagram-layout.cjs tests/diagram-viewport.cjs
```

Requiere Python 3, PHP con PDO MySQL y un usuario de MySQL autorizado para crear una base aislada `mi_rutina_test_*`. Configura `RUTINA_TEST_DB_USER` y `RUTINA_TEST_DB_PASSWORD` según tu entorno; el valor predeterminado `root` sin contraseña corresponde únicamente al XAMPP local. No usa la base real de Aleina.

`tests/constraints.php` verifica restricciones SQL, consistencia del calendario del PDF y diccionarios. `tests/serve.py` permite revisar visualmente la última base de pruebas en el puerto 8783. Los datos de pruebas quedan fuera de Git.

## Documentación

- [Instalar y conectar en Hostinger](docs/HOSTINGER.md)
- [Modelo de acceso y decisiones de privacidad](docs/SECURITY.md)

## Exportar para una instalación vacía

`php bin/export.php` crea `storage/hostinger-mi-rutina.sql` con el esquema y los datos reales, en una instantánea consistente. Contiene datos privados y hashes de autenticación: no se publica en Git ni en el directorio web. Se importa solamente en una base **nueva y vacía**, no encima de una instalación existente.
