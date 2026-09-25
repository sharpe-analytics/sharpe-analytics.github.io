from pathlib import Path
import shutil,re,json,hashlib,sys
src=Path(sys.argv[1]);dst=Path(__file__).resolve().parents[1]/'demo'/'extension';dst.mkdir(parents=True,exist_ok=True)
files=['dashboard.js','dashboard.css','chart.min.js','utils.js','pro.js','theme-init.js','today-live-model.js','today-live.js','simulation-core.js','simulation-worker.js','simulation.js']
for name in files:shutil.copyfile(src/name,dst/name)
shutil.copytree(src/'icons',dst/'icons',dirs_exist_ok=True);shutil.copytree(src/'fonts',dst.parent/'fonts',dirs_exist_ok=True)
h=(src/'dashboard.html').read_text();h=re.sub(r'((?:src|href)=")((?!https?:|#)[^"]+)',lambda m:m[1]+'extension/'+m[2],h)
h=h.replace('<head>','''<head>
<meta name="robots" content="noindex,follow">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; worker-src 'self'; base-uri 'none'; form-action 'none'">
<script src="sample-data.js"></script>''')
h=h.replace('</head>','<link rel="stylesheet" href="embed.css"></head>').replace('</body>','<script src="embed.js"></script></body>')
(dst.parent/'index.html').write_text(h)
(dst.parent/'source-manifest.json').write_text(json.dumps({'source':'Sharpe 1.7.4','note':'Extension rendering and simulation files copied verbatim. Only browser APIs and input data are replaced in the sample adapter.','files':{name:hashlib.sha256((src/name).read_bytes()).hexdigest() for name in files},'html_source_sha256':hashlib.sha256((src/'dashboard.html').read_bytes()).hexdigest()},indent=2)+'\n')
