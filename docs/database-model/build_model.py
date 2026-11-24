#!/usr/bin/env python3
"""Build local schema documentation from the project's authoritative migrations."""
from pathlib import Path
import hashlib
import html
import json
import re

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def split_sql(value):
    result, start, depth, quoted = [], 0, 0, False
    for i, char in enumerate(value):
        if char == "'":
            quoted = not quoted
        elif not quoted:
            if char == '(':
                depth += 1
            elif char == ')':
                depth -= 1
            elif char == ',' and depth == 0:
                result.append(value[start:i].strip())
                start = i + 1
    result.append(value[start:].strip())
    return result


def names(value):
    return [s.strip().strip('`') for s in value.split(',')]


sources = [(p.name, p.read_text()) for p in sorted((ROOT / 'database/migrations').glob('*.sql'))]
runner = (ROOT / 'bin/migrate.php').read_text()
tracking = re.search(r"\$db->run\('(CREATE TABLE IF NOT EXISTS schema_migrations .*?ENGINE=InnoDB)'\)", runner).group(1)
sources.append(('bin/migrate.php', tracking + ';'))
tables = {}
for source, text in sources:
    for match in re.finditer(r'CREATE TABLE(?: IF NOT EXISTS)? (\w+)\s*\((.*?)\)\s*(ENGINE=.*?);', text, re.S):
        name, body, engine = match.groups()
        table = {'name': name, 'source': source, 'columns': [], 'pk': [], 'unique': [], 'foreign_keys': [], 'constraints': [], 'engine': engine}
        for clause in split_sql(body):
            normalized = ' '.join(clause.split())
            foreign = re.search(r'FOREIGN KEY\s*\(([^)]+)\) REFERENCES (\w+)\(([^)]+)\)(?: ON DELETE (CASCADE|SET NULL|RESTRICT|NO ACTION))?', normalized)
            if foreign:
                columns, parent, parent_columns, delete = foreign.groups()
                table['foreign_keys'].append({'columns': names(columns), 'parent': parent, 'parent_columns': names(parent_columns), 'on_delete': delete or 'RESTRICT (implícito)'})
                table['constraints'].append(normalized)
            elif re.match(r'(PRIMARY KEY|UNIQUE|KEY |INDEX |CHECK|CONSTRAINT)', normalized):
                table['constraints'].append(normalized)
                if normalized.startswith('PRIMARY KEY'):
                    table['pk'] = names(re.search(r'\((.*?)\)', normalized).group(1))
                elif normalized.startswith('UNIQUE'):
                    table['unique'].append(names(re.search(r'\((.*?)\)', normalized).group(1)))
            else:
                col_name, definition = normalized.split(' ', 1)
                sql_type = re.match(r"(?:ENUM\([^)]*\)|\w+(?:\([^)]*\))?)(?: UNSIGNED)?", definition).group()
                is_pk = 'PRIMARY KEY' in definition
                table['columns'].append({'name': col_name, 'type': sql_type, 'definition': definition, 'nullable': 'NOT NULL' not in definition and not is_pk, 'generated': 'GENERATED ALWAYS' in definition})
                if is_pk:
                    table['pk'].append(col_name)
                if re.search(r'\bUNIQUE\b', definition):
                    table['unique'].append([col_name])
        for column in table['columns']:
            column['keys'] = []
            if column['name'] in table['pk']:
                column['keys'].append('PK')
                column['nullable'] = False
            if any(column['name'] in f['columns'] for f in table['foreign_keys']):
                column['keys'].append('FK')
            if any(column['name'] in u for u in table['unique']):
                column['keys'].append('UQ')
            # The source DDL omits an explicit NULL/NOT NULL for this TIMESTAMP.
            # Hostinger/phpMyAdmin Structure was inspected on 2026-11-23 and
            # reports Null=No. Preserve the source definition verbatim while
            # representing the confirmed server nullability in the model.
            if name == 'schema_migrations' and column['name'] == 'applied_at':
                column['nullable'] = False
                column['nullable_source'] = 'Hostinger/phpMyAdmin Structure, 2026-11-23: Null=No; Default=current_timestamp()'
        table['ddl'] = match.group(0)
        tables[name] = table

