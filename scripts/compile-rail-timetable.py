from pathlib import Path
from collections import defaultdict
from rail_xlsx import workbook
import re,json,hashlib
ROOT=Path(__file__).resolve().parents[1];DIST=ROOT/'dist';INPUT=ROOT/'data-sources/intercity/originals';out=[];stations={};excluded=[]
def rc(p):
 a,b=re.fullmatch(r'([A-Z]+)(\d+)',p).groups();n=0
 for x in a:n=n*26+ord(x)-64
 return int(b),n
def xy(c):return {rc(p):v for p,v in c.items()}
def normalize(s):return re.sub(r'\s+','',str(s)).replace('신경주','경주').replace('울산(통도사)','울산').replace('홍성(도착)','홍성').replace('홍성(출발)','홍성')
def register(ko,en=''):
 ko=normalize(ko);entry=stations.setdefault(ko,{'ko':ko,'en':en.strip() if isinstance(en,str) and re.search('[A-Za-z]',en) else ''})
 if not entry['en'] and isinstance(en,str) and re.search('[A-Za-z]',en):entry['en']=en.strip()
 return ko
def days(raw,emptyDaily=False):
 s=re.sub(r'[\s,·]','',str(raw or '')).replace('요일','')
 if s=='매' or s=='매일':return list(range(7))
 if not s:return list(range(7)) if emptyDaily else None
 # Korean weekday tokens, no unparsed exceptions are silently treated as daily.
 if '~' in s:
  a,b=s.split('~',1)
  if a in '월화수목금토일' and b in '월화수목금토일':return list(range('월화수목금토일'.index(a),'월화수목금토일'.index(b)+1))
 if s and all(c in '월화수목금토일' for c in s):return sorted(set('월화수목금토일'.index(c) for c in s))
 return None
# KTX worksheets contain two horizontal, row-oriented tables with Korean + English station headers.
for sheet,raw in workbook(INPUT/'ktx-20261101.xlsx').items():
 c=xy(raw)
 for (hr,hc),v in c.items():
  if v!='열차번호':continue
  end=next((col for col in range(hc+2,hc+60) if isinstance(c.get((hr,col)),str) and '비고' in c[(hr,col)]),None)
  if not end:continue
  stops=[(col,register(c[(hr,col)],c.get((hr+2,col),''))) for col in range(hc+2,end) if c.get((hr,col))]
  for row in range(hr+3,max(r for r,col in c)+1):
   no=c.get((row,hc));kind=c.get((row,hc+1));rawdays=c.get((row,end))
   if not isinstance(no,int) or not isinstance(kind,str) or 'KTX' not in kind:continue
   ds=days(rawdays)
   if ds is None:excluded.append({'source':'ktx','sheet':sheet,'row':row,'no':no,'days':rawdays});continue
   path=[];offset=0;last=-1
   for col,name in stops:
    value=c.get((row,col))
    if not isinstance(value,(float,int)) or not 0<value<2:continue
    time=round(value*1440)
    if time+offset<last:offset+=1440
    time+=offset
    if last>=0 and time-last>900:raise ValueError(('time order',sheet,row,no,path,name,time))
    path.append([name,time]);last=time
   if len(path)>=2:out.append({'id':'K-'+sheet+'-'+str(row)+'-'+str(no),'no':str(no),'kind':kind,'line':sheet,'days':ds,'stops':path,'source':'korail-ktx-20261101'})
