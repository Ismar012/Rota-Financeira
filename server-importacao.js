'use strict';
const JSZip=require('jszip');const {XMLParser,XMLValidator}=require('fast-xml-parser');const crypto=require('node:crypto');
const {TYPES}=require('./perfis-financeiros');
const HEADERS=['Tipo','Descricao','Valor','Data inicial','Vencimento','Quitado','Data quitacao','Ambito','Atividade','Categoria'];
const arr=x=>x==null?[]:Array.isArray(x)?x:[x];
const folded=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const parser=new XMLParser({ignoreAttributes:false,removeNSPrefix:true,parseTagValue:false,parseAttributeValue:false,processEntities:true});
function xml(s){if(/<!DOCTYPE|<!ENTITY/i.test(s)||XMLValidator.validate(s)!==true)throw Error('Estrutura XML inválida.');return parser.parse(s);}
function zipBounds(b){
  if(b.length>1024*1024)throw Error('Arquivo maior que 1 MB.');let end=-1;
  for(let p=b.length-22;p>=Math.max(0,b.length-65557);p--)if(b.readUInt32LE(p)===0x06054b50){end=p;break;}
  if(end<0)throw Error('Envie um arquivo Excel .xlsx válido, sem senha.');
  const count=b.readUInt16LE(end+10),offset=b.readUInt32LE(end+16);if(count>150||!count)throw Error('Arquivo complexo demais. Use o modelo da plataforma.');
  let p=offset,total=0;for(let i=0;i<count;i++){if(p+46>b.length||b.readUInt32LE(p)!==0x02014b50)throw Error('Arquivo ZIP inválido.');total+=b.readUInt32LE(p+24);p+=46+b.readUInt16LE(p+28)+b.readUInt16LE(p+30)+b.readUInt16LE(p+32);}
  if(total>8*1024*1024)throw Error('Conteúdo expandido maior que 8 MB. Use o modelo da plataforma.');
}
function txt(v){if(v==null)return '';if(typeof v!=='object')return String(v);if(v.t!=null)return txt(v.t);if(v['#text']!=null)return String(v['#text']);if(v.r)return arr(v.r).map(txt).join('');return '';}
function date(v,date1904=false){
  if(typeof v==='number'){
    if(!Number.isInteger(v)||v<1||(!date1904&&v===60))return null;
    const base=date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,30);if(!date1904&&v<60)v++;
    return new Date(base+v*86400000).toISOString().slice(0,10);
  }
  let s=String(v??'').trim();const m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(m)s=`${m[3]}-${m[2]}-${m[1]}`;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;const d=new Date(s+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s?s:null;
}
function key(r){return JSON.stringify([r.type,String(r.name).trim().toLowerCase(),Number(r.amount).toFixed(2),String(r.created_date).slice(0,10),String(r.due_date).slice(0,10)]);}
function validate(raw,{today,activities,date1904=false}={}){
  const errors=[],rows=[],seen=new Set();const fail=(line,field,message)=>errors.push({line,field,message});
  if(raw.length>500)throw Error('O limite é de 500 lançamentos por arquivo.');
  for(const {line,values:v,formula}of raw){if(formula){fail(line,'Fórmula','Substitua fórmulas por valores.');continue;}
    if(v.length>10){fail(line,'Colunas','Existem valores fora das dez colunas do modelo.');continue;}
    const type={ganho:'income',despesa:'expense'}[folded(v[0])];if(!type)fail(line,'Tipo','Use ganho ou despesa.');
    const name=String(v[1]??'').trim();if(!name||name.length>120)fail(line,'Descricao','Informe entre 1 e 120 caracteres.');
    const amount=typeof v[2]==='number'?v[2]:/^[0-9]+(?:[.,][0-9]{1,2})?$/.test(String(v[2]??'').trim())?Number(String(v[2]).replace(',','.')):NaN;
    if(!Number.isFinite(amount)||amount<=0||amount>999999999999.99||Math.abs(amount*100-Math.round(amount*100))>0.001)fail(line,'Valor','Informe número positivo, com até duas casas decimais.');
    const created_date=date(v[3],date1904),due_date=date(v[4],date1904),paid_date=v[6]==null||v[6]===''?null:date(v[6],date1904);
    if(!created_date)fail(line,'Data inicial','Data inválida.');if(!due_date)fail(line,'Vencimento','Data inválida.');
    if(created_date&&due_date&&created_date>due_date)fail(line,'Vencimento','Não pode ser anterior à data inicial.');
    const paid={sim:1,nao:0}[folded(v[5])];if(paid==null)fail(line,'Quitado','Use sim ou nao.');
    if(paid===1&&(!paid_date||paid_date<created_date||paid_date>today))fail(line,'Data quitacao','Informe uma data entre o início e hoje.');
    if(paid===0&&v[6]!=null&&v[6]!=='')fail(line,'Data quitacao','Deixe vazia para lançamento não quitado.');
    const scope=folded(v[7]);if(!['pessoal','profissional'].includes(scope))fail(line,'Ambito','Use pessoal ou profissional.');
    const activity=folded(v[8]);if(activity&&(!Object.hasOwn(TYPES,activity)||(activities&&!activities.includes(activity))))fail(line,'Atividade','Use uma atividade selecionada no seu perfil financeiro.');
    const category=String(v[9]??'').trim();if(category.length>60)fail(line,'Categoria','Use até 60 caracteres.');
    const row={line,type,name,amount,created_date,due_date,paid,paid_date,scope,activity,category};const k=key(row);if(seen.has(k))fail(line,'Duplicidade','Lançamento repetido neste arquivo.');seen.add(k);rows.push(row);
  }
  if(!raw.length)fail(2,'Arquivo','Preencha a aba Lancamentos. A aba Exemplo não é importada.');
  return {rows,errors};
}
async function parse(buffer,options){
  zipBounds(buffer);const zip=await JSZip.loadAsync(buffer);if(Object.keys(zip.files).some(n=>/vbaProject|externalLinks/i.test(n)))throw Error('Macros e vínculos externos não são aceitos.');
  async function read(n){const f=zip.file(n);if(!f)throw Error('Estrutura Excel incompleta. Use o modelo.');const bytes=await new Promise((resolve,reject)=>{const chunks=[];let size=0,failed=false;const stream=f.nodeStream('nodebuffer');stream.on('data',chunk=>{if(failed)return;size+=chunk.length;if(size>8*1024*1024){failed=true;stream.pause();if(stream.destroy)stream.destroy();reject(Error('Conteúdo expandido maior que 8 MB.'));return;}chunks.push(chunk);});stream.on('end',()=>{if(!failed)resolve(Buffer.concat(chunks));});stream.on('error',reject);});return xml(bytes.toString('utf8'));}
  const book=(await read('xl/workbook.xml')).workbook;const sheet=arr(book.sheets.sheet).find(s=>s['@_name']==='Lancamentos');if(!sheet)throw Error('A aba Lancamentos não foi encontrada.');
  const rels=(await read('xl/_rels/workbook.xml.rels')).Relationships;const relation=arr(rels.Relationship).find(r=>r['@_Id']===(sheet['@_id'] || sheet['@_r:id']));if(!relation||relation['@_TargetMode']==='External')throw Error('Aba inválida.');
  const target=require('node:path').posix.normalize(relation['@_Target'].startsWith('/')?relation['@_Target'].slice(1):'xl/'+relation['@_Target']);if(!/^xl\/worksheets\/[^/]+\.xml$/.test(target))throw Error('Caminho da aba inválido.');
  const shared=zip.file('xl/sharedStrings.xml')?arr((await read('xl/sharedStrings.xml')).sst.si).map(txt):[];
  const sheetData=(await read(target)).worksheet;const raw=[];let header;
  for(const r of arr(sheetData.sheetData?.row)){
    const line=Number(r['@_r']);if(!Number.isInteger(line)||line<1||line>2000)throw Error('Linhas fora do limite. Use até 500 lançamentos.');const values=[];let formula=false;
    for(const c of arr(r.c)){
      const match=String(c['@_r']).match(/^([A-Z]{1,3})(\d+)$/);if(!match||Number(match[2])!==line)throw Error('Endereço de célula inválido.');let index=0;for(const x of match[1])index=index*26+x.charCodeAt(0)-64;index--;
      if(Object.hasOwn(c,'f'))formula=true;
      let value=c['@_t']==='s'?shared[Number(c.v)]:c['@_t']==='inlineStr'?txt(c.is):c.v??'';
      if(c['@_t']==='d'&&/^\d{4}-\d{2}-\d{2}T00:00:00(?:\.0+)?Z?$/.test(String(value)))value=String(value).slice(0,10);
      if(!c['@_t']||c['@_t']==='n')value=value===''?'':Number(value);
      if(value!==''&&value!=null)values[index]=value;
    }
    if(line===1){header=values;if(formula)throw Error('Cabeçalho com fórmula.');}else if(formula||values.some(x=>x!==''&&x!=null))raw.push({line,values,formula});
  }
  if(!header||header.length!==10||HEADERS.some((h,i)=>folded(h)!==folded(header[i])))throw Error('Cabeçalhos diferentes do modelo. Preserve as dez colunas e sua ordem.');
  return validate(raw,{...options,date1904:['1','true'].includes(book.workbookPr?.['@_date1904'])});
}
async function install(pool){await pool.query(`
  ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS financial_scope VARCHAR(20);
  ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS financial_activity VARCHAR(20);
  ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS financial_category VARCHAR(60);
  CREATE TABLE IF NOT EXISTS finance_imports(id UUID PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,rows JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),committed_at TIMESTAMPTZ);
`);}
async function duplicates(client,userId,rows){const existing=await client.query('SELECT type,name,amount,created_date::text,due_date::text FROM finance_entries WHERE user_id=$1',[userId]);const keys=new Set(existing.rows.map(key));return rows.filter(r=>keys.has(key(r))).map(r=>({line:r.line,field:'Duplicidade',message:'Já existe lançamento com mesmo tipo, nome, valor e datas. Nenhuma linha foi importada.'}));}
async function readFile(req){return new Promise((resolve,reject)=>{let size=0,chunks=[];req.on('data',c=>{size+=c.length;if(size>1024*1024){chunks=[];}else chunks.push(c);});req.on('end',()=>size>1024*1024?reject(Error('Arquivo maior que 1 MB.')):resolve(Buffer.concat(chunks)));req.on('error',reject);});}
function create({pool,requireUser,sendJson,readBody,getTodayLocal}){
  return {async handle(req,res,url){if(!url.startsWith('/api/finance/import'))return false;const user=await requireUser(req,res);if(!user)return true;
    if(req.method!=='POST')return sendJson(res,405,{error:'Método não permitido.'});
    if(url==='/api/finance/import/preview'){
      try{
        const config=await pool.query('SELECT financial_profile FROM users WHERE id=$1',[user.id]);const activities=config.rows[0]?.financial_profile?.activities;
        const result=await parse(await readFile(req),{today:getTodayLocal(),activities});
        if(!result.errors.length)result.errors.push(...await duplicates(pool,user.id,result.rows));
        if(result.errors.length)return sendJson(res,422,{errors:result.errors,error:'Corrija as linhas indicadas. Nenhum lançamento foi salvo.'});
        await pool.query("DELETE FROM finance_imports WHERE committed_at IS NULL AND created_at < now()-interval '15 minutes'");
        const id=crypto.randomUUID();await pool.query('INSERT INTO finance_imports(id,user_id,rows) VALUES($1,$2,$3)',[id,user.id,JSON.stringify(result.rows)]);
        return sendJson(res,200,{id,rows:result.rows,totals:{income:result.rows.filter(r=>r.type==='income').reduce((s,r)=>s+Math.round(r.amount*100),0)/100,expense:result.rows.filter(r=>r.type==='expense').reduce((s,r)=>s+Math.round(r.amount*100),0)/100}});
      }catch(e){return sendJson(res,400,{error:e.code?'Não foi possível conferir o arquivo. Tente novamente.':e.message||'Arquivo inválido.'});}
    }
    if(url==='/api/finance/import/commit'){
      const body=await readBody(req);if(!/^[0-9a-f-]{36}$/i.test(String(body.id)))return sendJson(res,400,{error:'Importação inválida.'});
      const client=await pool.connect();try{
        await client.query('BEGIN');await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[user.id]);
        const batch=(await client.query('SELECT *,created_at < now()-interval \'15 minutes\' AS expired FROM finance_imports WHERE id=$1 AND user_id=$2 FOR UPDATE',[body.id,user.id])).rows[0];
        if(!batch){await client.query('ROLLBACK');return sendJson(res,404,{error:'Importação não encontrada.'});}
        if(batch.committed_at){await client.query('ROLLBACK');return sendJson(res,200,{message:'Este lote já foi importado.',count:batch.rows.length});}
        if(batch.expired){await client.query('ROLLBACK');return sendJson(res,409,{error:'A conferência expirou. Selecione e valide o arquivo novamente.'});}
        const errors=await duplicates(client,user.id,batch.rows);if(errors.length){await client.query('ROLLBACK');return sendJson(res,409,{error:'Há lançamentos já cadastrados. Nenhuma linha foi importada.',errors});}
        for(const r of batch.rows)await client.query(`INSERT INTO finance_entries(user_id,type,name,amount,created_date,due_date,paid,paid_date,paid_at,recurrence_type,request_id,financial_scope,financial_activity,financial_category) VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $7::smallint=1 THEN ($8::date::timestamp AT TIME ZONE 'America/Bahia') ELSE NULL END,'single',$9,$10,$11,$12)`,[user.id,r.type,r.name,r.amount,r.created_date,r.due_date,r.paid,r.paid_date,'xlsx:'+crypto.createHash('sha256').update(key(r)).digest('hex'),r.scope,r.activity||null,r.category||null]);
        await client.query('UPDATE finance_imports SET committed_at=now() WHERE id=$1',[body.id]);await client.query('COMMIT');return sendJson(res,201,{count:batch.rows.length,message:'Todos os lançamentos foram importados.'});
      }catch(e){try{await client.query('ROLLBACK');}catch{}console.error('Importação:',e.code||'falha de transação');return sendJson(res,500,{error:'Não foi possível confirmar o resultado. Tente novamente com a mesma confirmação para evitar duplicação.'});}finally{client.release();}
    }
    return sendJson(res,404,{error:'Rota não encontrada.'});
  }};
}
module.exports={parse,validate,date,key,install,create,zipBounds};
