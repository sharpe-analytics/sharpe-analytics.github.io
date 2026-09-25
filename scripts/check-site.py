#!/usr/bin/env python3
"""Dependency-free checks for the public content pages, assets and sitemap."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import json
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://sharpe-analytics.github.io'
PAGES = [ROOT / 'index.html', *sorted((ROOT / 'guides').glob('*/index.html'))]
errors = []
class Page(HTMLParser):
    def __init__(self, text):
        super().__init__(); self.tags=[]; self.ids=set(); self.title=''; self.in_title=False; self.ld=False; self.structured=[]; self.json_text=''; self.feed(text)
    def handle_starttag(self, tag, attrs):
        a=dict(attrs); self.tags.append((tag,a))
        if 'id' in a:
            if a['id'] in self.ids: errors.append('Duplicate id: '+a['id'])
            self.ids.add(a['id'])
        if tag=='title': self.in_title=True
        if tag=='script' and a.get('type')=='application/ld+json':self.ld=True;self.json_text=''
    def handle_data(self,data):
        if self.in_title:self.title+=data
        if self.ld:self.json_text+=data
    def handle_endtag(self,tag):
        if tag=='title':self.in_title=False
        if tag=='script' and self.ld:
            try:self.structured.append(json.loads(self.json_text))
            except ValueError:errors.append('Invalid JSON-LD')
            self.ld=False

def url_for(path):return '/' if path==ROOT/'index.html' else '/'+str(path.parent.relative_to(ROOT))+'/'
parsed={p:Page(p.read_text()) for p in PAGES}
titles=set();descriptions=set();canonicals=set()
for path,page in parsed.items():
    label=str(path.relative_to(ROOT))
    def check(ok,message):
        if not ok:errors.append(label+': '+message)
    check(bool(page.title) and page.title not in titles,'missing/duplicate title');titles.add(page.title)
    desc=[a.get('content') for t,a in page.tags if t=='meta' and a.get('name')=='description']
    check(len(desc)==1 and bool(desc[0]) and desc[0] not in descriptions,'missing/duplicate description');descriptions.update(desc)
    canonical=[a.get('href') for t,a in page.tags if t=='link' and a.get('rel')=='canonical']
    check(canonical==[BASE+url_for(path)],'wrong canonical');canonicals.update(canonical)
    check(sum(t=='h1' for t,a in page.tags)==1,'expected one h1')
    check(any(t=='html' and a.get('lang')=='en' for t,a in page.tags),'missing language')
    check(bool(page.structured),'missing structured data')
    for key in ('og:title','og:description','og:url','og:image'):
        check(any(t=='meta' and a.get('property')==key and a.get('content') for t,a in page.tags),'missing '+key)
    for tag,a in page.tags:
        if tag=='img':check('alt' in a and all(a.get(k) for k in ('width','height')),'image missing alt/dimensions')
        if tag=='script':check(not a.get('src') or a['src'].startswith('/assets/'),'unexpected remote script')
        links=[a[k] for k in ('href','src') if a.get(k)]
        if a.get('srcset'):links += [item.strip().split()[0] for item in a['srcset'].split(',')]
        if tag=='meta' and a.get('property')=='og:image':links.append(a['content'])
        for href in links:
            u=urlsplit(href)
            if u.netloc and u.netloc!='sharpe-analytics.github.io':
                if u.netloc=='chromewebstore.google.com':check(all(k+'=' in u.query for k in ('utm_source','utm_medium','utm_campaign','utm_content')),'store link lacks campaign parameters')
                continue
            if u.scheme and u.scheme not in ('http','https'):continue
            target=(ROOT/unquote(u.path).lstrip('/')) if u.path.startswith('/') else path.parent/unquote(u.path) if u.path else path
            if target.is_dir():target=target/'index.html'
            check(target.is_file(),'missing target '+href)
            if u.fragment and target.is_file() and target.suffix=='.html':
                target_page=parsed.get(target) or Page(target.read_text())
                check(unquote(u.fragment) in target_page.ids,'missing anchor '+href)
# CSS font references also need to survive publication.
for asset in re.findall(r"url\(['\"]?([^)'\"]+)", (ROOT/'assets/site.css').read_text()):
    if not (ROOT/asset.lstrip('/')).is_file():errors.append('Missing CSS asset: '+asset)
ns={'s':'http://www.sitemaps.org/schemas/sitemap/0.9'}
urls=[e.text for e in ET.parse(ROOT/'sitemap.xml').findall('s:url/s:loc',ns)]
if set(urls)!=canonicals or len(urls)!=len(canonicals):errors.append('Sitemap differs from canonical content pages')
if 'Sitemap: '+BASE+'/sitemap.xml' not in (ROOT/'robots.txt').read_text():errors.append('robots.txt missing sitemap')
if not (ROOT/'google373307fbd21e5f5e.html').is_file():errors.append('Search Console verification missing')
if not (ROOT/'activate.html').is_file():errors.append('Activation page missing')
if errors:raise SystemExit('\n'.join(errors))
print(f'Passed: {len(PAGES)} pages; metadata, structured data, assets, internal links, campaign links and sitemap.')