# General train tables are transposed: each numbered column is a train, and station rows end at the remarks row.
for sheet,raw in workbook(INPUT/'regional-20261101.xlsx').items():
 if sheet=='보는방법':continue
 c=xy(raw)
 for (hr,hc),v in c.items():
  if v!='열차번호':continue
  end=next((row for row in range(hr+1,hr+160) if normalize(c.get((row,hc),'')) in ['비고','종착역']),None)
  if not end:raise ValueError(('end',sheet,hr,hc))
  stoprows=[]
  for row in range(hr+1,end):
   name=c.get((row,hc));lastcol=max([col for (rr,col),no in c.items() if rr==hr and col>hc and isinstance(no,int) and col<min([cc for (rr,cc),v in c.items() if rr==hr and cc>hc and v=='열차번호'] or [10000])] or [hc]);en=c.get((row,lastcol+2),'')
   if isinstance(name,str) and re.fullmatch(r'[가-힣\s()]+',name):stoprows.append((row,register(name,en)))
  traincols=[col for (row,col),no in c.items() if row==hr and col>hc and isinstance(no,int)]
  # Stop at the next table's label column, if it begins on this same header row.
  boundary=min([col for (row,col),val in c.items() if row==hr and col>hc and val=='열차번호'] or [10000]);traincols=[col for col in traincols if col<boundary]
  for col in traincols:
   no=c[(hr,col)];kind=c.get((hr-1,col),'');ds=days(c.get((end,col)),emptyDaily=True)
   if ds is None:excluded.append({'source':'regional','sheet':sheet,'row':hr,'col':col,'no':no,'days':c.get((end,col))});continue
   path=[];start=c.get((hr-2,col));start=round(start*1440) if isinstance(start,(float,int)) else 0
   for row,name in stoprows:
    value=c.get((row,col))
    if not isinstance(value,(float,int)) or not 0<value<2:continue
    time=round(value*1440)
    while time<start:time+=1440
    path.append([name,time])
   path.sort(key=lambda p:p[1])
   if len(path)>=2:out.append({'id':'R-'+sheet+'-'+str(hr)+'-'+str(col)+'-'+str(no),'no':str(no),'kind':str(kind),'line':sheet,'days':ds,'stops':path,'source':'korail-regional-20261101'})
# Retain timetable facts only; preserve every conditional service's operating days.
seen=set();trains=[]
for train in out:
 merged=[]
 for call in train['stops']:
  if merged and merged[-1][0]==call[0]:
   prev=merged[-1];merged[-1]=[call[0],max(prev[1],call[1]),min(prev[2] if len(prev)>2 else prev[1],call[1])]
  else:merged.append(call)
 train['stops']=merged
 key=json.dumps([train['no'],train['kind'],train['days'],train['stops']],ensure_ascii=False)
 if key not in seen:seen.add(key);trains.append(train)
# Extract published triangular pair distance tables, grouped by diagonal to avoid crossing unrelated tables.
distance=[]
for sheet,raw in workbook(INPUT/'rail-distance-20240901.xlsx').items():
 c=xy(raw);groups=defaultdict(list)
 for (row,col),name in c.items():
  if isinstance(name,str):
   name=normalize(name)
   if name in stations:groups[row-col].append((row,col,name))
 for group in groups.values():
  group.sort()
  for i,(ra,ca,a) in enumerate(group):
   for rb,cb,b in group[i+1:]:
    value=c.get((ra,cb),c.get((rb,ca)))
    if a!=b and isinstance(value,(int,float)) and .1<value<1000:distance.append([a,b,round(value,1),sheet])
# Repeated station names are keyed by their official name; coordinates are added only from verified sources later.
compiled={'v':1,'version':'korail-20261101','effectiveFrom':'2026-11-01','checkedAt':'2026-11-14','sourceURL':'https://www.korail.com/com/userBoard.do?mode=list&schBcid=ticketTable','distanceSource':'https://www.data.go.kr/data/15137040/fileData.do','distanceDate':'2024-09-01','stations':stations,'trains':trains,'distances':distance}
(DIST/'intercity-rail.json').write_text(json.dumps(compiled,ensure_ascii=False,separators=(',',':'))+'\n')
(INPUT/'compile-report.json').write_text(json.dumps({'trainCount':len(trains),'stationCount':len(stations),'distancePairs':len(distance),'excluded':excluded,'kinds':sorted(set(t['kind'] for t in trains))},ensure_ascii=False,indent=2))
print('trains',len(trains),'stations',len(stations),'distancePairs',len(distance),'excluded',excluded[:8]);print('kinds',sorted(set(t['kind'] for t in trains)))
print('Seoul-Busan Saturday',[(t['no'],t['kind'],t['stops'][0],t['stops'][-1]) for t in trains if t['stops'][0][0]=='서울' and t['stops'][-1][0]=='부산' and 5 in t['days']][:4])
