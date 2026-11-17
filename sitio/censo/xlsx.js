const utf8 = new TextEncoder();
const xl = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const pkg = 'http://schemas.openxmlformats.org/package/2006/relationships';
const types = 'http://schemas.openxmlformats.org/package/2006/content-types';
const xml = input => String(input ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
const crcTable = Uint32Array.from({length:256}, (_, i) => {
  let n = i;
  for (let k=0; k<8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n;
});
function crc32(bytes) {
  let out = 0xffffffff;
  for (const byte of bytes) out = crcTable[(out ^ byte) & 255] ^ (out >>> 8);
  return (out ^ 0xffffffff) >>> 0;
}
function header(size, fields) {
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  for (const [start,width,value] of fields) {
    if (width===2) view.setUint16(start,value,true);
    else view.setUint32(start,value,true);
  }
  return out;
}
function zip(files) {
  const locals=[], central=[];
  let offset=0, centralSize=0;
  for (const [name,text] of files) {
    const fname=utf8.encode(name), data=utf8.encode(text), crc=crc32(data);
    const size=data.length, len=fname.length;
    const f=header(30,[[0,4,0x04034b50],[4,2,20],[12,2,33],[14,4,crc],[18,4,size],[22,4,size],[26,2,len]]);
    const c=header(46,[[0,4,0x02014b50],[4,2,20],[6,2,20],[14,2,33],[16,4,crc],[20,4,size],[24,4,size],[28,2,len],[42,4,offset]]);
    locals.push(f,fname,data);
    central.push(c,fname);
    offset+=f.length+len+size;
    centralSize+=c.length+len;
  }
  const end=header(22,[[0,4,0x06054b50],[8,2,files.length],[10,2,files.length],[12,4,centralSize],[16,4,offset]]);
  return new Blob([...locals,...central,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function colName(index) {
  let name='';
  for (let n=index+1;n;n=Math.floor((n-1)/26)) name=String.fromCharCode(65+(n-1)%26)+name;
  return name;
}
function worksheet(rows) {
  const cells=rows.map((row,i)=>'<row r="'+(i+1)+'">'+row.map((value,j)=>{
    const ref=colName(j)+(i+1);
    if (typeof value==='number'&&Number.isFinite(value)) return '<c r="'+ref+'"><v>'+value+'</v></c>';
    return '<c r="'+ref+'" t="inlineStr"'+(!i?' s="1"':'')+'><is><t xml:space="preserve">'+xml(value)+'</t></is></c>';
  }).join('')+'</row>').join('');
  const width=rows[0].length;
  return '<worksheet xmlns="'+xl+'"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="'+width+'" width="23" customWidth="1"/></cols><sheetData>'+cells+'</sheetData><autoFilter ref="A1:'+colName(width-1)+rows.length+'"/></worksheet>';
}
const styles='<styleSheet xmlns="'+xl+'"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF087263"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
export function workbook(sheets) {
  const sheetRefs=sheets.map(([name],i)=>'<sheet name="'+xml(name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('');
  const sheetRel=sheets.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="'+rel+'/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('');
  const dirTypes=sheets.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('');
  return zip([
    ['[Content_Types].xml','<Types xmlns="'+types+'"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+dirTypes+'</Types>'],
    ['_rels/.rels','<Relationships xmlns="'+pkg+'"><Relationship Id="rId1" Type="'+rel+'/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml','<workbook xmlns="'+xl+'" xmlns:r="'+rel+'"><sheets>'+sheetRefs+'</sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels','<Relationships xmlns="'+pkg+'">'+sheetRel+'<Relationship Id="rId'+(sheets.length+1)+'" Type="'+rel+'/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml',styles],
    ...sheets.map(([,rows],i)=>['xl/worksheets/sheet'+(i+1)+'.xml',worksheet(rows)])
  ]);
}
