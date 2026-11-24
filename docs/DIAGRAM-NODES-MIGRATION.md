# Nodos y estilos de los diagramas

La migración `database/migrations/006_diagram_nodes.sql` añade `diagram_nodes` y crea un nodo raíz por cada diagrama existente, conservando exactamente su nombre y saltos de línea. No sustituye tablas ni cambia usuarios, hábitos, rutinas o registros existentes.

La migración `database/migrations/007_diagram_node_width.sql` añade el ancho individual `node_width`, con valor nulo para conservar el ancho predeterminado de los cuadros existentes. El ancho personalizado admite de 100 a 600 píxeles, con dos decimales. Debe aplicarse antes de habilitar el código que guarda anchos.

## Aplicación al subir la actualización

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
- `(diagram_id, parent_key)` referencia otro nodo del mismo diagrama. La API valida una única raíz, todos los padres, ciclos, hasta 200 nodos y 30 niveles de descendencia.
- `layout_mode` nulo significa heredar del ancestro más cercano que tenga un estilo propio. Una elección propia guarda modo y direcciones sin copiarlos en todos sus descendientes. El selector permite reemplazar estilos en toda la rama o en todo el diagrama.
- `node_width` nulo usa el ancho predeterminado; un valor numérico guarda el ancho de ese cuadro, sin heredarlo a sus hijos. En la API se llama `width`. Omitir el campo conserva el ancho anterior del mismo nodo, mientras que enviar `null` lo restablece.
- El texto raíz coincide con `diagrams.name`. Los clientes anteriores que guardan solo el nombre conservan hijos, estilos, posiciones y anchos.
- Un guardado reemplaza la instantánea del árbol en la misma transacción y con el mismo control de versión del diagrama. Primero desvincula los padres antiguos, después reemplaza nodos y reconstruye sus relaciones; no modifica árboles de otras cuentas.
- La restricción de padre es inmediata. Una futura operación de borrado de un diagrama o usuario con nodos deberá desvincular primero esas relaciones, como hace el guardado, antes de eliminar su árbol.

## Verificación realizada

120 comprobaciones HTTP y 7 de esquema/fuentes pasaron con PHP 8.4 y MariaDB en una base local aislada. Incluyen relectura de estilos heredados y propios, posiciones, anchos individuales, clientes que omiten el ancho, límites y redondeo, saltos de línea, cuentas distintas, versiones obsoletas, reintentos de creación, ciclos, nodos huérfanos y reemplazo de un árbol de 30 niveles.

La migración 006 también se aplicó a la base local `mi_rutina` de XAMPP, conservando sus registros. El 23 de noviembre de 2026 se aplicó también en Hostinger mediante Chrome/phpMyAdmin, por solicitud de la usuaria. Se conservó el diagrama existente, se creó su nodo raíz y se registró el checksum de la migración. La migración 007 está aplicada en localhost y en Hostinger. En el servidor faltaba `node_width`, lo que impedía guardar cualquier cambio del árbol. Se añadió la columna, se registró el checksum y se verificó que seguían presentes el diagrama y sus ocho nodos. La usuaria confirmó que «Try again» volvió a guardar correctamente. No se subieron archivos del proyecto. La base `tests/.runtime/environment.json` es exclusivamente de pruebas y no se debe publicar.
