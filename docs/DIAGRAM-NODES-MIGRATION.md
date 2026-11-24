# Nodos y estilos de los diagramas

La migración `database/migrations/006_diagram_nodes.sql` añade `diagram_nodes` y crea un nodo raíz por cada diagrama existente, conservando exactamente su nombre y saltos de línea. No sustituye tablas ni cambia usuarios, hábitos, rutinas o registros existentes.

La migración `database/migrations/007_diagram_node_width.sql` añade el ancho individual `node_width`, con valor nulo para conservar el ancho predeterminado de los cuadros existentes. El ancho personalizado admite de 100 a 600 píxeles, con dos decimales. Debe aplicarse antes de habilitar el código que guarda anchos.

La migración `008_diagram_node_content.sql` añade `image_data` y `labels_json` a cada nodo. En la API son `image` (imagen raster codificada o `null`) y `labels` (lista de texto y posición `inside`/`outside`). Omitir los campos conserva el contenido guardado; `null` y `[]` lo eliminan explícitamente. Las imágenes están limitadas y se validan por su contenido y tipo real en el servidor. El guardado mantiene las mismas comprobaciones de propietario, CSRF y versión. `deleteDiagram` aplica esos controles antes de desvincular y eliminar el árbol.

## Aplicación al subir la actualización

La migración `012_diagram_node_links.sql` añade `diagram_nodes.link_json`. Cada cuadro puede guardar un enlace privado `{diagram_id, node_id}`; `node_id: null` abre el diagrama completo. Un `link: null` quita el enlace y omitir `link` conserva el anterior para clientes antiguos. Los destinos nuevos se validan contra los diagramas y cuadros de la misma cuenta. Un destino eliminado se detecta al abrir el enlace y no bloquea ediciones posteriores del origen. No se usa una clave foránea hacia los cuadros, porque el guardado reconstruye el árbol dentro de una transacción.

Los enlaces a otros elementos de MindSpace usan en esa misma columna `{item_id, target}`. `target: null` abre el documento o carpeta completo; una selección usa `{type: 'cell' | 'card' | 'column' | 'habit', id: string}`. Las celdas se identifican por dirección (B3, AA12), las tarjetas por UUID, las columnas predeterminadas por estado (`backlog`, `todo`, `doing`, `done`), las columnas añadidas por UUID y los hábitos por su ID convertido a texto. Se valida la propiedad del elemento, su tipo, los límites de la hoja y la pertenencia de tarjetas, columnas y hábitos. Las columnas solo son válidas en tableros Kanban - Scrum; `backlog` se conserva como ID interno de **Pending** para mantener los enlaces antiguos. Se admiten columnas vacías. Los enlaces antiguos a diagramas conservan su formato. Esta ampliación no modifica las migraciones 012–014 ni necesita otra columna SQL.

El 24 de noviembre de 2026 se aplicó la 012 en localhost y Hostinger. Producción tenía el código nuevo pero carecía de `link_json`, causando `error_database` al guardar. Se añadió la columna y se registró el checksum `650ac30c23ed0928b32c54fb628b23a90d2c07da0bc6e9a8ab7f8c72a12db528`, conservando dos diagramas y quince nodos. Se reintentó el guardado pendiente en Safari sin recargar y la interfaz confirmó «Diagram saved».

Los enlaces de regreso y la ruta padre/hijo se calculan a partir de `link_json` de los diagramas privados ya cargados. No añaden columnas ni escriben un enlace duplicado en el destino, por lo que no sobrescriben enlaces existentes ni dejan regresos huérfanos al quitar el origen. El recorrido elegido se guarda en `sessionStorage`, aislado por cuenta e instalación, y se valida contra los enlaces vigentes antes de reutilizarlo.

La migración `009_diagram_node_checkbox.sql` añade `checkbox_state`: `NULL` sin casilla, `0` sin marcar y `1` marcada. En la API se llama `checkbox` y admite `null`, `false` o `true`. Omitirlo conserva el estado anterior; enviarlo como `null` quita la casilla. Los cuadros existentes empiezan sin casilla. Aplicar las migraciones pendientes en orden, incluida la 008 de contenido de nodos y la 009, antes de habilitar los archivos actualizados.

La migración `010_empty_diagram_nodes.sql` elimina únicamente la restricción `chk_diagram_node_text` que impedía guardar ideas vacías. Conserva los datos, las relaciones y los límites de longitud. El título del diagrama sigue siendo obligatorio. La migración selecciona la sintaxis correspondiente a MySQL o MariaDB y puede reintentarse si la restricción ya se eliminó. Debe aplicarse antes de habilitar el guardado de cuadros vacíos.

La migración `011_diagram_connections.sql` añade `diagrams.connections_json` para las conexiones adicionales entre ideas. Aplicarla antes de habilitar el modelo que consulta este campo, incluso si todavía no se han creado conexiones. Las migraciones 010 y 011 quedaron aplicadas tanto en localhost como en Hostinger el 24 de noviembre de 2026; producción conservó su diagrama y doce nodos.

La migración `011_diagram_connections.sql` añade `diagrams.connections_json`. La API expone `connections`, una lista de pares `{from, to}` de nodos existentes del mismo diagrama. Son conexiones adicionales independientes de la jerarquía; se validan con el mismo propietario, versión y transacción que los nodos. Omitir el campo conserva las conexiones válidas y retira aquellas cuyos cuadros se borraron o ahora son padre e hijo directo; `[]` elimina todas las conexiones adicionales. Los diagramas existentes empiezan sin conexiones adicionales. Debe aplicarse antes de habilitar los archivos actualizados.

