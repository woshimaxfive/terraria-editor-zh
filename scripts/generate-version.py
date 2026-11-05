"""Update the application version from portable product source contents."""
from pathlib import Path
import hashlib,json,sys

root=Path(__file__).resolve().parents[1]
rows=[]
for p in sorted((root/'src').rglob('*'),key=lambda path:path.relative_to(root).as_posix()):
 if not p.is_file() or {'bin','obj'}.intersection(p.parts) or p.name=='build-version.json':continue
 rows.append([p.relative_to(root).as_posix(),hashlib.sha256(p.read_bytes()).hexdigest()])
version=hashlib.sha256(json.dumps(rows,ensure_ascii=False,separators=(',',':')).encode('utf-8')).hexdigest()
output=Path(sys.argv[1]).resolve()
assert output.is_relative_to(root/'artifacts') and (output/'ui/wwwroot').is_dir()
(output/'ui/wwwroot/build-version.json').write_text(json.dumps({'version':version})+'\n',encoding='utf-8',newline='\n')
print('Application source version: '+version)