assert len(tables) == 23
assert sum(len(t['foreign_keys']) for t in tables.values()) == 36
for table in tables.values():
    assert table['pk'], table['name']
    for fk in table['foreign_keys']:
        assert fk['parent'] in tables
        assert all(c in [col['name'] for col in table['columns']] for c in fk['columns'])
        assert all(c in [col['name'] for col in tables[fk['parent']]['columns']] for c in fk['parent_columns'])

DOMAINS = {
    'identity': ('Identidad y diagramas', '#6B4FD0', '#F1EDFF', ['users', 'user_roles', 'user_settings', 'password_resets', 'notifications', 'diagrams', 'diagram_nodes']),
    'habits': ('Hábitos y bienestar', '#167B70', '#E8F6F2', ['habit_categories', 'user_categories', 'routines', 'habits', 'habit_completions', 'wellness_entries']),
    'collaboration': ('Colaboración', '#B46A1F', '#FFF3E6', ['habit_shares', 'share_habits', 'habit_collaborators', 'collaboration_activity', 'invitation_receipts']),
    'administration': ('Administración', '#42709E', '#EDF4FC', ['category_requests', 'habit_templates']),
    'infrastructure': ('Soporte técnico', '#5E6A7C', '#F0F3F7', ['platform_settings', 'rate_limits', 'schema_migrations']),
}
domain_by_table = {name: key for key, (_, _, _, group) in DOMAINS.items() for name in group}
assert set(domain_by_table) == set(tables)


def cardinalities(table, fk):
    nullable = any(next(c for c in table['columns'] if c['name'] == n)['nullable'] for n in fk['columns'])
    child_unique = any(set(key).issubset(fk['columns']) for key in [table['pk']] + table['unique'])
    return ('0..1' if nullable else '1', '0..1' if child_unique else '0..N')


def dot_node(name, keys_only=False, reference=False):
    table = tables[name]
    domain, color, pale, _ = DOMAINS[domain_by_table[name]]
    selected = [c for c in table['columns'] if (not keys_only and not reference) or c['keys']]
    if reference:
        selected = [c for c in table['columns'] if c['name'] in table['pk']]
    title = name + (' · referencia' if reference else '')
    rows = [f'<TR><TD COLSPAN="3" BGCOLOR="{color}" ALIGN="LEFT" CELLPADDING="10"><FONT COLOR="white" POINT-SIZE="15"><B>{html.escape(title)}</B></FONT></TD></TR>']
    for col in selected:
        badge = '/'.join(col['keys']) or ('GEN' if col['generated'] else '&#160;')
        sql_type = 'ENUM' if col['type'].startswith('ENUM') else col['type'].replace('BIGINT UNSIGNED', 'BIGINT u').replace('INT UNSIGNED', 'INT u')
        null = '?' if col['nullable'] else ''
        rows.append(f'<TR><TD PORT="in_{col["name"]}" BGCOLOR="{pale}" ALIGN="LEFT"><FONT COLOR="{color}" POINT-SIZE="10"><B>{badge}</B></FONT></TD><TD ALIGN="LEFT"><FONT POINT-SIZE="12">{col["name"]}{null}</FONT></TD><TD PORT="out_{col["name"]}" ALIGN="LEFT"><FONT COLOR="#64748B" POINT-SIZE="11">{html.escape(sql_type)}</FONT></TD></TR>')
    if keys_only:
        rows.append(f'<TR><TD COLSPAN="3" BGCOLOR="{pale}" ALIGN="LEFT"><FONT COLOR="#64748B" POINT-SIZE="10">{len(table["columns"])} columnas · {table["source"]}</FONT></TD></TR>')
    return f'"{name}" [label=<<TABLE BORDER="1" BGCOLOR="white" COLOR="#CBD5E1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="6">{"".join(rows)}</TABLE>>];'


