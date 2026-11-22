#!/usr/bin/env python3
"""Serve the last isolated test database for manual browser QA."""
import os,json,pathlib
root=pathlib.Path(__file__).resolve().parent.parent
config=json.loads((root/'tests/.runtime/environment.json').read_text())
assert config['database'].startswith('mi_rutina_test_')
env=dict(os.environ,**config['env'])
os.chdir(root)
os.execvpe(os.environ.get('PHP_BIN','php'),[os.environ.get('PHP_BIN','php'),'-S','127.0.0.1:8783','router.php'],env)
