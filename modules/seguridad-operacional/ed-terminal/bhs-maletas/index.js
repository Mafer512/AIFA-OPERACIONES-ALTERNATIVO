(function(){
'use strict';

// ── helpers ──────────────────────────────────────────────────
function timeToMinutes(t){
    if(!t) return null;
    var parts=String(t).split(':');
    if(parts.length<2) return null;
    return parseInt(parts[0],10)*60+parseInt(parts[1],10);
}
function fmtNum(n){ return n==null?'—':new Intl.NumberFormat('es-MX').format(n); }
function today(){ return new Date().toISOString().slice(0,10); }
// YYYY-MM-DD → DD-MM-YY
function fmtDate(iso){
    if(!iso) return '—';
    var p=String(iso).split('-');
    if(p.length!==3) return iso;
    return p[2]+'-'+p[1]+'-'+p[0].slice(2);
}
// Correct day-boundary anticipation values:
// hora_prog_mins - primera_maleta_mins can go very negative when bag
// was stored the night before (e.g. 06:00 flight, bag at 23:48 = -1068)
// Adding 1440 gives real anticipation: 372 min = 6h12m
function correctAnticip(v){
    if(v==null) return null;
    return v < -480 ? v+1440 : v;
}
// Format minutes as 'Xh YYm'
function fmtMinutos(m){
    if(m==null) return '—';
    var abs=Math.abs(m);
    var h=Math.floor(abs/60), min=abs%60;
    var sign=m<0?'-':'';
    if(h>0) return sign+h+'h'+(min>0?' '+min+'m':'');
    return sign+min+'m';
}

// Tag prefix → IATA + nombre aerolínea
var BHS_TAG_PREFIX={
    '3139':['AM','Aeroméxico'],
    '0036':['Y4','Volaris'],
    '0333':['VB','VivaAerobus'],
    '3713':['XN','Mexicana de Aviación'],
    '0181':['DM','Arajet'],
    '0723':['ZV','Aerus']
};
function airlineFromTag(tag){
    var t=String(tag).replace(/\D/g,'');
    var keys=Object.keys(BHS_TAG_PREFIX);
    for(var i=0;i<keys.length;i++){
        if(t.startsWith(keys[i])) return BHS_TAG_PREFIX[keys[i]];
    }
    return null;
}

// ── Fecha cargada por pestaña ─────────────────────────────────
// Cada tabla (llegadas/salidas/sin vuelo) puede tener su propia
// fecha más reciente, por eso el badge se ajusta a la pestaña activa.
var _bhsTabDate = { arr:null, dep:null, bwf:null };
function bhsCurrentTab(){
    var active=document.querySelector('.bhs-tab-btn.active');
    if(active){
        var m=(active.getAttribute('onclick')||'').match(/'(arr|dep|bwf)'/);
        if(m) return m[1];
    }
    return 'arr';
}
function bhsUpdateDateBadge(){
    var badge=document.getElementById('bhs-loaded-date');
    if(!badge) return;
    var d=_bhsTabDate[bhsCurrentTab()];
    badge.textContent = d ? ('\uD83D\uDCC5 '+fmtDate(d)) : 'Sin datos';
}

// ── dates panel ───────────────────────────────────────────────
window.bhsToggleDates=function(){
    var panel=document.getElementById('bhs-dates-panel');
    if(!panel) return;
    var hidden=panel.classList.toggle('d-none');
    if(!hidden) bhsLoadAvailableDates();
};
function bhsLoadAvailableDates(){
    var client=window.supabaseClient;
    if(!client) return;
    var list=document.getElementById('bhs-dates-list');
    if(list) list.innerHTML='<div class="col-12 text-muted small">Cargando…</div>';
    Promise.all([
        client.from('bhs_arrivals').select('fecha'),
        client.from('bhs_departures').select('fecha'),
        client.from('bhs_bags_without_flight').select('fecha')
    ]).then(function(res){
        var arrD=new Set((res[0].data||[]).map(function(r){return r.fecha;}));
        var depD=new Set((res[1].data||[]).map(function(r){return r.fecha;}));
        var bwfD=new Set((res[2].data||[]).map(function(r){return r.fecha;}));
        var all=[...new Set([...arrD,...depD,...bwfD])].sort().reverse();
        if(!all.length){
            if(list) list.innerHTML='<div class="col-12 text-muted small">No hay datos cargados aún</div>';
            return;
        }
        if(list) list.innerHTML=all.map(function(d){
            var icons='';
            if(arrD.has(d)) icons+=' <span class="badge" style="background:#eff6ff;color:#2196f3;font-size:.65rem;" title="Llegadas"><i class="fas fa-plane-arrival"></i></span>';
            if(depD.has(d)) icons+=' <span class="badge" style="background:#fff7ed;color:#ea580c;font-size:.65rem;" title="Salidas"><i class="fas fa-plane-departure"></i></span>';
            if(bwfD.has(d)) icons+=' <span class="badge" style="background:#f0fdf4;color:#16a34a;font-size:.65rem;" title="Sin vuelo"><i class="fas fa-tag"></i></span>';
            return '<div class="col-auto mb-1"><button class="btn btn-sm btn-outline-secondary" style="font-size:.78rem;" onclick="document.getElementById(\'bhs-date-filter\').value=\''+d+'\';document.getElementById(\'bhs-dates-panel\').classList.add(\'d-none\');bhsLoadDate();">'+fmtDate(d)+icons+'</button></div>';
        }).join('');
    }).catch(function(e){ if(list) list.innerHTML='<div class="col-12 text-danger small">Error: '+e.message+'</div>'; });
}

// ── tab switching ─────────────────────────────────────────────
window.bhsShowTab=function(tab,btn){
    ['arr','dep','bwf'].forEach(function(t){
        var el=document.getElementById('bhs-tab-'+t);
        if(el) el.classList.toggle('d-none', t!==tab);
    });
    document.querySelectorAll('.bhs-tab-btn').forEach(function(b){
        b.classList.remove('active');
    });
    if(btn){ btn.classList.add('active'); }
    bhsUpdateDateBadge();
};

// ── drag & drop ───────────────────────────────────────────────
var _bhsPendingFile=null, _bhsPendingType=null;
var _bhsUploadBusy={arrivals:false,departures:false,bwf:false};

function bhsAskDate(file,type){
    _bhsPendingFile=file; _bhsPendingType=type;
    var inp=document.getElementById('bhs-date-modal-input');
    var fname=document.getElementById('bhs-date-modal-fname');
    if(inp) inp.value=document.getElementById('bhs-date-filter').value||today();
    if(fname) fname.textContent=file.name;
    var labels={'arrivals':'Llegadas (Arrivals)','departures':'Salidas (Departures)','bwf':'Bags Without Flight'};
    var lbl=document.getElementById('bhs-date-modal-label');
    if(lbl) lbl.innerHTML='<i class="fas fa-calendar-day me-2"></i>Fecha del archivo: '+labels[type];
    var modal=bootstrap.Modal.getOrCreateInstance(document.getElementById('bhs-date-modal'));
    modal.show();
}

// El loader inyecta este archivo despues de DOMContentLoaded, asi que ese
// evento ya no llega. Lo que colgaba de el pasa a llamarse desde init().
var _modalCableado = false;
function cablearModalFecha(){
    if(_modalCableado) return;
    _modalCableado = true;
    var okBtn=document.getElementById('bhs-date-modal-ok');
    if(okBtn) okBtn.addEventListener('click',function(){
        var inp=document.getElementById('bhs-date-modal-input');
        if(!inp||!inp.value){alert('Selecciona una fecha');return;}
        // sync main date filter
        var df=document.getElementById('bhs-date-filter');
        if(df) df.value=inp.value;
        var modal=bootstrap.Modal.getInstance(document.getElementById('bhs-date-modal'));
        if(modal) modal.hide();
        if(_bhsPendingFile) bhsProcess(_bhsPendingFile,_bhsPendingType);
        _bhsPendingFile=null; _bhsPendingType=null;
    });
}

window.bhsHandleDrop=function(e,type){
    e.preventDefault();
    var id={'arrivals':'bhs-arr-drop','departures':'bhs-dep-drop','bwf':'bhs-bwf-drop'}[type];
    var card=document.getElementById(id);
    if(card) card.classList.remove('dragover');
    var file=e.dataTransfer.files[0];
    if(file) bhsAskDate(file,type);
};

window.bhsHandleFile=function(input,type){
    try{
        if(input.files[0]) bhsAskDate(input.files[0],type);
    }finally{
        // Permite volver a seleccionar el mismo archivo, incluso con el mismo nombre.
        input.value='';
    }
};

// ── date loader (from Supabase) ───────────────────────────────
window.bhsLoadDate=function(){
    var d=document.getElementById('bhs-date-filter').value;
    if(!d){ alert('Selecciona una fecha'); return; }
    bhsLoadFromDB(d);
};

function bhsLoadFromDB(fecha){
    var client=window.supabaseClient;
    if(!client) return;
    document.getElementById('bhs-loaded-date').textContent='Cargando '+fmtDate(fecha)+'…';

    Promise.all([
        client.from('bhs_arrivals').select('*').eq('fecha',fecha),
        client.from('bhs_departures').select('*').eq('fecha',fecha),
        client.from('bhs_bags_without_flight').select('*').eq('fecha',fecha)
    ]).then(function(results){
        if(!results[0].error){ bhsRenderArrivals(results[0].data||[]); _bhsTabDate.arr=fecha; }
        if(!results[1].error){ bhsRenderDepartures(results[1].data||[]); _bhsTabDate.dep=fecha; }
        if(!results[2].error){ bhsRenderBWF(results[2].data||[]); _bhsTabDate.bwf=fecha; }
        bhsUpdateDateBadge();
    }).catch(function(err){
        console.error('BHS load error',err);
    });
}

// ── PROCESS Excel ─────────────────────────────────────────────
function bhsSetUploadState(type,state,msg){
    var cardId={'arrivals':'bhs-arr-drop','departures':'bhs-dep-drop','bwf':'bhs-bwf-drop'}[type];
    var statusId={'arrivals':'bhs-arr-status','departures':'bhs-dep-status','bwf':'bhs-bwf-status'}[type];
    var card=document.getElementById(cardId);
    var status=document.getElementById(statusId);
    if(card){
        card.classList.toggle('loading',state==='loading');
        if(state!=='ok') card.classList.remove('ok');
        if(state==='ok') card.classList.add('ok');
    }
    if(status && msg) status.innerHTML=msg;
}

function bhsResetFileInput(type){
    var id={'arrivals':'bhs-arr-input','departures':'bhs-dep-input','bwf':'bhs-bwf-input'}[type];
    var input=document.getElementById(id);
    if(input) input.value='';
}

function bhsValidateFile(file,type){
    if(!file) throw new Error('No se seleccionó ningún archivo.');
    var name=String(file.name||'');
    if(!/\.(xlsx|xls)$/i.test(name)) throw new Error('Formato no válido. Selecciona un archivo .xlsx o .xls.');
    if(!file.size) throw new Error('El archivo está vacío.');
    if(type==='arrivals' && _bhsUploadBusy.arrivals) throw new Error('Ya hay una carga de Llegadas en proceso. Espera a que termine.');
}

function bhsProcess(file,type){
    var statusId={'arrivals':'bhs-arr-status','departures':'bhs-dep-status','bwf':'bhs-bwf-status'}[type];
    var status=document.getElementById(statusId);
    try{ bhsValidateFile(file,type); }
    catch(preErr){
        bhsSetUploadState(type,'error','<span style="color:#dc2626">'+preErr.message+'</span>');
        bhsResetFileInput(type);
        console.error('[BHS] Upload rejected:',preErr.message);
        return;
    }

    _bhsUploadBusy[type]=true;
    bhsSetUploadState(type,'loading','Cargando…');
    console.log('[BHS] Inicio de carga:',{
        tipo:type,
        archivo:file.name,
        tamanio:file.size
    });

    var reader=new FileReader();
    reader.onerror=function(){
        _bhsUploadBusy[type]=false;
        bhsResetFileInput(type);
        var err=new Error('No se pudo leer el archivo seleccionado.');
        bhsSetUploadState(type,'error','<span style="color:#dc2626">'+err.message+'</span>');
        console.error('[BHS] FileReader error:',reader.error||err);
    };
    reader.onload=function(e){
        try{
            if(!window.XLSX) throw new Error('La librería XLSX no está disponible. Recarga la página e intenta nuevamente.');
            var wb=XLSX.read(e.target.result,{type:'array',cellDates:true});
            if(!wb.SheetNames||!wb.SheetNames.length) throw new Error('El archivo no contiene hojas para procesar.');
            var ws=wb.Sheets[wb.SheetNames[0]];
            if(!ws) throw new Error('No se encontró la primera hoja del archivo.');
            var raw=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
            if(!raw.length) throw new Error('Archivo vacio');
            var HDR_KW=['cia','vuelo','flight','tag','hora','plat','dest','proc','term','tras','maleta','origen','destino','compan','primera','ultima','etd'];
            var headerIdx=0,bestScore=-1;
            for(var ri=0;ri<Math.min(raw.length,15);ri++){
                var rowArr=raw[ri];var score=0;
                for(var ci=0;ci<rowArr.length;ci++){var cell=norm(String(rowArr[ci]));HDR_KW.forEach(function(kw){if(cell.includes(kw))score+=3;});if(cell.length>1&&cell.length<40)score+=1;}
                if(score>bestScore){bestScore=score;headerIdx=ri;}
            }
            var headers=raw[headerIdx].map(function(h){return String(h).trim();});
            console.log('[BHS] Hoja procesada:',wb.SheetNames[0]);
            console.log('[BHS] File:',file.name,'| Header row:',headerIdx,'| Cols:',headers);
            var rows=[];
            for(var di=headerIdx+1;di<raw.length;di++){
                var dr=raw[di];
                if(dr.every(function(c){return String(c).trim()=='';})){continue;}
                var obj={};headers.forEach(function(h,i){obj[h]=dr[i]!==undefined?dr[i]:'';});rows.push(obj);
            }
            if(!rows.length) throw new Error('Sin filas de datos. Header fila '+headerIdx+': '+headers.join(', '));
            var colNames=headers.filter(function(h){return h.trim()!='';}).join(' | ');
            var diagEl=document.getElementById('bhs-col-diag');
            var diagTxt=document.getElementById('bhs-col-diag-text');
            if(diagEl&&diagTxt){diagEl.classList.remove('d-none');diagTxt.textContent=' '+colNames;}
            if(status) status.innerHTML='<small style="color:#0891b2">Detectadas: '+colNames+'</small>';
            var fecha=document.getElementById('bhs-date-filter').value || today();
            var records;
            if(type==='arrivals')        records=bhsParseArrivals(rows,fecha);
            else if(type==='departures') records=bhsParseDepartures(rows,fecha);
            else                         records=bhsParseBWF(rows,fecha);
            console.log('[BHS] Filas leídas:',rows.length,'| Filas válidas:',records.length,'| Tipo:',type);
            if(type==='arrivals'){
                console.log('[BHS] Totales calculados Llegadas:',{
                    total_maletas:records.reduce(function(a,r){return a+(Number(r.total_maletas)||0);},0),
                    terminacion:records.reduce(function(a,r){return a+(Number(r.terminacion)||0);},0),
                    transito:records.reduce(function(a,r){return a+(Number(r.tras)||0);},0),
                    vuelos:records.length
                });
            }
            if(!records.length) throw new Error('0 registros válidos. Revisa columnas y filas del archivo. Columnas detectadas: '+colNames);
            bhsSaveToDB(type,fecha,records,function(err){
                _bhsUploadBusy[type]=false;
                bhsResetFileInput(type);
                if(err){bhsSetUploadState(type,'error','<span style="color:#dc2626">Error: '+(err.message||JSON.stringify(err))+'</span>');console.error('[BHS] Save error:',err);}
                else{bhsSetUploadState(type,'ok','<span style="color:#16a34a">&#x2713; '+records.length+' registros guardados</span>');
                    if(type==='arrivals')bhsRenderArrivals(records);else if(type==='departures')bhsRenderDepartures(records);else bhsRenderBWF(records);
                    _bhsTabDate[type==='arrivals'?'arr':type==='departures'?'dep':'bwf']=fecha;
                    bhsUpdateDateBadge();
                    bhsLoadAvailableDates();
                    console.log('[BHS] Carga finalizada correctamente:',{tipo:type,fecha:fecha,registros:records.length});
                }
            });
        }catch(err2){
            _bhsUploadBusy[type]=false;
            bhsResetFileInput(type);
            bhsSetUploadState(type,'error','<span class="text-danger">'+err2.message+'</span>');
            console.error('[BHS] Error procesando archivo:',err2);
        }
    };
    reader.readAsArrayBuffer(file);
}

// ── PARSE functions ───────────────────────────────────────────
// Normalize column keys (trim, lower, remove accents)
function norm(s){ return String(s).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function findCol(row,candidates){
    var keys=Object.keys(row);
    for(var i=0;i<candidates.length;i++){
        var c=candidates[i];
        for(var k=0;k<keys.length;k++){
            if(norm(keys[k])===norm(c)||norm(keys[k]).includes(norm(c))) return keys[k];
        }
    }
    return null;
}
function cellTime(v){
    if(!v) return null;
    if(v instanceof Date) return v.toTimeString().slice(0,5);
    var s=String(v).trim();
    if(/^\d{1,2}:\d{2}/.test(s)) return s.slice(0,5);
    return null;
}
function bhsToNumber(v){
    if(v===null||v===undefined||v==='') return 0;
    if(typeof v==='number') return Number.isFinite(v)?v:0;
    var s=String(v).replace(/\s+/g,'').replace(/,/g,'').trim();
    if(!s) return 0;
    var n=Number(s);
    return Number.isFinite(n)?n:0;
}

function bhsParseArrivals(rows,fecha){
    var user=sessionStorage.getItem('user_fullname')||sessionStorage.getItem('currentUser')||'';
    if(!rows||!rows.length) throw new Error('El archivo de Llegadas no contiene filas de datos.');
    var sample=rows[0]||{};
    var cComp=findCol(sample,['compania','company','aerolinea','airline','cia']);
    var cProc=findCol(sample,['procedencia','origen','origin','proc']);
    var cPlat=findCol(sample,['plat','posicion','stand','gate']);
    var cVuelo=findCol(sample,['vuelo','flight','flt','nro']);
    var cTotal=findCol(sample,['total','total_maletas','bags','maletas']);
    var cTerm=findCol(sample,['terminacion','term','local','dest']);
    var cTras=findCol(sample,['tras','transito','transit','transfer']);
    var cHora=findCol(sample,['hora','sta','eta','arrival','llegada','hora_llegada','hora llegada','arr','scheduled']);
    var missing=[];
    if(!cComp) missing.push('Compañía / Aerolínea / CIA');
    if(!cVuelo) missing.push('Vuelo / Flight');
    if(!cTotal && !(cTerm&&cTras)) missing.push('Total de maletas o Terminación + Tránsito');
    if(!cTerm) missing.push('Terminación');
    if(!cTras) missing.push('Tránsito');
    if(missing.length) throw new Error('Archivo de Llegadas con columnas faltantes: '+missing.join(', '));
    console.log('[BHS] Columnas Llegadas mapeadas:',{
        compania:cComp, vuelo:cVuelo, procedencia:cProc, plat:cPlat,
        total:cTotal, terminacion:cTerm, transito:cTras, hora:cHora
    });
    return rows.map(function(r){
        var horaVal=cHora?cellTime(r[cHora]):null;
        var term=bhsToNumber(cTerm?r[cTerm]:0);
        var tras=bhsToNumber(cTras?r[cTras]:0);
        var total=cTotal?bhsToNumber(r[cTotal]):(term+tras);
        if(!Number.isFinite(total)) total=0;
        if(!Number.isFinite(term)) term=0;
        if(!Number.isFinite(tras)) tras=0;
        return {
            fecha:fecha, uploaded_by:user,
            vuelo:      cVuelo?String(r[cVuelo]).trim():'',
            compania:   cComp ?String(r[cComp]).trim().toUpperCase():'',
            procedencia:cProc ?String(r[cProc]).trim().toUpperCase():'',
            plat:       cPlat ?String(r[cPlat]).trim():'',
            total_maletas: total,
            terminacion:   term,
            tras:          tras,
            _hora:         horaVal  // local-only, not persisted
        };
    }).filter(function(r){
        return r.compania && (r.vuelo || r.total_maletas || r.terminacion || r.tras);
    });
}

function bhsParseDepartures(rows,fecha){
    var user=sessionStorage.getItem('user_fullname')||sessionStorage.getItem('currentUser')||'';
    return rows.map(function(r){
        var cComp   =findCol(r,['compania','company','aerolinea','airline','cia']);
        var cVuelo  =findCol(r,['vuelo','flight','flt','nro']);
        var cHora   =findCol(r,['hora','hora_prog','scheduled','std','sched']);
        var cDest   =findCol(r,['destino','dest','destination']);
        var cPlat   =findCol(r,['plat','posicion','stand','gate']);
        var cPrimera=findCol(r,['1a','primera','first','1ª','1a maleta','primera maleta']);
        var cUltima =findCol(r,['ultima','last','ult','última','ultima maleta']);
        var cEtd    =findCol(r,['etd','estimated','est']);

        var horaProg =cellTime(cHora?r[cHora]:null);
        var primera  =cellTime(cPrimera?r[cPrimera]:null);
        var ultima   =cellTime(cUltima?r[cUltima]:null);
        var etd      =cellTime(cEtd?r[cEtd]:null);

        // minutes of anticipation
        var minPrimera=null, minUltima=null;
        if(horaProg && primera){
            minPrimera=timeToMinutes(horaProg)-timeToMinutes(primera);
        }
        if(etd && ultima){
            minUltima=timeToMinutes(etd)-timeToMinutes(ultima);
        } else if(horaProg && ultima){
            minUltima=timeToMinutes(horaProg)-timeToMinutes(ultima);
        }

        return {
            fecha:fecha, uploaded_by:user,
            vuelo:    cVuelo?String(r[cVuelo]).trim():'',
            compania: cComp ?String(r[cComp]).trim().toUpperCase():'',
            hora_programada: horaProg,
            destino:  cDest ?String(r[cDest]).trim().toUpperCase():'',
            plat:     cPlat ?String(r[cPlat]).trim():'',
            primera_maleta: primera,
            ultima_maleta:  ultima,
            etd:            etd,
            min_anticip_primera: minPrimera,
            min_anticip_ultima:  minUltima
        };
    }).filter(function(r){ return r.compania; });
}

function bhsParseBWF(rows,fecha){
    var user=sessionStorage.getItem('user_fullname')||sessionStorage.getItem('currentUser')||'';
    return rows.map(function(r){
        var cTag    =findCol(r,['tag','etiqueta','label','bag tag']);
        var cComp   =findCol(r,['compania','company','aerolinea','airline','cia']);
        var cVuelo  =findCol(r,['vuelo','flight','flt','nro']);
        var cOrigen =findCol(r,['origen','origin','proc','from']);
        var cDest   =findCol(r,['destino','dest','destination','to']);
        var tagVal  =cTag?String(r[cTag]).trim():'';
        // Detect airline from tag prefix if not present in the row
        var compRaw =cComp?String(r[cComp]).trim():'';
        if(!compRaw){
            var detected=airlineFromTag(tagVal);
            if(detected) compRaw=detected[0];
        }
        return {
            fecha:fecha, uploaded_by:user,
            tag:      tagVal,
            compania: compRaw.toUpperCase(),
            vuelo:    cVuelo?String(r[cVuelo]).trim():'',
            origen:   cOrigen?String(r[cOrigen]).trim().toUpperCase():'',
            destino:  cDest ?String(r[cDest]).trim().toUpperCase():''
        };
    }).filter(function(r){ return r.tag||r.compania; });
}

// ── SAVE to Supabase ──────────────────────────────────────────
function bhsSaveToDB(type,fecha,records,cb){
    var client=window.supabaseClient;
    if(!client) return cb(new Error('No Supabase client'));
    var table={'arrivals':'bhs_arrivals','departures':'bhs_departures','bwf':'bhs_bags_without_flight'}[type];
    // Delete existing records for this date first, then insert.
    // Supabase no siempre lanza excepción: puede devolver { error }.
    // Por eso se valida cada respuesta para evitar mostrar datos nuevos
    // si la tabla se quedó con información anterior.
    var cleanRecords=records.map(function(r){
        var copy=Object.assign({},r);
        delete copy._hora;
        return copy;
    });
    console.log('[BHS] Guardado: limpiando tabla',table,'fecha',fecha,'registros nuevos',cleanRecords.length);
    client.from(table).delete().eq('fecha',fecha).then(function(delRes){
        if(delRes&&delRes.error) throw delRes.error;
        if(!records.length) return cb(null);
        // Supabase insert in batches of 500
        var batches=[];
        for(var i=0;i<cleanRecords.length;i+=500) batches.push(cleanRecords.slice(i,i+500));
        var chain=Promise.resolve();
        batches.forEach(function(batch){
            chain=chain.then(function(){
                return client.from(table).insert(batch).then(function(insRes){
                    if(insRes&&insRes.error) throw insRes.error;
                    return insRes;
                });
            });
        });
        chain.then(function(){
            if(type!=='arrivals') return cb(null);
            return client.from(table).select('id',{count:'exact',head:true}).eq('fecha',fecha).then(function(countRes){
                if(countRes&&countRes.error) throw countRes.error;
                if(typeof countRes.count==='number'&&countRes.count!==cleanRecords.length){
                    throw new Error('La verificación de guardado no coincide: se esperaban '+cleanRecords.length+' registros y Supabase reportó '+countRes.count+'.');
                }
                cb(null);
            });
        }).catch(cb);
    }).catch(cb);
}

// ── RENDER functions ──────────────────────────────────────────
function bhsRenderArrivals(data){
    data=Array.isArray(data)?data:[];
    function bhsDestroyCanvasChart(id){
        var canvas=document.getElementById(id);
        if(canvas&&canvas._bhsChart){
            canvas._bhsChart.destroy();
            canvas._bhsChart=null;
        }
    }
    // ── KPIs ────────────────────────────────────────────────
    var total=data.reduce(function(a,r){return a+(r.total_maletas||0);},0);
    var term =data.reduce(function(a,r){return a+(r.terminacion||0);},0);
    var tras =data.reduce(function(a,r){return a+(r.tras||0);},0);
    document.getElementById('bhs-arr-total').textContent=fmtNum(total);
    document.getElementById('bhs-arr-term').textContent=fmtNum(term);
    document.getElementById('bhs-arr-tras').textContent=fmtNum(tras);
    document.getElementById('bhs-arr-vuelos').textContent=fmtNum(data.length);

    // ── Group by airline ─────────────────────────────────────
    var byAl={};
    data.forEach(function(r){
        var k=r.compania||'—';
        if(!byAl[k]) byAl[k]={iata:k,vuelos:0,total:0,term:0,tras:0,plats:new Set()};
        byAl[k].vuelos++;
        byAl[k].total+=r.total_maletas||0;
        byAl[k].term +=r.terminacion||0;
        byAl[k].tras +=r.tras||0;
        if(r.plat) byAl[k].plats.add(r.plat);
    });

    var sorted=Object.values(byAl).sort(function(a,b){return b.total-a.total;});
    var rankColors=['#f59e0b','#94a3b8','#b45309'];

    // ── Airline cards with logos ─────────────────────────────
    var cardsEl=document.getElementById('bhs-arr-al-cards');
    if(cardsEl){
        if(!sorted.length){ cardsEl.innerHTML=''; }
        else{
            cardsEl.innerHTML=
                '<p class="text-uppercase fw-semibold mb-3" style="font-size:.7rem;letter-spacing:.12em;color:#94a3b8;"><i class="fas fa-plane-arrival me-1"></i>Resumen por aerolínea</p>'+
                '<div class="d-flex flex-wrap gap-3">'+sorted.map(function(al,idx){
                    var color=BHS_AL_COLOR[al.iata]||'#6c757d';
                    var logoSrc=BHS_AL_LOGO[al.iata]||'';
                    var pctTerm=al.total>0?(al.term/al.total*100).toFixed(1):0;
                    var pctTras=al.total>0?(al.tras/al.total*100).toFixed(1):0;
                    var logoHtml=logoSrc
                        ?'<img src="'+logoSrc+'" alt="'+al.iata+'" style="height:42px;max-width:120px;object-fit:contain;" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'block\'" /><span style="display:none;font-size:1.1rem;font-weight:900;color:'+color+';">'+al.iata+'</span>'
                        :'<span style="font-size:1.1rem;font-weight:900;color:'+color+';">'+al.iata+'</span>';
                    var rankHtml=idx<3
                        ?'<span style="position:absolute;top:8px;right:8px;background:'+rankColors[idx]+';color:#fff;border-radius:50%;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;font-size:.58rem;font-weight:800;box-shadow:0 1px 3px rgba(0,0,0,.25);">'+(idx+1)+'</span>'
                        :'';
                    return '<div style="position:relative;flex:1 1 155px;min-width:148px;max-width:230px;background:#fff;border-radius:14px;border-top:3px solid '+color+';box-shadow:0 2px 10px rgba(0,0,0,.07);padding:14px 16px 12px;overflow:hidden;">'+
                        rankHtml+
                        '<div style="min-height:44px;display:flex;align-items:center;margin-bottom:10px;">'+logoHtml+'</div>'+
                        '<div style="font-size:2.2rem;font-weight:800;line-height:1;color:'+color+';font-variant-numeric:tabular-nums;">'+fmtNum(al.total)+'</div>'+
                        '<div style="font-size:.62rem;color:#94a3b8;margin-top:2px;letter-spacing:.06em;text-transform:uppercase;">maletas · '+al.vuelos+' vuelos</div>'+
                        '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">'+
                        '<span style="font-size:.72rem;color:#16a34a;font-weight:600;">&#x2714; '+fmtNum(al.term)+' term.</span>'+
                        '<span style="font-size:.72rem;color:#f59e0b;font-weight:600;">&#x21C6; '+fmtNum(al.tras)+' tráns.</span>'+
                        '</div>'+
                        // Stacked mini progress: terminación + tránsito
                        '<div style="margin-top:8px;display:flex;height:5px;border-radius:3px;overflow:hidden;background:#f1f5f9;gap:1px;">'+
                        (al.term?'<div style="flex:'+al.term+';background:#16a34a;" title="Terminación: '+al.term+'"></div>':'')+
                        (al.tras?'<div style="flex:'+al.tras+';background:#f59e0b;" title="Tránsito: '+al.tras+'"></div>':'')+
                        '</div>'+
                        '<div style="font-size:.62rem;color:#94a3b8;margin-top:4px;">'+pctTerm+'% term. · '+pctTras+'% tráns.</div>'+
                        '</div>';
                }).join('')+'</div>';
        }
    }

    // ── Analytics panel ──────────────────────────────────────
    var analyticsEl=document.getElementById('bhs-arr-analytics');
    if(analyticsEl) analyticsEl.style.display=sorted.length?'':'none';

    // Chart A: stacked bar terminación + tránsito by airline
    if(window.ChartDataLabels) Chart.register(ChartDataLabels);
    var ctxA=document.getElementById('bhs-arr-chart-al');
    if(ctxA && sorted.length){
        if(ctxA._bhsChart) ctxA._bhsChart.destroy();
        var alLabels=sorted.map(function(a){return a.iata;});
        var alColors=alLabels.map(function(k){return BHS_AL_COLOR[k]||'#94a3b8';});
        ctxA._bhsChart=new Chart(ctxA,{
            type:'bar',
            data:{labels:alLabels,datasets:[
                {label:'Terminación', data:sorted.map(function(a){return a.term;}), backgroundColor:'#16a34acc', borderRadius:0},
                {label:'Tránsito',    data:sorted.map(function(a){return a.tras;}), backgroundColor:'#f59e0bcc', borderRadius:0}
            ]},
            options:{
                indexAxis:'y',
                plugins:{
                    legend:{display:false},
                    datalabels:{
                        display:function(ctx){ return ctx.dataset.data[ctx.dataIndex]>0; },
                        anchor:'center',align:'center',
                        color:'#fff',font:{weight:'700',size:10},
                        formatter:function(v){ return v>0?fmtNum(v):''; }
                    }
                },
                scales:{
                    x:{stacked:true,display:false,grid:{display:false}},
                    y:{stacked:true,grid:{display:false},ticks:{font:{size:12,weight:'600'},color:'#374151'}}
                },
                animation:{duration:900}
            }
        });
    }else{
        bhsDestroyCanvasChart('bhs-arr-chart-al');
    }

    // Chart B: peak hours (only if _hora data is present)
    var withHora=data.filter(function(r){return r._hora;});
    var peakWrap=document.getElementById('bhs-arr-peak-wrap');
    if(peakWrap) peakWrap.style.display=withHora.length?'':'none';
    if(withHora.length){
        // Build hourly buckets 0-23
        var hourBuckets=new Array(24).fill(0);
        var hourBags=new Array(24).fill(0);
        withHora.forEach(function(r){
            var h=parseInt(String(r._hora).split(':')[0],10);
            if(h>=0&&h<24){ hourBuckets[h]++; hourBags[h]+=r.total_maletas||0; }
        });
        var peakH=hourBuckets.indexOf(Math.max.apply(null,hourBuckets));
        var hours=[];
        for(var hi=0;hi<24;hi++) hours.push(hi<10?'0'+hi+':00':hi+':00');
        var peakColors=hourBuckets.map(function(v,i){
            return i===peakH?'#ef4444cc':'#2196f3aa';
        });
        var ctxP=document.getElementById('bhs-arr-chart-peak');
        if(ctxP){
            if(ctxP._bhsChart) ctxP._bhsChart.destroy();
            ctxP._bhsChart=new Chart(ctxP,{
                type:'bar',
                data:{labels:hours,datasets:[{
                    label:'Vuelos',
                    data:hourBuckets,
                    backgroundColor:peakColors,
                    borderRadius:4,
                    borderSkipped:false
                }]},
                options:{
                    plugins:{
                        legend:{display:false},
                        tooltip:{callbacks:{
                            label:function(ctx){
                                var h=ctx.dataIndex;
                                return ctx.parsed.y+' vuelos · '+fmtNum(hourBags[h])+' maletas';
                            }
                        }},
                        datalabels:{
                            display:function(ctx){ return ctx.dataset.data[ctx.dataIndex]>0; },
                            anchor:'end',align:'top',clamp:true,
                            color:'#374151',font:{weight:'700',size:9},
                            formatter:function(v){ return v>0?v:''; }
                        }
                    },
                    scales:{
                        x:{grid:{display:false},ticks:{font:{size:9},maxRotation:45,color:'#374151'}},
                        y:{display:false,grid:{display:false}}
                    },
                    layout:{padding:{top:14}},
                    animation:{duration:900}
                }
            });
        }
        // Peak hour badges
        var top3=hourBuckets.map(function(v,i){return{h:i,v:v};})
            .filter(function(x){return x.v>0;})
            .sort(function(a,b){return b.v-a.v;})
            .slice(0,3);
        var badgesEl=document.getElementById('bhs-arr-peak-badges');
        if(badgesEl){
            badgesEl.innerHTML=top3.map(function(x,idx){
                var bgs=['#fee2e2','#fef3c7','#dbeafe'];
                var txts=['#dc2626','#92400e','#1d4ed8'];
                return '<span style="background:'+bgs[idx]+';color:'+txts[idx]+';font-size:.7rem;font-weight:700;padding:3px 10px;border-radius:99px;">'+(idx===0?'&#x1F525; ':'')+(x.h<10?'0'+x.h:x.h)+':00&ndash;'+(x.h<10?'0'+x.h:x.h)+':59 · '+x.v+' vuelos</span>';
            }).join('');
        }
    }else{
        bhsDestroyCanvasChart('bhs-arr-chart-peak');
        var emptyBadgesEl=document.getElementById('bhs-arr-peak-badges');
        if(emptyBadgesEl) emptyBadgesEl.innerHTML='';
    }

    // ── Summary table ────────────────────────────────────────
    var tbody=document.querySelector('#bhs-arr-table tbody');
    if(!tbody) return;
    if(!sorted.length){
        tbody.innerHTML='<tr><td colspan="6" class="text-muted small py-4">Sin datos para esta fecha</td></tr>'; return;
    }
    tbody.innerHTML=sorted.map(function(al){
        var color=BHS_AL_COLOR[al.iata]||'#6c757d';
        var logoSrc=BHS_AL_LOGO[al.iata]||'';
        var logoCell=logoSrc
            ?'<img src="'+logoSrc+'" alt="'+al.iata+'" style="height:24px;max-width:72px;object-fit:contain;vertical-align:middle;" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'inline\'" /><span style="display:none;font-weight:700;color:'+color+';">'+al.iata+'</span>'
            :'<span style="font-weight:700;color:'+color+';">'+al.iata+'</span>';
        return '<tr>'+
            '<td style="text-align:left;padding-left:12px;">'+logoCell+'</td>'+
            '<td>'+al.vuelos+'</td>'+
            '<td class="fw-semibold">'+fmtNum(al.total)+'</td>'+
            '<td style="color:#16a34a;font-weight:600;">'+fmtNum(al.term)+'</td>'+
            '<td style="color:#f59e0b;font-weight:600;">'+fmtNum(al.tras)+'</td>'+
            '<td><small class="text-muted">'+Array.from(al.plats).sort().join(', ')+'</small></td>'+
            '</tr>';
    }).join('');
}

function bhsRenderDepartures(data){
    var NORM_NAC=120, NORM_INT=180; // minutes

    // Correct day-boundary values in all records
    data.forEach(function(r){
        r._anticip = correctAnticip(r.min_anticip_primera);
    });

    var vuelos=data.length;
    var withBags=data.filter(function(r){return r._anticip!=null;});
    var avgPrimera=withBags.length?Math.round(withBags.reduce(function(a,r){return a+r._anticip;},0)/withBags.length):null;
    var avgU=data.filter(function(r){return r.min_anticip_ultima!=null;});
    var avgUltima=avgU.length?Math.round(avgU.reduce(function(a,r){return a+r.min_anticip_ultima;},0)/avgU.length):null;
    var tarde=data.filter(function(r){return r.min_anticip_ultima!=null&&r.min_anticip_ultima<0;}).length;

    document.getElementById('bhs-dep-vuelos').textContent=fmtNum(vuelos);
    document.getElementById('bhs-dep-avg-primera').textContent=avgPrimera!=null?avgPrimera+' min':'—';
    document.getElementById('bhs-dep-avg-ultima').textContent=avgUltima!=null?avgUltima+' min':'—';
    document.getElementById('bhs-dep-tarde').textContent=fmtNum(tarde);

    // ── Build per-airline stats ────────────────────────────────────────
    var byAl={};
    data.forEach(function(r){
        var k=r.compania||'?';
        if(!byAl[k]) byAl[k]={iata:k,total:0,withBags:0,sum:0,cat:{muy:0,normal:0,justo:0,tarde:0}};
        byAl[k].total++;
        if(r._anticip!=null){
            byAl[k].withBags++;
            byAl[k].sum+=r._anticip;
            if(r._anticip>180)       byAl[k].cat.muy++;
            else if(r._anticip>120)  byAl[k].cat.normal++;
            else if(r._anticip>60)   byAl[k].cat.justo++;
            else                     byAl[k].cat.tarde++;
        }
    });
    var airlines=Object.values(byAl).sort(function(a,b){
        var avgA=a.withBags?a.sum/a.withBags:0;
        var avgB=b.withBags?b.sum/b.withBags:0;
        return avgB-avgA;
    });

    // ── Analytics panel ──────────────────────────────────────────
    var panel=document.getElementById('bhs-dep-analytics');
    if(panel) panel.style.display=withBags.length?'':'none';

    // Airline cards
    var cardsEl=document.getElementById('bhs-dep-al-cards');
    if(cardsEl && withBags.length){
        cardsEl.innerHTML='<div class="d-flex flex-wrap gap-3">'+airlines.map(function(al){
            if(!al.withBags) return '';
            var avg=Math.round(al.sum/al.withBags);
            var color=BHS_AL_COLOR[al.iata]||'#6c757d';
            var logo=BHS_AL_LOGO[al.iata]||'';
            var pctMuy=(al.cat.muy/al.withBags*100).toFixed(0);
            // Status
            var status,statusBg,statusTxt;
            if(avg>180){      status='Muy temprano'; statusBg='#dcfce7'; statusTxt='#16a34a';}
            else if(avg>120){ status='Normal';       statusBg='#dbeafe'; statusTxt='#1d4ed8';}
            else if(avg>60){  status='Justo';        statusBg='#fef3c7'; statusTxt='#92400e';}
            else{             status='Tardío';        statusBg='#fee2e2'; statusTxt='#dc2626';}
            var logoHtml=logo
                ?'<img src="'+logo+'" alt="'+al.iata+'" style="height:34px;max-width:110px;object-fit:contain;" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'block\'" /><span style="display:none;font-size:.9rem;font-weight:900;color:'+color+';">'+al.iata+'</span>'
                :'<span style="font-size:.9rem;font-weight:900;color:'+color+';">'+al.iata+'</span>';
            return '<div style="position:relative;flex:1 1 160px;min-width:155px;max-width:230px;background:#fff;border-radius:14px;border-top:3px solid '+color+';box-shadow:0 2px 10px rgba(0,0,0,.07);padding:14px 16px 12px;">'+
                '<div style="min-height:38px;display:flex;align-items:center;margin-bottom:10px;">'+logoHtml+'</div>'+
                '<div style="font-size:2rem;font-weight:800;line-height:1;color:'+color+';">'+fmtMinutos(avg)+'</div>'+
                '<div style="font-size:.62rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-top:2px;">anticip. promedio</div>'+
                '<div style="margin-top:8px;display:flex;align-items:center;gap:6px;">'+
                '<span style="background:'+statusBg+';color:'+statusTxt+';font-size:.65rem;font-weight:700;padding:2px 8px;border-radius:99px;">'+status+'</span>'+
                '<span style="font-size:.68rem;color:#94a3b8;">'+al.withBags+'/'+al.total+' vuelos</span>'+
                '</div>'+
                // Mini distribution bar
                '<div style="margin-top:10px;display:flex;height:6px;border-radius:4px;overflow:hidden;gap:1px;">'+
                (al.cat.muy   ?'<div style="flex:'+al.cat.muy  +';background:#16a34a;" title="Muy temprano: '+al.cat.muy+'"></div>':'')+
                (al.cat.normal?'<div style="flex:'+al.cat.normal+';background:#3b82f6;" title="Normal: '+al.cat.normal+'"></div>':'')+
                (al.cat.justo ?'<div style="flex:'+al.cat.justo +';background:#f59e0b;" title="Justo: '+al.cat.justo+'"></div>':'')+
                (al.cat.tarde ?'<div style="flex:'+al.cat.tarde +';background:#ef4444;" title="Tardío: '+al.cat.tarde+'"></div>':'')+
                '</div>'+
                '<div style="font-size:.62rem;color:#94a3b8;margin-top:4px;">'+pctMuy+'% muy temprano (vs norma 2h)</div>'+
                '</div>';
        }).join('')+'</div>';
    }

    // ── Chart A: avg anticipation per airline ─────────────────────────
    if(window.ChartDataLabels) Chart.register(ChartDataLabels);
    if(window.ChartAnnotation) Chart.register(ChartAnnotation);
    var ctxA=document.getElementById('bhs-dep-chart-avg');
    if(ctxA && withBags.length){
        if(ctxA._bhsChart) ctxA._bhsChart.destroy();
        var alLabels=airlines.filter(function(a){return a.withBags>0;}).map(function(a){return a.iata;});
        var alAvgs=airlines.filter(function(a){return a.withBags>0;}).map(function(a){return Math.round(a.sum/a.withBags);});
        var alColors=alLabels.map(function(k){return (BHS_AL_COLOR[k]||'#94a3b8')+'cc';});
        var alBorders=alLabels.map(function(k){return BHS_AL_COLOR[k]||'#94a3b8';});
        var maxVal=Math.max.apply(null,alAvgs.concat([NORM_INT+60]));
        ctxA._bhsChart=new Chart(ctxA,{
            type:'bar',
            data:{labels:alLabels,datasets:[{
                label:'Avg anticip. (min)',
                data:alAvgs,
                backgroundColor:alColors,
                borderColor:alBorders,
                borderWidth:0,
                borderRadius:6,
                borderSkipped:false
            }]},
            options:{
                indexAxis:'y',
                plugins:{
                    legend:{display:false},
                    datalabels:{
                        display:true,anchor:'end',align:'end',clamp:true,
                        color:'#374151',font:{weight:'700',size:11},
                        formatter:function(v){ return fmtMinutos(v); }
                    },
                    annotation:{
                        annotations:{
                            norm120:{
                                type:'line',scaleID:'x',value:NORM_NAC,
                                borderColor:'#3b82f6',borderWidth:2,borderDash:[4,3],
                                label:{display:true,content:'2h',color:'#3b82f6',font:{size:9,weight:'bold'},position:'end',yAdjust:-8}
                            },
                            norm180:{
                                type:'line',scaleID:'x',value:NORM_INT,
                                borderColor:'#f59e0b',borderWidth:2,borderDash:[4,3],
                                label:{display:true,content:'3h',color:'#f59e0b',font:{size:9,weight:'bold'},position:'end',yAdjust:8}
                            }
                        }
                    }
                },
                scales:{
                    x:{display:false,max:maxVal+60,grid:{display:false}},
                    y:{grid:{display:false},ticks:{font:{size:12,weight:'600'},color:'#374151'}}
                },
                layout:{padding:{right:80}},
                animation:{duration:900}
            }
        });
    }

    // ── Chart B: distribution stacked bar per airline ──────────────────
    var ctxB=document.getElementById('bhs-dep-chart-dist');
    if(ctxB && withBags.length){
        if(ctxB._bhsChart) ctxB._bhsChart.destroy();
        var alF=airlines.filter(function(a){return a.withBags>0;});
        var alL=alF.map(function(a){return a.iata;});
        ctxB._bhsChart=new Chart(ctxB,{
            type:'bar',
            data:{labels:alL,datasets:[
                {label:'Muy temprano (>3h)', data:alF.map(function(a){return a.cat.muy;}),   backgroundColor:'#16a34acc', borderRadius:0},
                {label:'Normal (2–3h)',      data:alF.map(function(a){return a.cat.normal;}),backgroundColor:'#3b82f6cc', borderRadius:0},
                {label:'Justo (1–2h)',        data:alF.map(function(a){return a.cat.justo;}), backgroundColor:'#f59e0bcc', borderRadius:0},
                {label:'Tardío (<1h)',          data:alF.map(function(a){return a.cat.tarde;}), backgroundColor:'#ef4444cc', borderRadius:0}
            ]},
            options:{
                indexAxis:'y',
                plugins:{
                    legend:{display:false},
                    datalabels:{
                        display:function(ctx){ return ctx.dataset.data[ctx.dataIndex]>0; },
                        anchor:'center',align:'center',
                        color:'#fff',font:{weight:'700',size:10},
                        formatter:function(v){ return v>0?v:''; }
                    }
                },
                scales:{
                    x:{stacked:true,display:false,grid:{display:false}},
                    y:{stacked:true,grid:{display:false},ticks:{font:{size:12,weight:'600'},color:'#374151'}}
                },
                animation:{duration:900}
            }
        });
    }

    // ── Detail table ──────────────────────────────────────────
    var tbody=document.querySelector('#bhs-dep-table tbody');
    if(!data.length){
        tbody.innerHTML='<tr><td colspan="10" class="text-muted small py-4">Sin datos</td></tr>'; return;
    }
    tbody.innerHTML=data.map(function(r){
        var real=r._anticip;
        var pColor=real!=null?(real<60?'color:#dc2626':(real>=120?'color:#16a34a':'color:#f59e0b')):''; 
        var uColor=r.min_anticip_ultima!=null&&r.min_anticip_ultima<0?'color:#dc2626':'';
        var pTxt=real!=null?('<span style="font-weight:700;'+pColor+';">'+real+'</span><small style="color:#94a3b8;"> ('+fmtMinutos(real)+')</small>'):'—';
        return '<tr>'
            +'<td class="fw-semibold">'+(r.vuelo||'—')+'</td>'
            +'<td>'+(r.compania||'—')+'</td>'
            +'<td>'+(r.hora_programada||'—')+'</td>'
            +'<td>'+(r.destino||'—')+'</td>'
            +'<td>'+(r.plat||'—')+'</td>'
            +'<td>'+(r.primera_maleta||'—')+'</td>'
            +'<td>'+(r.ultima_maleta||'—')+'</td>'
            +'<td>'+(r.etd||'—')+'</td>'
            +'<td>'+pTxt+'</td>'
            +'<td style="font-weight:700;'+uColor+'">'+(r.min_anticip_ultima!=null?r.min_anticip_ultima:'—')+'</td>'
            +'</tr>';
    }).join('');
}

// Airline brand colors
var BHS_AL_COLOR={
    'AM':'#0b2161','Y4':'#a300e6','VB':'#00a850',
    'XN':'#008375','DM':'#632683','ZV':'#bed62f'
};
var BHS_AL_LOGO={
    'AM':'images/airlines/logo_aeromexico.png',
    'Y4':'images/airlines/logo_volaris.png',
    'VB':'images/airlines/logo_viva.png',
    'XN':'images/airlines/logo_mexicana.png',
    'DM':'images/airlines/logo_arajet.png',
    'ZV':'images/airlines/logo_aerus.png'
};

function bhsRenderBWF(data){
    var total=data.length;
    var flights=new Set(data.map(function(r){return r.vuelo;}).filter(Boolean));

    // Build summary: resolve IATA from tag if compania blank
    var byAl={};
    data.forEach(function(r){
        var info=airlineFromTag(r.tag);
        var iata=r.compania||(info?info[0]:'');
        var nombre=info?info[1]:(iata||'Otros');
        var key=iata||'XX';
        if(!byAl[key]) byAl[key]={iata:key,nombre:nombre,total:0};
        byAl[key].total++;
    });

    var airlineCount=Object.keys(byAl).filter(function(k){return k!=='XX';}).length;
    document.getElementById('bhs-bwf-total').textContent=fmtNum(total);
    document.getElementById('bhs-bwf-airlines').textContent=fmtNum(airlineCount);
    document.getElementById('bhs-bwf-flights').textContent=fmtNum(flights.size);

    // ── Summary cards ─────────────────────────────────────────
    var summaryEl=document.getElementById('bhs-bwf-summary');
    if(summaryEl){
        if(!total){ summaryEl.innerHTML=''; }
        else{
            var sorted=Object.values(byAl).sort(function(a,b){return b.total-a.total;});
            var rankColors=['#f59e0b','#94a3b8','#b45309'];
            summaryEl.innerHTML=
                '<p class="text-uppercase fw-semibold mb-3" style="font-size:.7rem;letter-spacing:.12em;color:#94a3b8;"><i class="fas fa-tag me-1"></i>Resumen por aerolínea</p>'+
                '<div class="d-flex flex-wrap gap-3">'+sorted.map(function(al,idx){
                    var color=BHS_AL_COLOR[al.iata]||'#6c757d';
                    var pct=total>0?(al.total/total*100).toFixed(1):0;
                    var logoSrc=BHS_AL_LOGO[al.iata]||'';
                    var isDark=false; // all airline colors are dark enough for white text
                    var bgCard='#fff';
                    var logoHtml=logoSrc
                        ?'<img src="'+logoSrc+'" alt="'+al.nombre+'" style="height:42px;max-width:120px;object-fit:contain;" onload="this.style.display=\'block\'" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'block\'" /><span style="display:none;font-size:1.1rem;font-weight:900;color:'+color+';">'+al.nombre+'</span>'
                        :'<span style="font-size:1.1rem;font-weight:900;color:'+color+';">'+al.nombre+'</span>';
                    var rankHtml=idx<3
                        ?'<span style="position:absolute;top:8px;right:8px;background:'+rankColors[idx]+';color:#fff;border-radius:50%;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;font-size:.58rem;font-weight:800;box-shadow:0 1px 3px rgba(0,0,0,.25);">'+(idx+1)+'</span>'
                        :'';
                    return '<div style="position:relative;flex:1 1 140px;min-width:130px;max-width:220px;background:'+bgCard+';border-radius:14px;border-top:3px solid '+color+';box-shadow:0 2px 10px rgba(0,0,0,.07);padding:14px 16px 12px;overflow:hidden;">'+
                        rankHtml+
                        '<div style="min-height:44px;display:flex;align-items:center;margin-bottom:10px;">'+logoHtml+'</div>'+
                        '<div style="font-size:2.2rem;font-weight:800;line-height:1;color:'+color+';font-variant-numeric:tabular-nums;">'+fmtNum(al.total)+'</div>'+
                        '<div style="font-size:.62rem;color:#94a3b8;margin-top:2px;letter-spacing:.06em;text-transform:uppercase;">maletas manual</div>'+
                        '<div style="margin-top:6px;"><span style="font-size:.85rem;font-weight:700;color:'+color+';">'+pct+'%</span><span style="font-size:.7rem;color:#94a3b8;"> del total</span></div>'+
                        '<div style="height:4px;border-radius:3px;background:'+color+'1a;margin-top:8px;overflow:hidden;">'+
                        '<div style="height:4px;width:'+pct+'%;background:linear-gradient(90deg,'+color+','+color+'77);border-radius:3px;transition:width 1s cubic-bezier(.4,0,.2,1);"></div>'+
                        '</div>'+
                        '</div>';
                }).join('')+'</div>';
        }
    }

    // ── Charts ──────────────────────────────────────────
    var tbody=document.querySelector('#bhs-bwf-table tbody');
    var chartsWrap=document.getElementById('bhs-bwf-charts');
    if(chartsWrap && total){
        chartsWrap.style.display='';
        var sorted2=Object.values(byAl).sort(function(a,b){return b.total-a.total;});
        var labels=sorted2.map(function(a){return a.nombre;});
        var vals=sorted2.map(function(a){return a.total;});
        var colors=sorted2.map(function(a){return BHS_AL_COLOR[a.iata]||'#94a3b8';});

        // Donut
        if(window.ChartDataLabels) Chart.register(ChartDataLabels);
        var ctxD=document.getElementById('bhs-chart-donut');
        if(ctxD){
            if(ctxD._bhsChart) ctxD._bhsChart.destroy();
            ctxD._bhsChart=new Chart(ctxD,{
                type:'doughnut',
                data:{labels:labels,datasets:[{data:vals,backgroundColor:colors,borderWidth:2,borderColor:'#fff',hoverBorderColor:'#fff',hoverOffset:6}]},
                options:{
                    responsive:true,
                    maintainAspectRatio:false,
                    cutout:'68%',
                    plugins:{
                        legend:{display:false},
                        datalabels:{
                            display:function(ctx){
                                return (ctx.dataset.data[ctx.dataIndex]/total*100)>=8;
                            },
                            anchor:'center',
                            align:'center',
                            color:'#fff',
                            font:{weight:'bold',size:12},
                            formatter:function(v){
                                return (v/total*100).toFixed(1)+'%';
                            }
                        }
                    },
                    layout:{padding:6},
                    animation:{animateRotate:true,duration:900}
                }
            });
            // Center label
            var center=document.getElementById('bhs-donut-center');
            if(center) center.innerHTML='<div style="font-size:1.6rem;font-weight:800;color:#1e3a5f;line-height:1;">'+fmtNum(total)+'</div><div style="font-size:.6rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;">maletas</div>';
            // Legend for all slices
            var legend=document.getElementById('bhs-donut-legend');
            if(legend){
                legend.innerHTML='<div style="display:flex;flex-wrap:wrap;gap:6px 12px;">'+sorted2.map(function(al){
                    var c=BHS_AL_COLOR[al.iata]||'#94a3b8';
                    var pct=(al.total/total*100).toFixed(1);
                    return '<div style="display:flex;align-items:center;gap:5px;font-size:.75rem;">'+
                        '<span style="width:10px;height:10px;border-radius:2px;background:'+c+';flex-shrink:0;display:inline-block;"></span>'+
                        '<span style="color:#374151;font-weight:600;">'+al.nombre+'</span>'+
                        '<span style="color:#94a3b8;">'+pct+'%</span>'+
                        '</div>';
                }).join('')+'</div>';
            }
        }

        // Horizontal bar
        var ctxB=document.getElementById('bhs-chart-bar');
        if(ctxB){
            if(ctxB._bhsChart) ctxB._bhsChart.destroy();
            ctxB._bhsChart=new Chart(ctxB,{
                type:'bar',
                data:{labels:labels,datasets:[{
                    data:vals,
                    backgroundColor:colors.map(function(c){return c+'cc';}),
                    borderColor:colors,
                    borderWidth:0,
                    borderRadius:6,
                    borderSkipped:false
                }]},
                options:{
                    indexAxis:'y',
                    plugins:{
                        legend:{display:false},
                        datalabels:{
                            display:true,
                            anchor:'end',align:'end',
                            clamp:true,
                            color:'#374151',font:{weight:'700',size:11},
                            formatter:function(v){
                                var pct=(v/total*100).toFixed(1);
                                return fmtNum(v)+' · '+pct+'%';
                            }
                        }
                    },
                    scales:{
                        x:{display:false,grid:{display:false}},
                        y:{grid:{display:false},ticks:{font:{size:12},color:'#374151'}}
                    },
                    layout:{padding:{right:130}},
                    animation:{duration:900}
                }
            });
        }
    } else if(chartsWrap){ chartsWrap.style.display='none'; }
    if(!total){
        tbody.innerHTML='<tr><td colspan="6" class="text-muted small py-4">Sin datos</td></tr>'; return;
    }
    tbody.innerHTML=data.map(function(r){
        var info=airlineFromTag(r.tag);
        var iata=r.compania||(info?info[0]:'');
        var nombre=info?info[1]:(iata||'—');
        var color=BHS_AL_COLOR[iata]||'#6c757d';
        var badgeTxt=iata==='VB'?'color:#92400e;':'color:#fff;';
        var badge=iata?'<span class="badge rounded-pill" style="background:'+color+';'+badgeTxt+'font-size:.68rem;min-width:2.2rem;">'+iata+'</span>':'<span class="text-muted small">—</span>';
        return '<tr>'+
            '<td><code style="color:#be185d;font-size:.78rem;">'+r.tag+'</code></td>'+
            '<td>'+badge+'</td>'+
            '<td style="font-size:.82rem;color:#374151;">'+nombre+'</td>'+
            '<td>'+(r.vuelo||'—')+'</td>'+
            '<td>'+(r.origen||'—')+'</td>'+
            '<td>'+(r.destino||'—')+'</td>'+
            '</tr>';
    }).join('');
}

// ── Auto-init: cargar la fecha más reciente con datos ─────────
function bhsAutoLoadLatest(retries){
    retries = (retries==null) ? 30 : retries;
    var client = window.supabaseClient;
    var df = document.getElementById('bhs-date-filter');
    if(!df) return;
    if(!client){
        if(retries>0) setTimeout(function(){ bhsAutoLoadLatest(retries-1); }, 500);
        return;
    }
    // Cada tabla puede tener su propia fecha más reciente; cargamos
    // por tabla su último día con datos para que ninguna pestaña
    // quede vacía (p. ej. Salidas al 21 y Llegadas al 19).
    var specs = [
        { tab:'arr', table:'bhs_arrivals',            render:bhsRenderArrivals },
        { tab:'dep', table:'bhs_departures',          render:bhsRenderDepartures },
        { tab:'bwf', table:'bhs_bags_without_flight', render:bhsRenderBWF }
    ];
    Promise.all(specs.map(function(s){
        return client.from(s.table).select('fecha').order('fecha',{ascending:false}).limit(1)
            .then(function(r){ return (r && r.data && r.data[0]) ? r.data[0].fecha : null; })
            .catch(function(){ return null; });
    })).then(function(latests){
        var overall = latests.filter(Boolean).sort().reverse()[0];
        if(!overall){
            if(!df.value) df.value = today();
            _bhsTabDate = { arr:null, dep:null, bwf:null };
            bhsUpdateDateBadge();
            return;
        }
        // El selector de fecha se ancla al día más reciente global.
        df.value = overall;
        specs.forEach(function(s, i){
            var fecha = latests[i];
            if(!fecha){ _bhsTabDate[s.tab] = null; s.render([]); bhsUpdateDateBadge(); return; }
            client.from(s.table).select('*').eq('fecha',fecha).then(function(res){
                if(!res.error){ s.render(res.data||[]); _bhsTabDate[s.tab] = fecha; }
                bhsUpdateDateBadge();
            }).catch(function(err){ console.warn('[BHS] load '+s.table+' failed', err); });
        });
        bhsUpdateDateBadge();
    }).catch(function(err){
        console.warn('[BHS] auto-load latest failed', err);
        if(!df.value) df.value = today();
    });
}

// Animación count-up para el panel de capacidades máximas.
function bhsAnimateCapacities(){
    var nums = document.querySelectorAll('#bhs-section [data-bhs-count]');
    if(!nums.length) return;
    var fmt = function(n){ return Math.round(n).toLocaleString('es-MX'); };
    nums.forEach(function(el){
        var target = parseInt(el.getAttribute('data-bhs-count'), 10) || 0;
        if(el.__bhsAnimating) return;
        el.__bhsAnimating = true;
        var dur = 1100, start = null;
        var ease = function(t){ return 1 - Math.pow(1 - t, 3); };
        var step = function(ts){
            if(start === null) start = ts;
            var p = Math.min((ts - start) / dur, 1);
            el.textContent = fmt(target * ease(p));
            if(p < 1){ requestAnimationFrame(step); }
            else { el.textContent = fmt(target); el.__bhsAnimating = false; }
        };
        requestAnimationFrame(step);
    });
}

/* ============================================================
 *  Contrato de ciclo de vida del modulo.
 *
 *  Antes esto era un <script> de 1193 lineas dentro de index.html: se
 *  analizaba y ejecutaba en cada carga de la pagina, y para enterarse de
 *  que alguien entraba a la seccion envolvia window.showSection con un
 *  parche propio. Las dos cosas desaparecen: el loader trae el codigo la
 *  primera vez que se abre BHS y llama a init() al abrir.
 * ========================================================== */
window.initBhsMaletas = function(){
    cablearModalFecha();
    var df=document.getElementById('bhs-date-filter');
    if(df && !df.value) df.value=today();
    // En cada entrada se recarga el ultimo dia, que es justo lo que hacia el
    // parche a showSection.
    bhsAutoLoadLatest();
    bhsAnimateCapacities();
};

// Al salir se sueltan las graficas de Chart.js. Se guardan colgadas del
// propio canvas (canvas._bhsChart), asi que se recorren los canvas de la
// vista en vez de llevar un registro aparte.
window.destroyBhsMaletas = function(){
    var sec = document.getElementById('bhs-section');
    if(!sec) return;
    sec.querySelectorAll('canvas').forEach(function(c){
        if(c._bhsChart){ try { c._bhsChart.destroy(); } catch(_){} c._bhsChart = null; }
    });
};

})();
