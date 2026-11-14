from zipfile import ZipFile
from xml.etree import ElementTree as E
import re,posixpath
N={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def workbook(path):
 z=ZipFile(path);ss=[''.join(n.itertext()) for n in E.fromstring(z.read('xl/sharedStrings.xml'))] if 'xl/sharedStrings.xml' in z.namelist() else []
 rel={n.attrib['Id']:n.attrib['Target'] for n in E.fromstring(z.read('xl/_rels/workbook.xml.rels'))};wb=E.fromstring(z.read('xl/workbook.xml'));out={}
 for s in wb.find('m:sheets',N):
  target=rel[s.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']];p=posixpath.normpath(posixpath.join('xl',target)) if not target.startswith('/') else target[1:];cells={}
  for row in E.fromstring(z.read(p)).find('m:sheetData',N):
   for c in row:
    v=c.find('m:v',N);v=v.text if v is not None else None
    if c.attrib.get('t')=='s' and v is not None:v=ss[int(v)]
    elif c.attrib.get('t')=='inlineStr':v=''.join(c.find('m:is',N).itertext())
    elif v is not None:
     try:v=float(v);v=int(v) if v.is_integer() else v
     except ValueError:pass
    if v is not None:cells[c.attrib['r']]=v
  out[s.attrib['name']]=cells
 return out
if __name__=='__main__':
 import sys
 for name,cells in workbook(sys.argv[1]).items():
  print(name,len(cells));print(list(cells.items())[:42])
