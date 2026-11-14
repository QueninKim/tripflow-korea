from pathlib import Path
import json,subprocess,hashlib,runpy,sys
root=Path(__file__).resolve().parents[1];manifest=json.loads((root/'data-sources/intercity/sources.json').read_text());inputs=root/'data-sources/intercity/originals';inputs.mkdir(exist_ok=True)
for entry in manifest['sources']:
 target=inputs/entry['filename']
 if not target.exists():subprocess.run(['curl','-fLsS',entry['url'],'-o',str(target)],check=True)
 if hashlib.sha256(target.read_bytes()).hexdigest()!=entry['sha256']:raise RuntimeError('Source changed; review before rebuilding: '+entry['filename'])
sys.path.insert(0,str(root/'scripts'))
runpy.run_path(str(root/'scripts/compile-rail-timetable.py'),run_name='__main__')
runpy.run_path(str(root/'scripts/add-rail-locations.py'),run_name='__main__')