def make_dot(file_name, title, subtitle, main_names, reference_names=(), keys_only=False):
    all_names = list(main_names) + list(reference_names)
    lines = ['digraph Model {', 'graph [rankdir=LR, bgcolor="#FCFCFE", pad="0.6", nodesep="0.55", ranksep="1.7", splines=spline, outputorder=edgesfirst, fontname="Arial", labelloc=t, labeljust=l, newrank=true];', 'node [shape=plain, fontname="Arial"];', 'edge [fontname="Arial", fontsize=11, color="#94A3B8", fontcolor="#475569", arrowsize=0.7, penwidth=1.2, labeldistance=3.8, labelangle=25];', f'label=<<FONT POINT-SIZE="28" COLOR="#17243B"><B>MyRemarkableMind · {title}</B></FONT><BR ALIGN="LEFT"/><FONT POINT-SIZE="13" COLOR="#64748B">{subtitle}</FONT><BR ALIGN="LEFT"/><FONT POINT-SIZE="11" COLOR="#64748B">PK primaria · FK foránea · UQ parte de clave única · ? admite NULL · u = UNSIGNED · flecha: tabla referenciada → tabla hija</FONT>>;']
    for name in all_names:
        lines.append(dot_node(name, keys_only, name in reference_names))
    for name in main_names:
        table = tables[name]
        for fk in table['foreign_keys']:
            if fk['parent'] not in all_names:
                continue
            parent_card, child_card = cardinalities(table, fk)
            label = fk['columns'][0]
            lines.append(f'"{fk["parent"]}":"out_{fk["parent_columns"][0]}":e -> "{name}":"in_{fk["columns"][0]}":w [label="{parent_card} → {child_card}", tooltip="{fk["parent"]} ({parent_card}) → {name} ({child_card}) por {label}"];')
    lines.append('}')
    (HERE / (file_name + '.dot')).write_text('\n'.join(lines) + '\n')


make_dot('01-modelo-general', 'Modelo relacional general', '23 tablas · 36 claves foráneas · Esquema local 001–006 y tabla de migraciones · 23 noviembre 2026', list(tables), keys_only=True)
make_dot('02-identidad-diagramas', 'Identidad, diagramas y soporte', 'Todas las columnas · 10 tablas · ENUM y restricciones completos en el diccionario HTML', DOMAINS['identity'][3] + DOMAINS['infrastructure'][3])
make_dot('05-diagramas-y-nodos', 'Diagramas y nodos', 'Relación principal del editor · el padre de cada nodo está en el mismo diagrama', ['users', 'diagrams', 'diagram_nodes'])
make_dot('03-habitos-administracion', 'Hábitos, bienestar y administración', 'Todas las columnas · 8 tablas del dominio + users como referencia', DOMAINS['habits'][3] + DOMAINS['administration'][3], ['users'])
make_dot('04-colaboracion', 'Colaboración e invitaciones', 'Todas las columnas · 5 tablas del dominio + 3 referencias · habit_id / category_id son mutuamente excluyentes', DOMAINS['collaboration'][3], ['users', 'habits', 'habit_categories'])

mermaid = ['erDiagram', '    direction LR']
for table in tables.values():
    mermaid.append(f'    {table["name"]} {{')
    for col in table['columns']:
        kind = re.sub(r'[^a-zA-Z0-9_]', '_', col['type'].lower())
        if kind.startswith('enum'):
            kind = 'enum'
        keys = ', '.join(k.replace('UQ', 'UK') for k in col['keys'])
        comment = 'NULL' if col['nullable'] else 'NOT NULL'
        if col['generated']:
            comment += '; generado'
        mermaid.append(f'        {kind} {col["name"]} {keys} "{comment}"')
    mermaid.append('    }')
for table in tables.values():
    for fk in table['foreign_keys']:
        parent_card, child_card = cardinalities(table, fk)
        left = '|o' if parent_card == '0..1' else '||'
        right = 'o|' if child_card == '0..1' else 'o{'
        line = '--' if set(fk['columns']).issubset(table['pk']) else '..'
        mermaid.append(f'    {fk["parent"]} {left}{line}{right} {table["name"]} : "{", ".join(fk["columns"])}"')
(HERE / 'modelo-relacional.mmd').write_text('\n'.join(mermaid) + '\n')
(HERE / 'schema.json').write_text(json.dumps({'tables': list(tables.values())}, ensure_ascii=False, indent=2) + '\n')

