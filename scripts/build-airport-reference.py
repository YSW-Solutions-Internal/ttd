"""Build the airport reference CSV from OurAirports data.

Usage: python -I scripts/build-airport-reference.py airports.csv Airport_Reference.xlsx out.csv

airports.csv: https://davidmegginson.github.io/ourairports-data/airports.csv (public domain).
Airport_Reference.xlsx: the old reference; supplies city_code, tz and country names.
Output columns match public.airports, so it imports directly in the Supabase Table Editor.
Keeps every open airport with an IATA code (incl. lodge airstrips and seaplane bases).
"""
import csv,sys,zipfile,xml.etree.ElementTree as ET
src,oldx,out=sys.argv[1:4]
ns='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
old={}
for r in ET.fromstring(zipfile.ZipFile(oldx).read('xl/worksheets/sheet1.xml')).iter(ns+'row'):
    v=[''.join(t.text or '' for t in c.iter(ns+'t')) if c.get('t')=='inlineStr' else (c.findtext(ns+'v') or '') for c in r.findall(ns+'c')]
    if len(v)==10 and len(v[1])==3 and v[1]!='Airport Code': old[v[1]]=v
country={o[5]:o[4] for o in old.values()}
country.update({'AD':'Andorra','PS':'Palestine','PR':'Puerto Rico','VI':'Virgin Islands, U.S.','IO':'British Indian Ocean Territory','MC':'Monaco'})
hdr=['iata','icao','name','city','city_code','country','country_code','lat','lon','tz']  # public.airports columns
rows=[]; reused=[]
for r in csv.DictReader(open(src,encoding='utf-8')):
    code=r['iata_code'].strip().upper()
    if len(code)!=3 or r['type']=='closed': continue  # only IATA-coded, open airports are useful to the extractor
    cc=r['iso_country']; o=old.get(code)
    if o and o[5]!=cc: reused.append(code); o=None  # code reassigned to a different airport since the old list
    rows.append([code, r['icao_code'].strip(), r['name'].strip(),
        r['municipality'].strip() or (o[3] if o else '') or r['name'].strip(),
        o[2] if o else code, country.get(cc,cc), cc, r['latitude_deg'], r['longitude_deg'], o[7] if o else ''])
rows.sort(key=lambda x:x[0])
codes=[x[0] for x in rows]
assert len(codes)==len(set(codes)), 'duplicate IATA codes'
assert all(x[0] and x[2] and x[3] and x[5] for x in rows), 'blank code/city/country'
by={x[0]:x for x in rows}
assert len(old)>7000, 'old reference failed to load'
assert by['PLZ'][2].startswith('Chief Dawid') and by['HLA'][4]=='JNB' and by['LGW'][4]=='LON' and by['SSX'][9]==''
with open(out,'w',encoding='utf-8',newline='') as f:
    w=csv.writer(f); w.writerow(hdr); w.writerows(rows)
print('reassigned codes ignored:',len(reused),reused[:15]); print(len(rows),'rows written; blanks per column:',{h:sum(1 for x in rows if not x[i]) for i,h in enumerate(hdr)})
for c in ['JNB','PLZ','ZNZ','SSX','MLE','HLA']: print(by[c])