La edición de conectores reutiliza esa misma columna, sin migración adicional. El JSON admite el formato antiguo de lista y el nuevo objeto `{extra, hidden, styles}`. La API mantiene `connections` y añade `hidden_connections` (líneas de padre e hijo eliminadas visualmente) y `connection_styles` (pares `from`/`to`, `points`, `label` y `arrows`). Las posiciones de los quiebres se guardan en coordenadas del diagrama, antes del desplazamiento de presentación; los extremos se ajustan a los cuadros actuales. Cada recorrido admite hasta 64 puntos ortogonales, la etiqueta hasta 120 caracteres y las flechas `none`, `start`, `end` o `both`. El servidor valida que las líneas pertenezcan al diagrama. Omitir campos conserva su estado y descarta referencias que dejaron de existir; listas vacías restablecen el campo. Los archivos de modelo y editor deben actualizarse juntos.

Antes de habilitar los archivos nuevos de `model/diagrams/` y `view/home/`, ejecutar desde la carpeta del proyecto en el servidor:

```sh
php bin/migrate.php
```

El ejecutor comprueba las migraciones previas por su checksum, aplica únicamente las pendientes y registra la nueva en `schema_migrations`. Conserva el `config/local.php` y las credenciales propios de ese servidor. No hay que importar la base de pruebas.

Si se utiliza phpMyAdmin en lugar del ejecutor CLI, seleccionar la base existente del proyecto y ejecutar únicamente las migraciones pendientes, en orden. Si todavía falta `diagram_nodes`, ejecutar el contenido de `006_diagram_nodes.sql` una sola vez. Después registrar la migración con este SQL:

```sql
INSERT INTO schema_migrations (version, checksum)
VALUES ('006_diagram_nodes.sql', '8252174bd6ea4d20893b9e3366db05aa9a9a8ac767e93f8ce8814eb697ed867b');
```

Para habilitar el ajuste de ancho, ejecutar el contenido de `007_diagram_node_width.sql` una sola vez y registrar:

```sql
INSERT INTO schema_migrations (version, checksum)
VALUES ('007_diagram_node_width.sql', 'f5a88548c661486462b667089172da670a90d019a36959035666d1f886625dec');
```

No registrar la migración si falla alguna consulta anterior. Con el ejecutor CLI este registro es automático; no ejecutar también el INSERT manual.

## Modelo y compatibilidad

- `diagrams.id` se relaciona con `diagram_nodes.diagram_id`.
- La clave primaria de cada nodo es `(diagram_id, node_key)`; `root` identifica la raíz y los demás nodos utilizan UUID.
- `(diagram_id, parent_key)` referencia otro nodo del mismo diagrama. `parent_key = NULL` identifica una idea principal sin padre; un diagrama puede contener varias. Se conserva el identificador `root` como ancla interna, y las demás ideas principales usan UUID. La API valida todos los árboles, sus padres y ciclos, hasta 200 nodos y 30 niveles de descendencia. Este cambio utiliza la columna nullable existente y no requiere migración.
- `layout_mode` nulo significa heredar del ancestro más cercano que tenga un estilo propio. Una elección propia guarda modo y direcciones sin copiarlos en todos sus descendientes. El selector permite reemplazar estilos en toda la rama o en todo el diagrama.
- `node_width` nulo usa el ancho predeterminado; un valor numérico guarda el ancho de ese cuadro, sin heredarlo a sus hijos. En la API se llama `width`. Omitir el campo conserva el ancho anterior del mismo nodo, mientras que enviar `null` lo restablece.
- `diagrams.name` es el título independiente del diagrama; `diagram_nodes.text` conserva el texto de cada idea, incluida la raíz. Crear sin nodos inicializa la raíz con el nombre una sola vez. Renombrar sin enviar nodos conserva todo el árbol. Esta separación utiliza las columnas existentes y no requiere una nueva migración.
- Un guardado reemplaza la instantánea del árbol en la misma transacción y con el mismo control de versión del diagrama. Primero desvincula los padres antiguos, después reemplaza nodos y reconstruye sus relaciones; no modifica árboles de otras cuentas.
- La restricción de padre es inmediata. Una futura operación de borrado de un diagrama o usuario con nodos deberá desvincular primero esas relaciones, como hace el guardado, antes de eliminar su árbol.

## Verificación realizada

120 comprobaciones HTTP y 7 de esquema/fuentes pasaron con PHP 8.4 y MariaDB en una base local aislada. Incluyen relectura de estilos heredados y propios, posiciones, anchos individuales, clientes que omiten el ancho, límites y redondeo, saltos de línea, cuentas distintas, versiones obsoletas, reintentos de creación, ciclos, nodos huérfanos y reemplazo de un árbol de 30 niveles.

La migración 006 también se aplicó a la base local `mi_rutina` de XAMPP, conservando sus registros. El 23 de noviembre de 2026 se aplicó también en Hostinger mediante Chrome/phpMyAdmin, por solicitud de la usuaria. Se conservó el diagrama existente, se creó su nodo raíz y se registró el checksum de la migración. La migración 007 está aplicada en localhost y en Hostinger. En el servidor faltaba `node_width`, lo que impedía guardar cualquier cambio del árbol. Se añadió la columna, se registró el checksum y se verificó que seguían presentes el diagrama y sus ocho nodos. La usuaria confirmó que «Try again» volvió a guardar correctamente. No se subieron archivos del proyecto. La base `tests/.runtime/environment.json` es exclusivamente de pruebas y no se debe publicar.