blocks = []
for domain_key, (domain, color, pale, group) in DOMAINS.items():
    blocks.append(f'<section><h2>{domain}</h2>')
    for name in group:
        table = tables[name]
        body = ''.join(f'<tr><td><code>{c["name"]}</code></td><td><span class="badge">{" / ".join(c["keys"]) or "—"}</span></td><td>{"Sí" if c["nullable"] else "No"}</td><td><code>{html.escape(c["definition"])}</code></td></tr>' for c in table['columns'])
        constraints = '<br>'.join(f'<code>{html.escape(c)}</code>' for c in table['constraints']) or 'Sin restricciones adicionales a las de columna.'
        if name == 'schema_migrations':
            constraints += '<br><strong>Fuente de nulabilidad:</strong> Hostinger/phpMyAdmin, vista Structure, 23 de noviembre de 2026: <code>applied_at</code> muestra <code>Null=No</code> y <code>Default=current_timestamp()</code>. Se conserva arriba el DDL original, que no declara explícitamente NULL/NOT NULL para este TIMESTAMP.'
        blocks.append(f'<article id="{name}" style="--accent:{color}"><h3>{name} <small>{table["source"]}</small></h3><table><thead><tr><th>Columna</th><th>Clave</th><th>NULL</th><th>Definición SQL exacta</th></tr></thead><tbody>{body}</tbody></table><p class="constraints">{constraints}</p></article>')
    blocks.append('</section>')
relation_rows = []
for name, table in tables.items():
    for fk in table['foreign_keys']:
        parent, child = cardinalities(table, fk)
        relation_rows.append(f'<tr><td><a href="#{fk["parent"]}">{fk["parent"]}</a>.{", ".join(fk["parent_columns"])}</td><td>{parent} → {child}</td><td><a href="#{name}">{name}</a>.{", ".join(fk["columns"])}</td><td>{fk["on_delete"]}</td></tr>')
