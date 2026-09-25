"""Ensure the embedded chart/UI sources are the recorded, unmodified extension files."""
from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parents[1]/'demo'
manifest=json.loads((root/'source-manifest.json').read_text())
for name,expected in manifest['files'].items():
    assert hashlib.sha256((root/'extension'/name).read_bytes()).hexdigest()==expected, 'Extension source was modified: '+name
html=(root/'index.html').read_text()
assert 'content="noindex,follow"' in html
assert "connect-src 'none'" in html
assert 'sample-data.js' in html and 'embed.js' in html
assert 'https://' not in (root/'sample-data.js').read_text(), 'Sample adapter must not contact external services'
print('Passed: original extension source hashes and isolated sample adapter.')
