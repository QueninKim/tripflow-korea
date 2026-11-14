from pathlib import Path
import csv,json
root=Path(__file__).resolve().parents[1];p=root/'dist/intercity-rail.json';d=json.loads(p.read_text());rows=list(csv.DictReader((root/'data-sources/intercity/originals/station-locations.csv').read_text(encoding='cp949').splitlines()))
# Pangyo in Gyeonggi and Pangyo in Chungnam are different railway stations.
if '판교' in d['stations']:
 old=d['stations'].pop('판교')
 for key,suffix in [('판교(경기)','Gyeonggi'),('판교(충남)','Chungnam')]:d['stations'][key]={**old,'ko':key,'en':'Pangyo ('+suffix+')'}
 for train in d['trains']:
  for stop in train['stops']:
   if stop[0]=='판교':stop[0]='판교(경기)' if train['line']=='중부내륙선' else '판교(충남)'
 for pair in d['distances']:
  for i in [0,1]:
   if pair[i]=='판교':pair[i]='판교(경기)' if '경강' in pair[3] else '판교(충남)'
for row in rows:
 name=row['역명'].strip().replace('신경주','경주')
 if name=='판교':name='판교(충남)' # The original CSV row belongs to the Janghang line; Gyeonggang was not included.
 try:lat,lon=float(row['위도']),float(row['경도'])
 except:continue
 if name=='행신':continue # Published coordinate is geographically inconsistent; do not use it for appending a station place.
 if name in d['stations'] and 33<=lat<=39 and 124<=lon<=132:d['stations'][name].update(latitude=lat,longitude=lon,positionSource='korail-20240401')
d['locationSource']='https://www.data.go.kr/data/15127532/fileData.do';d['locationDate']='2024-04-01';p.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':'))+'\n');print('locations',sum('latitude' in s for s in d['stations'].values()),'of',len(d['stations']));print([r for r in rows if r['역명']=='판교'])