checksums = ''.join(f'<tr><td>{name}</td><td><code>{hashlib.sha256(text.encode()).hexdigest()}</code></td></tr>' for name, text in sources[:-1])
page = '''<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MyRemarkableMind · Modelo de base de datos</title><style>
:root{font:16px/1.55 system-ui,sans-serif;color:#17243b;background:#f5f6fa}body{margin:0 auto;padding:48px 28px 100px;max-width:1200px}h1{font-size:40px;line-height:1.1;letter-spacing:-1px;margin:12px 0}h2{font-size:27px;margin:50px 0 16px}h3{margin:0;padding:17px 22px;background:#f7f8fc;border-left:5px solid var(--accent);font-size:20px}small{font-size:12px;font-weight:400;color:#64748b;margin-left:12px}p{max-width:930px}.eyebrow{font-size:13px;color:#6b4fd0;font-weight:700;letter-spacing:2px}.lead{font-size:19px;color:#526179}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:15px;margin:28px 0}.card{display:block;background:white;border:1px solid #dde2ec;border-radius:12px;padding:22px;text-decoration:none;color:#17243b}.card strong{display:block;font-size:18px}.card span{color:#64748b;font-size:14px}article{margin:22px 0 32px;border:1px solid #dce2eb;background:white;border-radius:10px;overflow:auto}table{border-collapse:collapse;width:100%;background:white;font-size:14px}th,td{padding:11px 14px;text-align:left;border-bottom:1px solid #edf0f5;vertical-align:top}th{font-size:12px;text-transform:uppercase;color:#64748b;letter-spacing:.6px}code{font-family:ui-monospace,monospace;font-size:12px;overflow-wrap:anywhere}.badge{font-size:11px;color:#6b4fd0;font-weight:650;white-space:nowrap}.constraints{font-size:12px;padding:2px 18px 13px;color:#526179}.callout{background:#eeebfa;border-left:4px solid #6b4fd0;padding:12px 20px;border-radius:6px}.meta{color:#64748b;font-size:13px}a{color:#5a44b4}details{margin:30px 0}summary{cursor:pointer;font-weight:650}@media print{body{padding:0;background:white}article{break-inside:avoid}h2{break-before:page}.cards{display:none}}
</style><body><div class="eyebrow">MODELO RELACIONAL / VERSIÓN LOCAL</div><h1>MyRemarkableMind</h1><p class="lead">23 tablas · 36 claves foráneas · Migraciones 001–006 y registro técnico de migraciones.</p><p class="meta">Generado a partir de los archivos del proyecto el 23 de noviembre de 2026. Este documento describe el esquema esperado por el código. Incluye la migración 006 de nodos, padres, estilos y posiciones. Las imágenes describen el esquema de las migraciones; no incluyen datos personales ni credenciales.</p>
<div class="cards"><a class="card" href="00-vista-rapida.png"><strong>Vista rápida PNG</strong><span>Las relaciones principales, de un vistazo.</span></a><a class="card" href="01-modelo-general.svg"><strong>01 / Modelo general</strong><span>Las 23 tablas, sus claves y todas las relaciones.</span></a><a class="card" href="02-identidad-diagramas.svg"><strong>02 / Identidad y diagramas</strong><span>Usuarios, acceso, diagramas, nodos y soporte.</span></a><a class="card" href="03-habitos-administracion.svg"><strong>03 / Hábitos</strong><span>Categorías, rutinas, progreso y administración.</span></a><a class="card" href="04-colaboracion.svg"><strong>04 / Colaboración</strong><span>Invitaciones, permisos y participación.</span></a></div>
<div class="callout"><strong>Qué guarda hoy un diagrama:</strong> <code>diagrams</code> pertenece a un usuario y guarda el nombre del nodo raíz, una clave de creación idempotente, versión y fechas. <code>diagram_nodes</code> guarda los cuadros, el padre de cada cuadro, sus posiciones y su estilo. La referencia al padre siempre pertenece al mismo diagrama; un estilo nulo significa heredar. <code>updated_at</code> de esta tabla no tiene <code>ON UPDATE</code>: su actualización depende del código.</div>
<h2>Cómo leer el modelo</h2><p><strong>PK</strong>: clave primaria; <strong>FK</strong>: clave foránea; <strong>UQ</strong>: columna que forma parte de una clave única, que puede ser compuesta; <strong>?</strong>: admite NULL. En los dibujos, <strong>u</strong> abrevia UNSIGNED y los valores de ENUM se consultan aquí. Las flechas van desde la tabla referenciada hacia la tabla hija. <strong>1 → 0..N</strong> significa que cada fila hija requiere un padre y un padre puede tener ninguna o muchas filas hijas. <strong>0..1</strong> en el extremo padre indica una FK opcional. <code>user_settings.user_id</code> permite como máximo una fila de configuración por usuario.</p><p><code>user_categories</code> y <code>share_habits</code> resuelven relaciones N:M. <code>user_roles</code> usa el par (user_id, role) como PK. En <code>habit_shares</code> e <code>invitation_receipts</code> exactamente uno de <code>habit_id</code> y <code>category_id</code> debe tener valor. <code>platform_settings</code>, <code>rate_limits</code> y <code>schema_migrations</code> no tienen FK declaradas. No hay relaciones inferidas por nombres como <code>recipient_email</code>.</p>
<h2>Relaciones y borrado</h2><p>La cardinalidad refleja nulabilidad y claves únicas del DDL. Todas las relaciones admiten cero filas hijas. ON UPDATE no se especifica en estas FK. RESTRICT implícito indica que el DDL no declara ON DELETE.</p><table><thead><tr><th>Tabla referenciada</th><th>Cardinalidad</th><th>Tabla hija y FK</th><th>ON DELETE</th></tr></thead><tbody>RELATIONS</tbody></table>
TABLES
<details><summary>Fuentes y reproducción local</summary><p>Fuentes: <code>database/migrations/001_core.sql</code> a <code>006_diagram_nodes.sql</code>; <code>schema_migrations</code> se define en <code>bin/migrate.php</code>. Los datos de semillas y las credenciales no se incluyen.</p><p>Edición: los archivos <code>.dot</code> son fuentes Graphviz; <code>modelo-relacional.mmd</code> es una fuente Mermaid alternativa; <code>schema.json</code> contiene la extracción exacta. <code>build_model.py</code> vuelve a extraer el esquema y <code>render.cjs</code> produce SVG/PNG con paquetes locales @viz-js/viz y @resvg/resvg-js. No utiliza servicios web.</p><table><thead><tr><th>Migración</th><th>SHA-256</th></tr></thead><tbody>CHECKSUMS</tbody></table></details><p class="meta">Los SVG conservan nitidez al ampliar; los PNG se pueden compartir o insertar en documentos. Se recomienda consultar las vistas por dominio para leer todas las columnas.</p></body></html>'''
page = page.replace('RELATIONS', ''.join(relation_rows)).replace('TABLES', ''.join(blocks)).replace('CHECKSUMS', checksums)
(HERE / 'index.html').write_text(page)
print(f'Generated {len(tables)} tables, {sum(len(t["columns"]) for t in tables.values())} columns, {len(relation_rows)} foreign keys.')
