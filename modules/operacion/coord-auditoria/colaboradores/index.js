(function() {
    'use strict';

    /* -- Estado -- */
    let colabCache = null;          // todos los registros en memoria
    let colabLoaded = false;
    let colabLoadPromise = null;
    let colabLastError = null;
    let colabCols = null;           // mapeo de columnas reales detectadas
    let colabLoadAttempts = 0;     // reintentos cuando llegan 0 filas
    let colabDirectoryUniverse = null; // universo activo usado por los KPIs del resumen

    /* -- Auto-detección de columnas -- */
    function colabDetectarColumnas(record) {
        const keys = Object.keys(record);
        console.log('[Colaboradores] Columnas reales en agenda_2026:', keys);
        const find = (...pats) => {
            for (const pat of pats) {
                try {
                    const re = new RegExp(pat, 'i');
                    const k = keys.find(k => re.test(k));
                    if (k) return k;
                } catch(_) {}
            }
            return null;
        };
        const cols = {
            num:             find('no\\.?\\s*empl', 'num.*empl', 'empleado', '^id$'),
            nombre:          find('^nombre$', 'nombre'),
            puesto:          find('^puesto$', 'puesto', 'cargo', 'posici'),
            fecha_ingreso:   find('fecha.*ingreso', 'fecha.*alta', 'ingreso', 'alta'),
            onomastico:      find('^fecha\\s+de\\s+nacimiento$', 'fecha.*nac', 'nacimient', '^cumplea[nñ]os$', 'onom', 'birth'),
            edad_raw:        find('^edad$', 'edad'),  // fallback solo numérico
            celular:         find('cel[uú]lar', 'm[oó]vil', 'celular', 'cel', 'tel[eé]f[oó]nico', 'no\\.?\\s*tel', 'tel[eé]fono'),
            extension:       find('^ext\\.?$', 'extensi'),
            correo:          find('correo.*inst', 'institucional.*correo', 'correo.*inst'),
            correo_personal: find('correo.*pers', 'personal.*correo', 'email.*pers', 'pers.*email', 'correo', 'email', 'mail'),
            profesion:       find('licenciatura', 'maestr[ií]a', 'nombre.*lic', 'nombre.*maest', 'profesi[oó]n$', '^profes[^i]'),
            militar:         find('militar', '^civil$'),
            nivel:           find('^nivel$'),
            plaza:           find('^plaza$'),
            turno:           find('^turno$'),
            ryr:             find('ryr'),
            grado:           find('^grado$'),
            matricula:       find('matr[íi]cula', 'matricula'),
            grado_academico: find('grado.*acad', 'acad'),
            estatus:         find('^estatus$', '^status$', 'estado.*labor', 'estatus.*labor'),
            cedula:          find('c[eé]dula'),
            licencia:        find('^licencia$'),
            licencia_tipo:   find('tipo.*lic', '^tipo$'),
            vig_licencia:    find('vig.*lic', 'licencia.*vig'),
            vig_credencial:  find('vig.*cred', 'cred.*vig'),
            vig_ine:         find('vig.*ine', 'ine.*vig'),
            domicilio:       find('domicil'),
            rfc:             find('^rfc$'),
            curp:            find('^curp$'),
            comisionado:     find('^personal\\s+comisionado$', 'comision'),
            direccion_comisionado:    find('^direcci[oó]n\\s+comisionado$'),
            subdireccion_comisionado: find('^subdirecci[oó]n\\s+comisionado$'),
            gerencia_comisionado:     find('^gerencia\\s+comisionado$'),
            coordinacion_comisionado: find('^coordinaci[oó]n\\s+comisionado$'),
            direccion:       find('^dir\\.', 'dir\\..*org', '^direcci[oó]n', 'direcci(?!.*sub)'),
            subdireccion:    find('^subdir\\.', 'subdir\\..*org', 'subdir'),
            gerencia:        find('gerencia.*org', 'gerencia'),
            coordinacion:    find('coordinac.*org', 'coordinaci'),
            fecha_baja:      find('^fecha\\s+de\\s+baja$', 'fecha.*baja', 'baja.*fecha'),
            motivo_baja:     find('^motivos?\\s+de\\s+baja$', 'motivo.*baja', 'causa.*baja'),
            amonestaciones:  find('amonest'),
            comentarios:     find('comentar'),
            c1_nombre:       find('contacto.*1.*nom', 'emergencia.*1.*nom', 'contacto_?1'),
            c1_parentesco:   find('contacto.*1.*par', 'parentesco.*1', 'parentesco'),
            c1_tel:          find('contacto.*1.*tel', 'tel.*1', 'tel[eé]fono.*1'),
            c2_nombre:       find('contacto.*2.*nom', 'emergencia.*2.*nom', 'contacto_?2'),
            c2_parentesco:   find('contacto.*2.*par', 'parentesco.*2'),
            c2_tel:          find('contacto.*2.*tel', 'tel.*2', 'tel[eé]fono.*2'),
            sangre:          find('sangre'),
            alerg_med:       find('al.*med', 'medicamento'),
            alerg_ali:       find('al.*ali', 'alimento'),
            nss:             find('^nss$'),
            estado_civil:    find('estado.*civil'),
            dependientes:    find('dependiente', 'hijo'),
            rubrica:         find('r[uú]brica'),
            doc_ingreso:     find('doc.*ingreso', 'ingreso.*doc'),
            foto:            find('^foto$', 'foto.*url', 'foto.*perfil', '^imagen$'),
            foto_ine:        find('foto.*ine', 'ine.*frente'),
            foto_ine_rev:    find('ine.*rev', 'rev.*ine', 'ine.*reverso'),
            foto_cred:       find('foto.*cred', 'cred.*foto'),
            cv_url:          find('^cv$', 'cv_url', 'curriculum', 'curr[ií]culum', 'cv.*url', 'url.*cv'),
            sexo:            find('^sexo$', 'g[eé]nero', '^sex$'),
        };
        console.log('[Colaboradores] Mapeo detectado:', cols);
        return cols;
    }

    /* -- Obtener valor de un registro usando colabCols -- */
    function gc(record, colKey) {
        if (!colabCols || !colabCols[colKey]) return null;
        return record[colabCols[colKey]] ?? null;
    }

    /* -- Universo operativo del Resumen del Directorio -- */
    function colabObtenerUniversoDirectorio() {
        const policy = window.ColaboradoresDirectoryPolicy;
        if (!policy || typeof policy.buildUniverse !== 'function') {
            throw new Error('No se pudo cargar la política de personal activo del directorio.');
        }

        colabDirectoryUniverse = policy.buildUniverse(colabCache || [], {
            get: (record, field) => gc(record, field),
            today: new Date(),
        });
        return colabDirectoryUniverse;
    }

    /* Auditoría del sexo, bajo demanda desde la consola.
       Sirve para ver de dónde sale cada clasificación cuando un
       conteo no cuadra: qué valores trae la columna, cómo se
       clasifica cada uno y quiénes tienen el texto peleado con
       su CURP (que es el dato que no admite dos lecturas). */
    /* Por qué no se guarda la fecha de baja: dice si la columna existe en la
       tabla y con qué nombre exacto la ve la aplicación. */
    window.colabDiagnosticoBaja = function() {
        const columnas = Object.keys((colabCache && colabCache[0]) || {});
        const info = {
            columnaFechaDetectada: (colabCols && colabCols.fecha_baja) || null,
            columnaMotivoDetectada: (colabCols && colabCols.motivo_baja) || null,
            columnasDeLaTablaQueHablanDeBaja: columnas.filter(k => /baja/i.test(k)),
            columnasEnLaTabla: columnas.length,
            registrosCargados: (colabCache || []).length,
        };
        console.table(info);
        if (!info.columnaFechaDetectada) {
            console.warn('[Colaboradores] agenda_2026 no tiene columna de fecha de baja: corre db/agregar_fecha_baja.sql en Supabase.');
        }
        return info;
    };

    window.colabAuditarSexos = function(numeroEmpleado) {
        const policy = window.ColaboradoresDirectoryPolicy;
        const universe = colabObtenerUniversoDirectorio();

        /* Con un número se revisa a una sola persona: salen TODAS sus
           filas —incluidas las de renovaciones anteriores— con lo que
           dice cada una y cuál se quedó en el directorio. */
        if (numeroEmpleado != null && String(numeroEmpleado).trim() !== '') {
            const base = policy.baseEmployeeNumber(String(numeroEmpleado).trim());
            const descartes = new Map(universe.excluded.map(item => [item.record, item]));
            const filas = (colabCache || [])
                .filter(r => policy.baseEmployeeNumber(String(gc(r, 'num') ?? '').trim()) === base)
                .map(r => ({
                    numeroEmpleado: gc(r, 'num') || '',
                    nombre: gc(r, 'nombre') || '',
                    estatus: gc(r, 'estatus') || '',
                    sexoCapturado: String(gc(r, 'sexo') ?? ''),
                    sexoSegunCurp: policy.genderFromCurp(gc(r, 'curp')),
                    cuentaComo: policy.resolveGender(r, gc),
                    enElDirectorio: !descartes.has(r),
                    motivoDelDescarte: descartes.get(r) ? descartes.get(r).detail : '',
                }));
            console.table(filas);
            return filas;
        }

        const valores = {};
        const discrepancias = [];

        universe.included.forEach(record => {
            const escrito = String(gc(record, 'sexo') ?? '');
            const porTexto = policy.normalizeGender(escrito);
            const porCurp  = policy.genderFromCurp(gc(record, 'curp'));
            const final    = policy.resolveGender(record, gc);
            const llave = `${JSON.stringify(escrito)} → ${final}`;
            valores[llave] = (valores[llave] || 0) + 1;
            if (porTexto !== '?' && porCurp !== '?' && porTexto !== porCurp) {
                discrepancias.push({
                    numeroEmpleado: gc(record, 'num') || '',
                    nombre: gc(record, 'nombre') || '',
                    sexoCapturado: escrito,
                    sexoSegunCurp: porCurp === 'H' ? 'Masculino' : 'Femenino',
                });
            }
        });

        const resultado = {
            total: universe.summary.total,
            hombres: universe.summary.men,
            mujeres: universe.summary.women,
            sinDefinir: universe.summary.genderOther,
            valoresDeLaColumna: valores,
            textoPeleadoConElCurp: discrepancias,
            duplicadosDescartados: universe.excluded
                .filter(item => item.reason === policy.REASONS.DUPLICATE)
                .map(item => ({
                    numeroEmpleado: gc(item.record, 'num') || '',
                    nombre: gc(item.record, 'nombre') || '',
                    detalle: item.detail,
                })),
        };
        console.table(resultado.valoresDeLaColumna);
        if (discrepancias.length) console.table(discrepancias);
        return resultado;
    };

    // Auditoría bajo demanda; no imprime datos personales automáticamente en consola.
    window.colabAuditarResumenDirectorio = function() {
        const universe = colabObtenerUniversoDirectorio();
        const identify = record => ({
            numeroEmpleado: gc(record, 'num') || '',
            nombre: gc(record, 'nombre') || '',
            estatus: gc(record, 'estatus') || '',
        });

        return {
            resumen: universe.summary,
            incluidos: universe.included.map(identify),
            excluidos: universe.excluded.map(item => ({
                ...identify(item.record),
                motivo: item.reason,
                detalle: item.detail,
            })),
        };
    };

    /* -- Helpers: mostrar/ocultar estados -- */
    function colabSetState(state) {
        const states = ['inicial', 'cargando', 'vacio', 'ficha'];
        states.forEach(s => {
            const el = document.getElementById(s === 'ficha' ? 'colab-ficha-wrap' : `colab-estado-${s}`);
            if (!el) return;
            if (s === 'ficha') {
                el.classList.toggle('d-none', state !== 'ficha');
            } else {
                el.classList.toggle('d-none', state !== s);
            }
        });
        // Si volvemos al estado inicial, refrescar el dashboard
        if (state === 'inicial') colabRenderDashboard();
    }

    /* -- Normalizar texto para comparación -- */
    function norm(s) {
        return String(s || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function colabFormatBirthDateDisplay(raw) {
        const text = String(raw ?? '').trim();
        if (!text || /^(?:sin informaci[oó]n|sin fecha de nacimiento|0|-|—|null)$/i.test(text)) {
            return 'Sin información';
        }
        let year, month, day;
        let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (match) {
            [, year, month, day] = match;
        } else {
            match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
            if (!match) return 'Sin información';
            [, day, month, year] = match;
        }
        const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
        const valid = date.getUTCFullYear() === Number(year)
            && date.getUTCMonth() + 1 === Number(month)
            && date.getUTCDate() === Number(day)
            && Number(year) >= 1900
            && Number(year) <= 2010;
        return valid ? `${day}/${month}/${year}` : 'Sin información';
    }

    function colabNormalizeBirthDateStorage(raw) {
        const display = colabFormatBirthDateDisplay(raw);
        if (display === 'Sin información') return display;
        const [day, month, year] = display.split('/');
        return `${year}-${month}-${day}`;
    }

    /* -- Valor o guion -- */
    function val(v) {
        const s = String(v ?? '').trim();
        return s && s !== '0' && s.toUpperCase() !== 'N/A' && s.toUpperCase() !== '#N/D' ? s : null;
    }

    const COLAB_EDIT_DENIED_MSG = 'No tienes permisos para modificar información de colaboradores.';
    const COLAB_HISTORY_DENIED_MSG = 'No tienes permisos para consultar el historial de cambios de colaboradores.';

    function colabRoleActual() {
        return norm(sessionStorage.getItem('user_role') || '')
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');
    }

    function colabEsEditor() {
        const role = colabRoleActual();
        return [
            'admin',
            'superadmin',
            'colab_editor',
            'colabeditor',
            'colab_ed',
            'colaborador_editor',
            'colaborador_ed',
            'colaborador_edit'
        ].includes(role);
    }

    function colabRequireEdit() {
        if (colabEsEditor()) return true;
        alert(COLAB_EDIT_DENIED_MSG);
        return false;
    }

    function colabPuedeVerHistorial() {
        const role = colabRoleActual();
        return [
            'admin',
            'superadmin',
            'colab_editor',
            'colabeditor',
            'colab_ed',
            'colaborador_editor',
            'colaborador_ed',
            'colaborador_edit'
        ].includes(role);
    }

    function colabRequireHistorial() {
        if (colabPuedeVerHistorial()) return true;
        alert(COLAB_HISTORY_DENIED_MSG);
        return false;
    }

    function colabNormalizarEstatus(raw) {
        const n = norm(raw);
        if (n === 'baja') return 'Baja';
        if (n === 'activo') return 'Activo';
        return 'Activo';
    }

    /* Una fecha suelta se lee mejor en día/mes/año; lo que no sea una fecha
       reconocible se muestra tal cual se capturó. */
    /* Al revés: lo que se muestre en un campo de fecha del navegador tiene
       que ir en AAAA-MM-DD. */
    function colabFechaISO(valor) {
        const texto = String(valor == null ? '' : valor).trim();
        if (!texto) return '';
        // Si la columna es date/timestamp, PostgREST devuelve la hora pegada
        // (2026-03-15T00:00:00+00:00). Al campo solo le sirve el día.
        if (/^\d{4}-\d{2}-\d{2}/.test(texto)) return texto.slice(0, 10);
        const dmy = texto.match(/^([0-3]?\d)[\/-]([01]?\d)[\/-](\d{4})$/);
        if (!dmy) return '';
        return `${dmy[3]}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`;
    }

    const COLAB_MESES = [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
    ];

    /* "15 de marzo de 2026": en la ficha se lee mejor que 15/03/2026. */
    function colabFechaLarga(valor) {
        const iso = colabFechaISO(valor);
        if (!iso) return '';
        const [anio, mes, dia] = iso.split('-').map(Number);
        return `${dia} de ${COLAB_MESES[mes - 1]} de ${anio}`;
    }

    /* Cuánto hace de esa fecha, para no tener que sacar la cuenta. */
    function colabHaceCuanto(valor) {
        const iso = colabFechaISO(valor);
        if (!iso) return '';
        const dias = Math.floor((Date.now() - Date.parse(iso + 'T00:00:00')) / 86400000);
        if (!Number.isFinite(dias) || dias < 0) return '';
        if (dias === 0) return 'hoy';
        if (dias === 1) return 'ayer';
        if (dias < 30) return `hace ${dias} días`;
        const meses = Math.floor(dias / 30.44);
        if (meses < 12) return `hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`;
        const anios = Math.floor(dias / 365.25);
        return `hace ${anios} ${anios === 1 ? 'año' : 'años'}`;
    }

    function colabFechaCorta(valor) {
        const texto = String(valor == null ? '' : valor).trim();
        if (!texto) return '';
        const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
        return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : texto;
    }
    
    function colabEstatusChipHtml(status, record) {
        const est = colabNormalizarEstatus(status);
        const cls = est === 'Baja' ? 'status-baja' : 'status-activo';
        const icon = est === 'Baja' ? 'fa-user-slash' : 'fa-user-check';
        // Una baja sin fecha no dice desde cuándo dejó de contar.
        const fecha = est === 'Baja' && record ? colabFechaCorta(gc(record, 'fecha_baja')) : '';
        const detalle = fecha ? ` · ${fecha}` : '';
        return `<span class="colab-chip ${cls}"><i class="fas ${icon}" aria-hidden="true"></i>${est}${detalle}</span>`;
    }

    /* El estatus se pinta del color de lo que dice: verde activo, rojo baja.
       Se aplica al abrir la ficha y cada vez que se cambia la opción. */
    function colabPintarEstatus() {
        const sel = document.getElementById('ce-estatus');
        if (!sel) return;
        const esBaja = colabNormalizarEstatus(sel.value) === 'Baja';
        sel.classList.toggle('es-baja', esBaja);
        sel.classList.toggle('es-activo', !esBaja);
    }

    /* -- Rellenar campo -- */
    function fillField(id, value, opts = {}) {
        const el = document.getElementById(id);
        if (!el) return;
        const v = val(value);
        el.textContent = v || '—';
        el.classList.toggle('empty', !v);
        if (opts.highlight && v) el.classList.add('highlight');
        if (opts.danger && v) el.classList.add('danger');
    }

    /* -- Avatar fallback: intenta jpg ? png ? webp, luego placeholder -- */
    const EMPLOYEE_PHOTOS_BASE = 'https://fgstncvuuhpgyzmjceyr.supabase.co/storage/v1/object/public/employee-photos/';
    const EMPLOYEE_CVDOCS_BASE  = 'https://fgstncvuuhpgyzmjceyr.supabase.co/storage/v1/object/public/employee-cvs/';
    const EMPLOYEE_PHOTO_EXTS  = ['jpg', 'jpeg', 'png', 'webp'];

    window.colabAvatarFallback = function(img) {
        const numEmpl = img.dataset.numEmpl;
        const tryExt  = parseInt(img.dataset.tryExt || '0', 10) + 1;
        if (numEmpl && tryExt < EMPLOYEE_PHOTO_EXTS.length) {
            img.dataset.tryExt = tryExt;
            img.src = EMPLOYEE_PHOTOS_BASE + numEmpl + '.' + EMPLOYEE_PHOTO_EXTS[tryExt];
        } else {
            img.style.display = 'none';
            img.removeAttribute('data-num-empl');
            const p = document.getElementById('colab-avatar-placeholder');
            if (p) p.style.display = '';
        }
    };

    /* -- Cargar foto documento -- */
    async function loadDocPhoto(imgId, url, kind) {
        const img = document.getElementById(imgId);
        if (!img) return;
        const loadToken = String(Date.now()) + Math.random();
        img.dataset.loadToken = loadToken;
        if (url && url.trim() && url.trim() !== '0') {
            try {
                const resolved = window.employeeDocumentUpload
                    ? await window.employeeDocumentUpload.resolve(window.supabaseClient, url.trim(), kind)
                    : url.trim();
                if (img.dataset.loadToken !== loadToken) return;
                img.src = resolved;
                img.style.display = 'block';
                const frame = img.parentElement;
                const placeholder = frame.querySelector('.colab-doc-empty');
                if (placeholder) placeholder.style.display = 'none';
            } catch (error) {
                if (img.dataset.loadToken !== loadToken) return;
                img.style.display = 'none';
                const placeholder = img.parentElement?.querySelector('.colab-doc-empty');
                if (placeholder) placeholder.style.display = 'flex';
                console.error('[Colaboradores][Documento] No se pudo visualizar', {
                    documentKind: kind || null,
                    code: error?.code || 'RESOLVE_FAILED'
                });
            }
        } else {
            img.style.display = 'none';
            const placeholder = img.parentElement?.querySelector('.colab-doc-empty');
            if (placeholder) placeholder.style.display = 'flex';
        }
    }

    /* -- Construir chips del header -- */
    function buildChips(c) {
        const chips = [];
        const nivel   = val(gc(c, 'nivel'));
        const turno   = val(gc(c, 'turno'));
        const militar = val(gc(c, 'militar'));
        if (nivel)   chips.push({ label: `Nivel ${nivel}`, cls: 'gold', icon: 'fa-star' });
        if (turno)   chips.push({ label: turno, cls: '', icon: 'fa-clock' });
        if (militar) chips.push({ label: militar, cls: '', icon: 'fa-shield-alt' });
        const container = document.getElementById('colab-h-chips');
        if (!container) return;
        container.innerHTML = chips.map(ch =>
            `<span class="colab-chip ${ch.cls}"><i class="fas ${ch.icon}" aria-hidden="true"></i>${ch.label}</span>`
        ).join('');
    }

    /* -- Organigrama en corner -- */
    function buildCorner(c) {
        const corner = document.getElementById('colab-h-corner');
        if (!corner) return;
        const lines = [
            val(gc(c, 'direccion')),
            val(gc(c, 'subdireccion')),
            val(gc(c, 'gerencia')),
            val(gc(c, 'coordinacion'))
        ].filter(Boolean);
        corner.innerHTML = lines.map(l =>
            `<div class="colab-org-line">${l}</div>`
        ).join('');
    }

    /* -- Contactos de emergencia -- */
    function buildContacts(c) {
        const list = document.getElementById('colab-contacts-list');
        if (!list) return;
        const contacts = [];
        if (val(gc(c, 'c1_nombre'))) {
            contacts.push({
                nombre:     val(gc(c, 'c1_nombre')),
                parentesco: val(gc(c, 'c1_parentesco')),
                tel:        val(gc(c, 'c1_tel'))
            });
        }
        if (val(gc(c, 'c2_nombre'))) {
            contacts.push({
                nombre:     val(gc(c, 'c2_nombre')),
                parentesco: val(gc(c, 'c2_parentesco')),
                tel:        val(gc(c, 'c2_tel'))
            });
        }
        if (!contacts.length) {
            list.innerHTML = '<p class="text-muted" style="font-size:.83rem;margin:0">Sin contactos de emergencia registrados</p>';
            return;
        }
        list.innerHTML = contacts.map(co =>
            `<div class="colab-contact-row">
                <div class="colab-contact-name"><i class="fas fa-user-friends me-2 text-danger opacity-75" aria-hidden="true"></i>${co.nombre || '—'}</div>
                <div class="colab-contact-rel">${co.parentesco || '—'}</div>
                <div class="colab-contact-tel"><i class="fas fa-phone-alt me-1" aria-hidden="true"></i>${co.tel || '—'}</div>
            </div>`
        ).join('');
    }

    /* -- Pintar íconos médicos -- */
    function setMedIcon(icoId, value) {
        const ico = document.getElementById(icoId);
        if (!ico) return;
        const isNo = String(value || '').toUpperCase().trim() === 'NO';
        ico.classList.toggle('ok', isNo);
    }

    /* -- Renderizar ficha -- */
    const EMPLOYEE_DOCS_BUCKET = 'employee-cvs';
    const EMPLOYEE_DOCS_PREFIX = 'amonest/';
    const EMPLOYEE_DOCS_BASE   = 'https://fgstncvuuhpgyzmjceyr.supabase.co/storage/v1/object/public/employee-cvs/amonest/';

    // Subir PDF de amonestación
    window.colabAmonestacionUpload = async function(numEmpleado, idx, inputEl) {
        if (!colabRequireEdit()) {
            if (inputEl) inputEl.value = '';
            return;
        }
        const file = inputEl?.files?.[0];
        if (!file) return;
        const actionsDiv = inputEl.closest('.ca-item')?.querySelector('.ca-actions');
        if (actionsDiv) actionsDiv.innerHTML = '<span class="ca-uploading"><i class="fas fa-spinner fa-spin me-1"></i>Subiendo…</span>';
        try {
            const sb = window.supabaseClient;
            if (!sb) throw new Error('Sin conexión Supabase');
            const path = numEmpleado + '_' + idx + '.pdf';
            const { error } = await sb.storage.from(EMPLOYEE_DOCS_BUCKET).upload(EMPLOYEE_DOCS_PREFIX + path, file, { upsert: true, contentType: 'application/pdf' });
            if (error) throw error;
            const url = EMPLOYEE_DOCS_BASE + path;
            if (actionsDiv) {
                actionsDiv.innerHTML = colabAmonestBtns(numEmpleado, idx, url, true);
            }
        } catch (err) {
            console.error('[Colaboradores] Error subiendo amonestación PDF:', err);
            if (actionsDiv) actionsDiv.innerHTML = '<span class="ca-uploading text-danger"><i class="fas fa-times-circle me-1"></i>Error al subir</span>';
        }
    };

    // Generar HTML de botones para un item
    function colabAmonestBtns(numEmpleado, idx, existingUrl, canEdit) {
        const urlAttr = existingUrl ? ` data-url="${encodeURIComponent(existingUrl)}"` : '';
        const viewBtn = existingUrl
            ? `<a class="ca-btn-view" href="${existingUrl}" target="_blank" rel="noopener"><i class="fas fa-file-pdf me-1"></i>Ver PDF</a>`
            : '';
        const attachBtn = canEdit
            ? `<label class="ca-btn-attach" title="Adjuntar PDF">
                <i class="fas fa-paperclip me-1"></i>${existingUrl ? 'Reemplazar' : 'Adjuntar PDF'}
                <input type="file" accept="application/pdf" style="display:none"
                    onchange="colabAmonestacionUpload('${numEmpleado}',${idx},this)">
               </label>`
            : '';
        return viewBtn + attachBtn;
    }

    // Renderizar el bloque de amonestaciones
    async function renderAmonestaciones(c) {
        const container = document.getElementById('cf-amonestaciones-list');
        if (!container) return;
        const rawText = gc(c, 'amonestaciones');
        const canEdit = colabCanEdit();
        const numEmpleado = val(gc(c, 'num')) || 'sin_num';

        if (!val(rawText)) {
            container.innerHTML = '<p class="ca-empty">—</p>';
            return;
        }

        // Separar en líneas, filtrar vacías
        const lines = String(rawText).split(/\n/).map(l => l.trim()).filter(Boolean);

        // Render inicial sin info de archivos existentes
        container.innerHTML = `<ul class="ca-list">${lines.map((line, i) => {
            const idx = i + 1;
            return `<li class="ca-item">
                <span class="ca-text">${line.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>
                <div class="ca-actions" id="ca-actions-${numEmpleado}-${idx}">
                    ${colabAmonestBtns(numEmpleado, idx, null, canEdit)}
                </div>
            </li>`;
        }).join('')}</ul>`;

        // En background: verificar cuáles ya tienen PDF
        try {
            const sb = window.supabaseClient;
            if (!sb) return;
            const { data: files } = await sb.storage.from(EMPLOYEE_DOCS_BUCKET).list(EMPLOYEE_DOCS_PREFIX.replace(/\/$/, ''), { search: numEmpleado + '_' });
            if (!files?.length) return;
            const existingSet = new Set(files.map(f => f.name));
            lines.forEach((_, i) => {
                const idx = i + 1;
                const fileName = numEmpleado + '_' + idx + '.pdf';
                if (existingSet.has(fileName)) {
                    const actionsDiv = document.getElementById(`ca-actions-${numEmpleado}-${idx}`);
                    if (actionsDiv) actionsDiv.innerHTML = colabAmonestBtns(numEmpleado, idx, EMPLOYEE_DOCS_BASE + fileName, canEdit);
                }
            });
        } catch (e) {
            // silenciar — los botones "Ver PDF" simplemente no aparecen
        }
    }

    function renderFicha(c) {
        // Breadcrumb
        const actionNombre = document.getElementById('colab-action-nombre');
        if (actionNombre) actionNombre.textContent = val(gc(c, 'nombre')) || '—';

        // Header
        const numEl = document.getElementById('colab-h-numero');
        if (numEl) numEl.textContent = val(gc(c, 'num')) || '—';
        const nomEl = document.getElementById('colab-h-nombre');
        if (nomEl) nomEl.textContent = val(gc(c, 'nombre')) || '—';
        const estatusEl = document.getElementById('colab-h-estatus');
        if (estatusEl) estatusEl.innerHTML = colabEstatusChipHtml(gc(c, 'estatus'), c);
        /* Aviso de baja. Encabeza el expediente solo cuando la persona ya no
           está activa; la fecha y el motivo se muestran si están capturados, y
           si falta la fecha lo dice, que también es información. */
        const esBaja = colabNormalizarEstatus(gc(c, 'estatus')) === 'Baja';
        const fechaBajaCruda = gc(c, 'fecha_baja');
        const motivoBaja = val(gc(c, 'motivo_baja'));
        const avisoBaja = document.getElementById('colab-baja-aviso');
        if (avisoBaja) {
            const visible = esBaja || Boolean(colabFechaISO(fechaBajaCruda)) || Boolean(motivoBaja);
            avisoBaja.style.display = visible ? '' : 'none';
            if (visible) {
                const larga = colabFechaLarga(fechaBajaCruda);
                const crudo = val(fechaBajaCruda);
                const fechaEl = document.getElementById('colab-baja-fecha');
                if (fechaEl && larga) {
                    // larga y hace salen de una fecha ya validada: dígitos y meses.
                    const hace = colabHaceCuanto(fechaBajaCruda);
                    fechaEl.innerHTML = `Causó baja el ${larga}`
                        + (hace ? ` <span class="colab-baja-relativo">· ${hace}</span>` : '');
                } else if (fechaEl && crudo) {
                    // Lo capturado no parece una fecha: se respeta como texto.
                    fechaEl.textContent = `Causó baja el ${crudo}`;
                } else if (fechaEl) {
                    fechaEl.innerHTML = '<span class="colab-baja-pendiente">Sin fecha de baja capturada</span>';
                }
                const motivoEl = document.getElementById('colab-baja-motivo');
                const motivoTxt = document.getElementById('colab-baja-motivo-txt');
                if (motivoTxt) motivoTxt.textContent = motivoBaja;
                if (motivoEl) motivoEl.hidden = !motivoBaja;
            }
        }
        const puesEl = document.getElementById('colab-h-puesto');
        if (puesEl) puesEl.textContent = val(gc(c, 'puesto')) || '—';
        const semEl = document.getElementById('colab-h-semaforo');
        if (semEl) semEl.innerHTML = colabSemaforoHtml(c, false);
        buildChips(c);
        buildCorner(c);

        // Avatar
        const avatarImg = document.getElementById('colab-avatar-img');
        const avatarPh  = document.getElementById('colab-avatar-placeholder');
        if (avatarImg && avatarPh) {
            const fotoUrl = val(gc(c, 'foto'));
            const numEmpl = val(gc(c, 'num'));
            if (fotoUrl) {
                // URL explícita en la base de datos
                delete avatarImg.dataset.numEmpl;
                avatarImg.src = fotoUrl;
                avatarImg.style.display = 'block';
                avatarPh.style.display = 'none';
            } else if (numEmpl) {
                // Intentar cargar desde el bucket por número de empleado (jpg ? png ? webp)
                avatarImg.dataset.numEmpl = numEmpl;
                avatarImg.dataset.tryExt  = '0';
                avatarImg.src = EMPLOYEE_PHOTOS_BASE + numEmpl + '.' + EMPLOYEE_PHOTO_EXTS[0];
                avatarImg.style.display = 'block';
                avatarPh.style.display = 'none';
            } else {
                delete avatarImg.dataset.numEmpl;
                avatarImg.src = '';
                avatarImg.style.display = 'none';
                avatarPh.style.display = '';
            }
        }

        // Sección 1: Datos generales
        fillField('cf-puesto',        gc(c, 'puesto'));
        fillField('cf-fecha-ingreso', gc(c, 'fecha_ingreso'));
        (function() {
            /* Calcular cumpleaños desde onomastico/edad */
            const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio',
                              'julio','agosto','septiembre','octubre','noviembre','diciembre'];
            function normalizarAnioNacimiento(y) {
                const n = parseInt(y, 10);
                if (isNaN(n)) return null;
                if (String(y).length === 2) {
                    const actual = new Date().getFullYear() % 100;
                    return n <= actual ? 2000 + n : 1900 + n;
                }
                return n;
            }
            function parseFechaNacimiento(raw) {
                if (!raw) return null;
                const s = String(raw).trim();
                // ISO date YYYY-MM-DD o YYYY/MM/DD
                const isoMatch = s.match(/^(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})/);
                if (isoMatch) {
                    return { d: parseInt(isoMatch[3], 10), m: parseInt(isoMatch[2], 10) - 1, y: parseInt(isoMatch[1], 10) };
                }
                // Fechas con / o - y año de 2 o 4 dígitos. Excel suele entregar M/D/YY.
                const slashMatch = s.match(/^(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{2,4})$/);
                if (slashMatch) {
                    const a = parseInt(slashMatch[1], 10);
                    const b = parseInt(slashMatch[2], 10);
                    const y = normalizarAnioNacimiento(slashMatch[3]);
                    if (!y) return null;
                    const mesPrimero = b > 12 || (a <= 12 && b <= 31);
                    return mesPrimero ? { d: b, m: a - 1, y } : { d: a, m: b - 1, y };
                }
                return null;
            }
            function formatBirthday(raw) {
                const s = String(raw ?? '').trim();
                const f = parseFechaNacimiento(raw);
                if (f && f.d >= 1 && f.d <= 31 && f.m >= 0 && f.m < 12 && f.y >= 1900) {
                    return f.d + ' de ' + MESES_ES[f.m] + ' de ' + f.y;
                }
                // Solo número: interpretar como edad ? año de nacimiento
                const age = parseInt(s, 10);
                if (!isNaN(age) && age > 0 && age < 120) {
                    const birthYear = new Date().getFullYear() - age;
                    return 'Año nacimiento: ' + birthYear;
                }
                return s; // devolver tal cual si no se reconoce
            }
            const rawOnom = gc(c, 'onomastico');
            fillField('cf-onomastico', colabFormatBirthDateDisplay(rawOnom));
        })();
        fillField('cf-celular',       gc(c, 'celular'));
        fillField('cf-ext',           gc(c, 'extension'));
        fillField('cf-correo',        gc(c, 'correo'), { highlight: true });
        fillField('cf-profesion',     gc(c, 'profesion'));
        fillField('cf-militar',       gc(c, 'militar'));
        fillField('cf-sexo',          gc(c, 'sexo'));

        // Sección 2: Clasificación
        fillField('cf-nivel',           gc(c, 'nivel'), { highlight: true });
        fillField('cf-plaza',           gc(c, 'plaza'));
        fillField('cf-turno',           gc(c, 'turno'));
        fillField('cf-ryr',             gc(c, 'ryr'));
        fillField('cf-grado',           gc(c, 'grado'));
        fillField('cf-matricula',       gc(c, 'matricula'));
        fillField('cf-grado-academico', gc(c, 'grado_academico'));
        fillField('cf-cedula',          gc(c, 'cedula'));

        // Sección 3: Documentos
        loadDocPhoto('colab-foto-ine',     val(gc(c, 'foto_ine')),     'ine_front');
        loadDocPhoto('colab-foto-ine-rev', val(gc(c, 'foto_ine_rev')), 'ine_back');
        loadDocPhoto('colab-foto-cred',    val(gc(c, 'foto_cred')),     'credential');

        fillField('cf-licencia',       gc(c, 'licencia'));
        fillField('cf-licencia-tipo',  gc(c, 'licencia_tipo'));
        fillField('cf-vig-licencia',   gc(c, 'vig_licencia'));
        fillField('cf-vig-credencial', gc(c, 'vig_credencial'));
        fillField('cf-vig-ine',        gc(c, 'vig_ine'));
        fillField('cf-domicilio',      gc(c, 'domicilio'));
        fillField('cf-rfc',            gc(c, 'rfc'));
        fillField('cf-curp',           gc(c, 'curp'));

        // Sección 4: Organización
        fillField('cf-comisionado',  gc(c, 'comisionado'));
        fillField('cf-direccion',    gc(c, 'direccion'));
        fillField('cf-subdireccion', gc(c, 'subdireccion'));
        fillField('cf-gerencia',     gc(c, 'gerencia'));
        fillField('cf-coordinacion', gc(c, 'coordinacion'));

        // Sección 5: Amonestaciones y comentarios
        renderAmonestaciones(c);
        renderComentarios(c);

        // Sección 6: Emergencias
        buildContacts(c);
        fillField('cf-sangre',    gc(c, 'sangre'));
        fillField('cf-alerg-med', gc(c, 'alerg_med'));
        fillField('cf-alerg-ali', gc(c, 'alerg_ali'));
        fillField('cf-nss',       gc(c, 'nss'));
        setMedIcon('colab-almed-ico', gc(c, 'alerg_med'));
        setMedIcon('colab-alali-ico', gc(c, 'alerg_ali'));

        // Sección 7: Civil
        fillField('cf-estado-civil',  gc(c, 'estado_civil'));
        fillField('cf-dependientes',  gc(c, 'dependientes'));
        fillField('cf-rubrica',       gc(c, 'rubrica'));
        fillField('cf-doc-ingreso',   gc(c, 'doc_ingreso'));

        // Sección CV
        (() => {
            const numEmpl   = val(gc(c, 'num'));
            const cvUrl     = val(gc(c, 'cv_url'));   // sólo si la columna existe en BD
            const nombreEl  = document.getElementById('colab-cv-nombre');
            const fechaEl   = document.getElementById('colab-cv-fecha');
            const actionsEl = document.getElementById('colab-cv-actions');
            if (!nombreEl || !actionsEl) return;
            if (cvUrl) {
                nombreEl.textContent = `CV_${numEmpl || 'colaborador'}.pdf`;
                if (fechaEl) fechaEl.textContent = 'Haz click en "Vista previa" para verlo aquí mismo';
                actionsEl.innerHTML = `
                    <button type="button" class="btn btn-sm btn-outline-danger" onclick="colabToggleCvPreview('${cvUrl}')">
                        <i class="fas fa-eye me-1"></i>Vista previa
                    </button>
                    <a href="${cvUrl}" download class="btn btn-sm btn-outline-secondary">
                        <i class="fas fa-download me-1"></i>Descargar
                    </a>`;
            } else {
                nombreEl.innerHTML = '<span class="colab-cv-empty">Sin CV cargado</span>';
                if (fechaEl) fechaEl.textContent = '';
                actionsEl.innerHTML = '';
            }
        })();
        colabCurrentRow = c;
        const editBtn = document.getElementById('colab-btn-edit');
        if (editBtn) editBtn.classList.toggle('d-none', !colabCanEdit());
        const deleteBtn = document.getElementById('colab-btn-delete');
        if (deleteBtn) deleteBtn.classList.toggle('d-none', !colabCanDelete());
        const deleteFromModalBtn = document.getElementById('btn-colab-delete-from-modal');
        if (deleteFromModalBtn) deleteFromModalBtn.classList.toggle('d-none', !colabCanDelete());
        colabActualizarBotonesAdmin();

        // Cargar historial (async, sin bloquear el render)
        colabCargarHistorial(val(gc(c, 'num')));
        colabCargarHistorialPlaza(val(gc(c, 'num')));

        // Cargar cursos (async)
        colabCargarCursos(val(gc(c, 'num')));

        // Cargar vacaciones (async)
        vacLoadForColab(val(gc(c, 'num')));

        // Limpiar la alerta hero si no hay cursos todavía (se actualiza en colabRenderCursos)
        const heroAlertEl = document.getElementById('colab-cursos-hero-alert');
        if (heroAlertEl) { heroAlertEl.classList.remove('visible'); heroAlertEl.innerHTML = ''; }

        // Mostrar drop zone si el usuario tiene permisos
        colabCursosToggleDropzone();
        colabCursosInitDropzone();

        colabSetState('ficha');
    }

    /* -- Cargar todos los colaboradores desde Supabase -- */
    async function colabCargarTodos() {
        if (colabLoaded && colabCache) return colabCache;
        if (colabLoadPromise) return colabLoadPromise;

        colabLoadPromise = (async () => {
            try {
                // Esperar hasta que supabaseClient esté disponible (máx 5 s)
                let client = window.supabaseClient;
                if (!client) {
                    if (typeof window.ensureSupabaseClient === 'function') {
                        client = await window.ensureSupabaseClient();
                    }
                    if (!client) {
                        // Reintentar hasta 10 veces cada 500 ms
                        for (let i = 0; i < 10; i++) {
                            await new Promise(r => setTimeout(r, 500));
                            if (window.supabaseClient) { client = window.supabaseClient; break; }
                        }
                    }
                    if (!client) throw new Error('Cliente Supabase no disponible después de esperar');
                }

                const { data, error } = await client
                    .from('agenda_2026')
                    .select('*')
                    .limit(2000);

                if (error) throw error;
                colabCache  = data || [];
                colabDirectoryUniverse = null;
                colabLoadPromise = null; // limpiar para posibles recargas futuras
                window.colabCache = colabCache; // exponer globalmente para módulo vacaciones
                if (colabCache.length) {
                    colabLoaded = true;
                    colabLoadAttempts = 0;
                    colabCols = colabDetectarColumnas(colabCache[0]);
                } else {
                    colabLoadAttempts++;
                    // Permitir hasta 2 reintentos automáticos (la sesión puede no
                    // estar lista cuando la precarga silenciosa se ejecuta).
                    // Tras el 3er intento vacío se acepta que la tabla está vacía.
                    if (colabLoadAttempts >= 3) {
                        colabLoaded = true;
                    } else {
                        colabLoaded = false;
                    }
                    console.warn(`[Colaboradores] agenda_2026 vacía (intento ${colabLoadAttempts}/3).`);
                }
                return colabCache;
            } catch (err) {
                console.error('[Colaboradores] Error al cargar agenda_2026:', err?.message || err);
                colabLastError = err?.message || String(err);
                colabCache       = [];
                colabDirectoryUniverse = null;
                colabLoaded      = false;
                colabLoadPromise = null;
                return [];
            }
        })();
        return colabLoadPromise;
    }

    /* -- Precarga en segundo plano cuando se entra a la sección -- */
    function colabPrecargar() {
        colabRenderDashboard();
    }

    /* -- Dashboard de estadísticas -- */
    function colabRenderDashboard() {
        // Si los datos aún no están, arrancar la carga y volver a intentar al terminar
        if (!colabLoaded) {
            colabCargarTodos().then(result => {
                if (result && result.length) {
                    colabRenderDashboard();
                } else {
                    // Mostrar mensaje con botón de reintento
                    const loading = document.getElementById('cd-loading');
                    if (loading) {
                        const errMsg = colabLastError ? ` (${colabLastError})` : '';
                        loading.innerHTML = `<div class="d-flex align-items-center gap-2 flex-wrap">
                            <i class="fas fa-exclamation-triangle text-warning"></i>
                            <span class="text-muted" style="font-size:.85rem">No se encontraron registros en el directorio${errMsg}. Puede ser un problema de sesión o conexión.</span>
                            <button class="btn btn-sm btn-outline-primary" onclick="colabReintentar()"><i class="fas fa-redo me-1"></i>Reintentar</button>
                        </div>`;
                    }
                }
            }).catch(() => {});
            return;
        }
        if (!colabCache || !colabCache.length) {
            const loading = document.getElementById('cd-loading');
            if (loading) loading.innerHTML = `<div class="d-flex align-items-center gap-2 flex-wrap">
                <span class="text-muted" style="font-size:.85rem">El directorio no tiene registros.</span>
                <button class="btn btn-sm btn-outline-secondary" onclick="colabReintentar()"><i class="fas fa-redo me-1"></i>Reintentar</button>
            </div>`;
            return;
        }

        // Ocultar spinner, mostrar contenido
        const loading = document.getElementById('cd-loading');
        const content = document.getElementById('cd-content');
        if (loading) loading.style.display = 'none';
        if (content) content.classList.remove('d-none');

        // Todos los indicadores del resumen comparten el mismo universo:
        // persona real + Activo + sin baja vigente + no vacante + no comisionado fuera.
        const universe = colabObtenerUniversoDirectorio();
        const data = universe.included;
        const total = universe.summary.total;

        // Helper: contar y ordenar por campo
        function countBy(colKey) {
            const map = {};
            data.forEach(r => {
                const v = (gc(r, colKey) || '').toString().trim();
                const key = v || '(Sin dato)';
                map[key] = (map[key] || 0) + 1;
            });
            return Object.entries(map)
                .sort((a, b) => b[1] - a[1])
                .filter(([k]) => k !== '(Sin dato)' || Object.keys(map).length === 1);
        }

        const byProf   = countBy('profesion');
        const byDir    = countBy('direccion');
        const bySubDir = countBy('subdireccion');
        const byGer    = countBy('gerencia');
        const byCoord  = countBy('coordinacion');
        const byNivel  = countBy('nivel');

        // KPIs
        const setKpi = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        setKpi('cd-kpi-total',   total);
        setKpi(
            'cd-kpi-total-note',
            universe.summary.genderOther > 0
                ? `${universe.summary.genderOther} sin sexo definido`
                : 'Sólo personal activo'
        );
        // Esa nota también es una puerta: son los expedientes a los que les
        // falta capturar el sexo, y desde aquí se ve quiénes son.
        const notaTotal = document.getElementById('cd-kpi-total-note');
        if (notaTotal) {
            const haySinSexo = universe.summary.genderOther > 0;
            notaTotal.classList.toggle('cd-kpi-link', haySinSexo);
            notaTotal.title = haySinSexo ? 'Ver a quiénes les falta capturar el sexo' : '';
        }

        // Hombres y mujeres se calculan sobre el mismo universo activo.
        var masc = universe.summary.men;
        var fem  = universe.summary.women;
        var mascPct = total > 0 ? Math.round(masc / total * 100) : 0;
        var femPct  = total > 0 ? Math.round(fem  / total * 100) : 0;
        setKpi('cd-kpi-masc', masc > 0 ? masc : '');
        setKpi('cd-kpi-fem',  fem  > 0 ? fem  : '');
        setKpi('cd-kpi-masc-pct', masc > 0 ? mascPct + '% del total' : '');
        setKpi('cd-kpi-fem-pct',  fem  > 0 ? femPct + '% del total' : '');

        setKpi('cd-kpi-dirs',    byDir.filter(([k]) => k !== '(Sin dato)').length);
        setKpi('cd-kpi-subdirs', bySubDir.filter(([k]) => k !== '(Sin dato)').length);
        setKpi('cd-kpi-profs',   byProf.filter(([k]) => k !== '(Sin dato)').length);
        setKpi('cd-kpi-gers',    byGer.filter(([k]) => k !== '(Sin dato)').length);
        
        /* ---------- LAS TARJETAS DEL RESUMEN, COMO FILTROS ----------
           Cada una abre lo que cuenta: las de personas listan a esas personas,
           y las de categorías (direcciones, subdirecciones, profesiones,
           gerencias) listan las categorías con su gente para entrar a una.
           Se arma aquí porque el universo del resumen ya está resuelto: lo que
           se abre coincide exactamente con el número que muestra la tarjeta. */
        // El mismo resolutor que usa el conteo: lo capturado manda y el
        // CURP decide cuando el dato viene ambiguo (una "M" suelta) o vacío.
        const _policy = window.ColaboradoresDirectoryPolicy;
        const _sexoDe = r => (_policy && typeof _policy.resolveGender === 'function')
            ? _policy.resolveGender(r, gc)
            : '?';
        
        window.colabKpiFiltro = function(tipo) {
            // Se recalcula al abrir, no al pintar el resumen: si alguien
            // acaba de corregir un sexo en la ficha, la lista lo refleja
            // sin esperar a que el dashboard se vuelva a dibujar.
            const gente = colabObtenerUniversoDirectorio().included;
            switch (tipo) {
                case 'total':
                    _abrirGrupoModalPersonas('Total de colaboradores', 'fas fa-users', gente);
                    break;
                case 'hombres':
                    _abrirGrupoModalPersonas('Hombres', 'fas fa-mars',
                        gente.filter(r => _sexoDe(r) === 'H'));
                    break;
                case 'mujeres':
                    _abrirGrupoModalPersonas('Mujeres', 'fas fa-venus',
                        gente.filter(r => _sexoDe(r) === 'M'));
                    break;
                case 'sin-sexo':
                    _abrirGrupoModalPersonas('Sin sexo capturado', 'fas fa-circle-question',
                        gente.filter(r => _sexoDe(r) === '?'));
                    break;
                case 'direccion':
                    window.colabAbrirCategoriasModal('direccion', 'Direcciones', 'fas fa-building', 'dirección');
                    break;
                case 'subdireccion':
                    window.colabAbrirCategoriasModal('subdireccion', 'Subdirecciones', 'fas fa-sitemap', 'subdirección');
                    break;
                case 'profesion':
                    window.colabAbrirCategoriasModal('profesion', 'Profesiones', 'fas fa-graduation-cap', 'profesión');
                    break;
                case 'gerencia':
                    window.colabAbrirCategoriasModal('gerencia', 'Gerencias', 'fas fa-user-tie', 'gerencia');
                    break;
            }
        };
        
        const _kpiRow = document.querySelector('.cd-kpi-row');
        if (_kpiRow && !_kpiRow.dataset.kpiWired) {
            _kpiRow.dataset.kpiWired = '1';
            const abrirDesdeTarjeta = ev => {
                const nota = ev.target.closest('.cd-kpi-link');
                if (nota) {
                    ev.stopPropagation();
                    window.colabKpiFiltro('sin-sexo');
                    return;
                }
                const tarjeta = ev.target.closest('.cd-kpi[data-kpi]');
                if (tarjeta) window.colabKpiFiltro(tarjeta.dataset.kpi);
            };
            _kpiRow.addEventListener('click', abrirDesdeTarjeta);
            _kpiRow.addEventListener('keydown', ev => {
                if (ev.key !== 'Enter' && ev.key !== ' ') return;
                ev.preventDefault();
                abrirDesdeTarjeta(ev);
            });
        }

        // Colores de barra por tabla
        const barColors = {
            'cd-tbl-profesion':    '#7b1fa2',
            'cd-tbl-direccion':    '#2e7d32',
            'cd-tbl-subdir':       '#e65100',
            'cd-tbl-gerencia':     '#0277bd',
            'cd-tbl-coordinacion': '#00695c',
            'cd-tbl-nivel':        '#1558d6',
        };

        // Renderizar tabla de desglose (no clickeable — solo Turno)
        function renderTable(containerId, rows, maxRows) {
            const el = document.getElementById(containerId);
            if (!el) return;
            const top = rows.slice(0, maxRows || 30);
            const max = top.length ? top[0][1] : 1;
            const color = barColors[containerId] || '#1558d6';
            el.innerHTML = top.map(([name, count]) => {
                const pct = Math.round((count / max) * 100);
                return `<div class="cd-tbl-row">
                    <span class="cd-tbl-name" title="${name}">${name}</span>
                    <span class="cd-tbl-bar-wrap"><span class="cd-tbl-bar" style="width:${pct}%;background:${color}"></span></span>
                    <span class="cd-tbl-count">${count}</span>
                </div>`;
            }).join('') || '<div class="cd-tbl-loading">Sin datos</div>';
        }

        // Renderizar tabla clickeable (drill-down modal)
        function renderClickableTable(containerId, rows, colKey, maxRows) {
            const el = document.getElementById(containerId);
            if (!el) return;
            const top = rows.slice(0, maxRows || 60);
            const max = top.length ? top[0][1] : 1;
            const color = barColors[containerId] || '#1558d6';
            el.innerHTML = top.map(([name, count]) => {
                const pct  = Math.round((count / max) * 100);
                const safe = name.replace(/"/g, '&quot;');
                const esc  = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                return `<div class="cd-tbl-row clickable" onclick="colabAbrirGrupoModal('${colKey}','${esc}')">
                    <span class="cd-tbl-name clickable-label" title="${safe}">${name}</span>
                    <span class="cd-tbl-bar-wrap"><span class="cd-tbl-bar" style="width:${pct}%;background:${color}"></span></span>
                    <span class="cd-tbl-count">${count}</span>
                </div>`;
            }).join('') || '<div class="cd-tbl-loading">Sin datos</div>';
        }

        /* Tabla de Profesión: clickeable con buscador */
        let _profAllRows = byProf; // guardamos referencia global para filtro
        function renderProfTable(rows) {
            const el = document.getElementById('cd-tbl-profesion');
            if (!el) return;
            const max = rows.length ? rows[0][1] : 1;
            el.innerHTML = rows.map(([name, count]) => {
                const pct  = Math.round((count / max) * 100);
                const safe = name.replace(/"/g, '&quot;');
                const esc  = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                return `<div class="cd-tbl-row clickable" onclick="colabAbrirGrupoModal('profesion','${esc}')">
                    <span class="cd-tbl-name clickable-label" title="${safe}">${name}</span>
                    <span class="cd-tbl-bar-wrap"><span class="cd-tbl-bar" style="width:${pct}%;background:#7b1fa2"></span></span>
                    <span class="cd-tbl-count">${count}</span>
                </div>`;
            }).join('') || '<div class="cd-tbl-loading">Sin datos</div>';
        }
        renderProfTable(_profAllRows);

        /* Filtro del buscador de profesión */
        window.colabFiltrarProf = function(q) {
            const query = (q || '').toLowerCase().trim();
            const filtered = query
                ? _profAllRows.filter(([name]) => name.toLowerCase().includes(query))
                : _profAllRows;
            renderProfTable(filtered);
        };

        renderClickableTable('cd-tbl-direccion',    byDir,    'direccion');
        renderClickableTable('cd-tbl-subdir',       bySubDir, 'subdireccion');
        renderClickableTable('cd-tbl-gerencia',     byGer,    'gerencia');
        renderClickableTable('cd-tbl-coordinacion', byCoord,  'coordinacion');
        renderClickableTable('cd-tbl-nivel',        byNivel,  'nivel');

        /* ---------- PRÓXIMOS CUMPLEAÑOS ---------- */
        (function renderCumpleanios() {
            const listEl = document.getElementById('cd-bday-list');
            const subEl  = document.getElementById('cd-bday-header-sub');
            if (!listEl) return;

            const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun',
                                 'Jul','Ago','Sep','Oct','Nov','Dic'];

            // Parsear fecha de onomastico ? { dia, mes } (0-indexed mes)
            function parseFechaOnom(raw) {
                if (!raw) return null;
                const s = String(raw).trim();
                // YYYY-MM-DD o YYYY/MM/DD
                const iso = s.match(/^(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})/);
                if (iso) return { dia: +iso[3], mes: +iso[2] - 1 };
                // Fechas con / o - y año de 2 o 4 dígitos. Excel suele entregar M/D/YY.
                const dmy = s.match(/^(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{2,4})$/);
                if (dmy) {
                    const a = +dmy[1], b = +dmy[2];
                    const mesPrimero = b > 12 || (a <= 12 && b <= 31);
                    return mesPrimero ? { dia: b, mes: a - 1 } : { dia: a, mes: b - 1 };
                }
                // Cumpleaños sin año, por ejemplo 08-nov.
                const corto = s.match(/^(\d{1,2})[\-\/\\s]([a-záéíóúñ]{3,})/i);
                if (corto) {
                    const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
                    const mes = meses.findIndex(m => corto[2].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').startsWith(m));
                    if (mes >= 0) return { dia: +corto[1], mes };
                }
                return null;
            }

            const hoy = new Date();
            const DIAS_RANGO = 30;

            // Calcular días hasta próximo cumpleaños desde hoy
            function diasHasta(dia, mes) {
                const yr = hoy.getFullYear();
                let prox = new Date(yr, mes, dia);
                if (prox < new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()))
                    prox = new Date(yr + 1, mes, dia);
                const diff = Math.round((prox - new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())) / 86400000);
                return diff;
            }

            const proximos = [];
            data.forEach(r => {
                const onom = gc(r, 'onomastico');
                const f = parseFechaOnom(onom);
                if (!f) return;
                const d = diasHasta(f.dia, f.mes);
                if (d <= DIAS_RANGO) proximos.push({ r, f, d });
            });

            // Ordenar por días restantes
            proximos.sort((a, b) => a.d - b.d);

            if (subEl) subEl.textContent = proximos.length
                ? `${proximos.length} cumpleaños en los próximos ${DIAS_RANGO} días`
                : `Sin cumpleaños en los próximos ${DIAS_RANGO} días`;

            if (!proximos.length) {
                listEl.innerHTML = '<div class="cd-bday-empty"><i class="fas fa-birthday-cake me-2 opacity-50"></i>No hay cumpleaños próximos en los siguientes 30 días</div>';
                return;
            }

            const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

            listEl.innerHTML = proximos.map(({ r, f, d }) => {
                const nombre   = val(gc(r,'nombre'))  || '—';
                const puesto   = val(gc(r,'puesto'))  || '';
                const fotoUrl  = val(gc(r,'foto_url')) || '';
                const iniciales = nombre.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
                const avatarHtml = fotoUrl
                    ? `<img src="${esc(fotoUrl)}" alt="${esc(iniciales)}" onerror="this.style.display='none';this.nextSibling.style.display='flex'">`
                      + `<span style="display:none;width:100%;height:100%;align-items:center;justify-content:center;font-size:1rem">${esc(iniciales)}</span>`
                    : esc(iniciales);
                const fechaStr = `${f.dia} ${MESES_CORTO[f.mes]}`;
                const esHoy    = d === 0;
                const diasLabel = esHoy ? 'HOY \uD83C\uDF82' : d === 1 ? 'Mañana' : `En ${d} días`;
                const cardCls  = esHoy ? ' bday-hoy' : '';
                const numEmpl  = val(gc(r,'num')) || val(gc(r,'num_empleado')) || '';
                return `<div class="cd-bday-card${cardCls}" onclick="bdayAbrirTarjeta(${proximos.indexOf(proximos.find(x=>x.r===r))})">
                    <div class="cd-bday-avatar">${avatarHtml}</div>
                    <div class="cd-bday-info">
                        <div class="cd-bday-name-row">
                            <div class="cd-bday-name">${esc(nombre)}</div>
                            <span class="cd-bday-dias${esHoy?' hoy':''}">${diasLabel}</span>
                        </div>
                        <div class="cd-bday-puesto">${esc(puesto)}</div>
                        <div class="cd-bday-date"><i class="fas fa-calendar-alt me-1"></i>${fechaStr}</div>
                    </div>
                </div>`;
            }).join('');

            // Guardar datos para el modal
            window._bdayProximos = proximos;
        })();

        /* -- Gráficas Chart.js -- */
        (function renderColabCharts() {
            if (typeof Chart === 'undefined') return;

            // Registrar plugin de etiquetas (obligatorio en Chart.js v3+)
            if (typeof ChartDataLabels !== 'undefined') {
                Chart.register(ChartDataLabels);
            }

            const PALETTE_RING = [
                '#1558d6','#2e7d32','#e65100','#7b1fa2',
                '#0277bd','#00695c','#c62828','#f57f17',
                '#4527a0','#0d47a1','#1b5e20','#bf360c'
            ];
            const PALETTE_BAR = [
                '#1558d6','#1976d2','#1e88e5','#42a5f5',
                '#64b5f6','#90caf9','#bbdefb','#e3f2fd',
                '#0d47a1','#1565c0'
            ];

            function destroyChart(id) {
                const existing = Chart.getChart(id);
                if (existing) existing.destroy();
            }

            // Partir etiqueta larga en 2 líneas (Chart.js acepta arrays)
            function wrapLabel(s, maxLen) {
                maxLen = maxLen || 20;
                if (s.length <= maxLen) return s;
                const cut = s.lastIndexOf(' ', maxLen);
                return cut > 0 ? [s.slice(0, cut), s.slice(cut + 1)] : [s.slice(0, maxLen), s.slice(maxLen)];
            }

            // Datalabels: porcentaje en donuts
            const doughnutDatalabels = {
                display: function(ctx) {
                    return ctx.dataset.data[ctx.dataIndex] / ctx.chart.data.datasets[0].data.reduce((a,b) => a+b, 0) >= 0.03;
                },
                formatter: function(value, ctx) {
                    const total = ctx.chart.data.datasets[0].data.reduce((a,b) => a+b, 0);
                    return Math.round(value / total * 100) + '%';
                },
                color: '#fff',
                font: { size: 11, weight: '700' },
                textShadowBlur: 4,
                textShadowColor: 'rgba(0,0,0,0.5)'
            };

            // Datalabels: porcentaje en barras horizontales
            function barDatalabels(dataArr, color) {
                const tot = dataArr.reduce((a, [,v]) => a + v, 0);
                return {
                    anchor: 'end', align: 'right', clamp: true,
                    font: { size: 10, weight: '700' },
                    color: color,
                    formatter: function(value) {
                        return value + ' (' + Math.round(value / tot * 100) + '%)';
                    }
                };
            }

            // Opciones comunes para barras horizontales
            function barOpts(data, datalabelsColor) {
                return {
                    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                    layout: { padding: { right: 80, left: 4 } },
                    plugins: {
                        legend: { display: false },
                        datalabels: barDatalabels(data, datalabelsColor)
                    },
                    scales: {
                        x: { display: false },
                        y: {
                            ticks: {
                                font: { size: 9.5 },
                                padding: 10,
                                autoSkip: false,
                                callback: function(val) {
                                    return wrapLabel(String(this.getLabelForValue(val) || ''), 22);
                                }
                            },
                            afterFit: function(scale) { scale.width = Math.max(scale.width, 160); }
                        }
                    }
                };
            }

            // 1. Dirección : Doughnut
            (function() {
                const data = byDir.slice(0, 8).filter(([k]) => k !== '(Sin dato)');
                if (!data.length) return;
                destroyChart('cd-chart-dir');
                new Chart(document.getElementById('cd-chart-dir'), {
                    type: 'doughnut',
                    data: {
                        labels: data.map(([k]) => k),
                        datasets: [{ data: data.map(([,v]) => v), backgroundColor: PALETTE_RING, borderWidth: 2, borderColor: '#fff' }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        cutout: '55%',
                        onClick: function(e, els) { if (els.length) colabAbrirGrupoModal('direccion', data[els[0].index][0]); },
                        onHover:  function(e, els) { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
                        plugins: {
                            legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 13, padding: 14 } },
                            tooltip: { callbacks: { label: ctx => { const t = ctx.chart.data.datasets[0].data.reduce((a,b)=>a+b,0); return ` ${ctx.label}: ${ctx.parsed} (${Math.round(ctx.parsed/t*100)}%) — click para ver`; } } },
                            datalabels: doughnutDatalabels
                        }
                    }
                });
            })();

            // 2. Subdirección · Horizontal Bar (top 8)
            (function() {
                const data = bySubDir.slice(0, 8).filter(([k]) => k !== '(Sin dato)');
                if (!data.length) return;
                destroyChart('cd-chart-subdir');
                const opts = barOpts(data, '#1558d6');
                opts.plugins.tooltip = { callbacks: { title: ctx => bySubDir[ctx[0].dataIndex]?.[0] || ctx[0].label } };
                opts.onClick = function(e, els) { if (els.length) colabAbrirGrupoModal('subdireccion', data[els[0].index][0]); };
                opts.onHover  = function(e, els) { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; };
                new Chart(document.getElementById('cd-chart-subdir'), {
                    type: 'bar',
                    data: {
                        labels: data.map(([k]) => k),
                        datasets: [{ label: 'Colaboradores', data: data.map(([,v]) => v), backgroundColor: PALETTE_BAR.slice(0, data.length), borderRadius: 6, barThickness: 18, borderSkipped: false }]
                    },
                    options: opts
                });
            })();

            // 3. Gerencia — Horizontal Bar (top 8)
            (function() {
                const data = byGer.slice(0, 8).filter(([k]) => k !== '(Sin dato)');
                if (!data.length) return;
                destroyChart('cd-chart-ger');
                const gerColors = ['#0277bd','#0288d1','#039be5','#29b6f6','#4fc3f7','#81d4fa','#b3e5fc','#e1f5fe'];
                const opts = barOpts(data, '#0277bd');
                opts.plugins.tooltip = { callbacks: { title: ctx => byGer[ctx[0].dataIndex]?.[0] || ctx[0].label } };
                opts.onClick = function(e, els) { if (els.length) colabAbrirGrupoModal('gerencia', data[els[0].index][0]); };
                opts.onHover  = function(e, els) { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; };
                new Chart(document.getElementById('cd-chart-ger'), {
                    type: 'bar',
                    data: {
                        labels: data.map(([k]) => k),
                        datasets: [{ label: 'Colaboradores', data: data.map(([,v]) => v), backgroundColor: gerColors.slice(0, data.length), borderRadius: 6, barThickness: 18, borderSkipped: false }]
                    },
                    options: opts
                });
            })();

            // 4. Nivel — Doughnut
            (function() {
                const data = byNivel.slice(0, 10).filter(([k]) => k !== '(Sin dato)');
                if (!data.length) return;
                destroyChart('cd-chart-nivel');
                new Chart(document.getElementById('cd-chart-nivel'), {
                    type: 'doughnut',
                    data: {
                        labels: data.map(([k]) => k),
                        datasets: [{ data: data.map(([,v]) => v), backgroundColor: PALETTE_RING, borderWidth: 2, borderColor: '#fff' }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        cutout: '50%',
                        onClick: function(e, els) { if (els.length) colabAbrirGrupoModal('nivel', data[els[0].index][0]); },
                        onHover:  function(e, els) { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
                        plugins: {
                            legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 13, padding: 14 } },
                            tooltip: { callbacks: { label: ctx => { const t = ctx.chart.data.datasets[0].data.reduce((a,b)=>a+b,0); return ` ${ctx.label}: ${ctx.parsed} (${Math.round(ctx.parsed/t*100)}%) — click para ver`; } } },
                            datalabels: doughnutDatalabels
                        }
                    }
                });
            })();

            /* -- Gráficas de Comportamiento Disciplinario -- */
            (function() {
            function countAmonest(r) {
                const raw = gc(r, 'amonestaciones');
                if (!val(raw)) return 0;
                return String(raw).split('\n').filter(function(l){ return l.trim(); }).length;
            }

            function amonestBy(colKey) {
                var map = {};
                (colabCache || []).forEach(function(r) {
                    var n = countAmonest(r);
                    if (!n) return;
                    var k = ((gc(r, colKey) || '').toString().trim()) || '(Sin dato)';
                    map[k] = (map[k] || 0) + n;
                });
                return Object.entries(map).sort(function(a,b){ return b[1]-a[1]; }).filter(function(e){ return e[0] !== '(Sin dato)'; });
            }

            var amBySubdir = amonestBy('subdireccion');
            var amByGer    = amonestBy('gerencia');
            var amByCoord  = amonestBy('coordinacion');

            var total = (colabCache||[]).reduce(function(s,r){ return s+countAmonest(r); }, 0);
            var section = document.getElementById('cd-amonest-section');
            if (section) section.style.display = total > 0 ? '' : 'none';
            var badge = document.getElementById('cd-amonest-total-badge');
            if (badge) badge.textContent = total + ' amonest. totales';
            if (!total) return;

            var AM_PALETTE = [
                '#3730a3','#4338ca','#4f46e5','#6366f1','#7c3aed',
                '#8b5cf6','#2563eb','#3b82f6','#0891b2','#0f766e',
                '#059669','#16a34a'
            ];

            function escHtml(s) {
                return String(s)
                    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
                    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
            }

            function makeAmChart(hostId, colKey, data) {
                if (!data.length) return;
                var top   = data.slice(0, 12);
                var total = top.reduce(function(s,d){ return s+d[1]; }, 0);
                var maxV  = top[0][1];
                var host  = document.getElementById(hostId);
                if (!host) return;

                var rows = '';
                top.forEach(function(d, i) {
                    var barW = maxV ? Math.round(d[1] / maxV * 100) : 0;
                    var pct  = total ? Math.round(d[1] / total * 100) : 0;
                    var col  = AM_PALETTE[i % AM_PALETTE.length];
                    rows += '<div class="am-rank-item" data-grp="' + escHtml(d[0]) + '">' +
                        '<span class="am-rank-num">' + (i+1) + '</span>' +
                        '<div class="am-rank-body">' +
                            '<div class="am-rank-top">' +
                                '<span class="am-rank-label">' + escHtml(d[0]) + '</span>' +
                                '<span class="am-rank-val">' + d[1] + '</span>' +
                                '<span class="am-rank-pct">(' + pct + '%)</span>' +
                            '</div>' +
                            '<div class="am-rank-bar-wrap"><div class="am-rank-bar-fill" style="width:' + barW + '%;background:' + col + '"></div></div>' +
                        '</div>' +
                        '</div>';
                });
                host.innerHTML = '<div class="am-rank-list">' + rows + '</div>';

                host.querySelectorAll('.am-rank-item').forEach(function(item) {
                    item.addEventListener('click', function() {
                        var grp = item.getAttribute('data-grp');
                        if (grp) colabAbrirGrupoModal(colKey, grp, {
                            filter: function(r){ return countAmonest(r) > 0; },
                            subtitulo: 'con amonestaciones',
                            allRecords: true,
                            showAmonest: true
                        });
                    });
                });
            }

            makeAmChart('cd-chart-amonest-subdir', 'subdireccion', amBySubdir);
            makeAmChart('cd-chart-amonest-ger',    'gerencia',     amByGer);
            makeAmChart('cd-chart-amonest-coord',  'coordinacion', amByCoord);
            })();
        })();

        /* -- Modal drill-down genérico: colaboradores por cualquier grupo -- */
        let _grupoModalRecords = [];
        let _grupoModalOpts    = null;
        /* El modal tiene dos modos: 'personas' lista colaboradores y
           'categorias' lista direcciones, gerencias, profesiones… con su
           conteo, para entrar desde ahí a la gente de cualquiera. */
        let _grupoModalMode       = 'personas';
        let _grupoModalCategorias = [];
        let _grupoModalVolver     = null;
        let _grupoModalSinDato    = null;
        const _grupoIconMap = {
            profesion:    'fas fa-graduation-cap',
            direccion:    'fas fa-building',
            subdireccion: 'fas fa-sitemap',
            gerencia:     'fas fa-user-tie',
            coordinacion: 'fas fa-network-wired',
            nivel:        'fas fa-layer-group',
        };

        /** Abre el modal con una lista de colaboradores ya resuelta. */
        function _abrirGrupoModalPersonas(titulo, iconClass, registros, opts) {
            _grupoModalMode = 'personas';
            _grupoModalRecords = registros.slice().sort((a, b) => {
                const na = (gc(a, 'nombre') || '').toLowerCase();
                const nb = (gc(b, 'nombre') || '').toLowerCase();
                return na.localeCompare(nb, 'es');
            });
            _grupoModalOpts = opts || null;
            _grupoModalVolver = (opts && opts.volver) || null;
            _pintarCabeceraGrupoModal(
                `${titulo} (${_grupoModalRecords.length})`,
                iconClass || 'fas fa-users',
                'Buscar por nombre, número o puesto');
            _renderGrupoModalList(_grupoModalRecords);
            _abrirGrupoModalBackdrop();
        }
        
        /** Abre el modal con las categorías de un campo y cuánta gente tiene cada una. */
        window.colabAbrirCategoriasModal = function(colKey, titulo, iconClass, singular) {
            const universo = colabObtenerUniversoDirectorio().included;
            const conteo = {};
            let sinDato = 0;
            universo.forEach(r => {
                const v = (gc(r, colKey) || '').toString().trim();
                if (!v) { sinDato++; return; }
                conteo[v] = (conteo[v] || 0) + 1;
            });
            _grupoModalMode = 'categorias';
            _grupoModalCategorias = Object.entries(conteo).sort((a, b) => b[1] - a[1]);
            _grupoModalOpts = null;
            _grupoModalVolver = null;
            _grupoModalSinDato = {
                colKey,
                total: sinDato,
                titulo,
                icono: iconClass,
                singular: singular || titulo.toLowerCase(),
            };
            _pintarCabeceraGrupoModal(
                `${titulo} (${_grupoModalCategorias.length})`,
                iconClass || _grupoIconMap[colKey] || 'fas fa-layer-group',
                `Buscar en ${titulo.toLowerCase()}`);
            _renderGrupoModalCategorias(_grupoModalCategorias);
            _abrirGrupoModalBackdrop();
        };
        
        window.colabAbrirGrupoModal = function(colKey, groupValue, opts) {
            const todos = opts && opts.allRecords
                ? (colabCache || [])
                : colabObtenerUniversoDirectorio().included;
            const extraFilter = opts && opts.filter;
            const registros = todos.filter(r => {
                const v = (gc(r, colKey) || '').toString().trim();
                return v === groupValue && (!extraFilter || extraFilter(r));
            });
            const suffix = (opts && opts.subtitulo) ? ` — ${opts.subtitulo}` : '';
            _abrirGrupoModalPersonas(
                `${groupValue}${suffix}`,
                _grupoIconMap[colKey] || 'fas fa-users',
                registros,
                opts);
        };
        
        function _pintarCabeceraGrupoModal(titulo, iconClass, placeholder) {
            const title = document.getElementById('colab-grupo-modal-title');
            if (title) title.textContent = titulo;
            const icon = document.getElementById('colab-grupo-modal-icon');
            if (icon) icon.className = iconClass + ' me-2';
            const inp = document.getElementById('colab-grupo-modal-inp');
            if (inp) { inp.value = ''; inp.placeholder = '\u{1F50D} ' + placeholder; }
            const back = document.getElementById('colab-grupo-modal-back');
            if (back) back.classList.toggle('d-none', !_grupoModalVolver);
        }
        
        function _abrirGrupoModalBackdrop() {
            const bd = document.getElementById('colab-grupo-modal-backdrop');
            if (bd) bd.classList.add('open');
        }
        
        window.colabGrupoModalVolver = function() {
            if (typeof _grupoModalVolver === 'function') _grupoModalVolver();
        };
        
        /** Filas de categoría; al tocar una se entra a su gente y queda el volver. */
        function _renderGrupoModalCategorias(categorias) {
            const list = document.getElementById('colab-grupo-modal-list');
            if (!list) return;
            const info = _grupoModalSinDato || {};
            const esc = s => String(s == null ? '' : s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            const filas = categorias.map(([nombre, cuantos]) => `
                <div class="colab-grupo-item" data-cat="${esc(nombre)}">
                    <span class="colab-grupo-item-name">${esc(nombre)}</span>
                    <span class="colab-grupo-cat-count">${cuantos}</span>
                </div>`).join('');
            const sinDato = info.total
                ? `<div class="colab-grupo-item sin-dato" data-cat="">
                    <span class="colab-grupo-item-name">Sin ${esc(info.singular)} registrada</span>
                    <span class="colab-grupo-cat-count">${info.total}</span>
                   </div>`
                : '';
            list.innerHTML = (filas + sinDato) ||
                '<div style="padding:1.5rem;text-align:center;color:#aaa;font-size:.85rem;">Sin resultados</div>';
            list._records = null;
        
            const volver = () => window.colabAbrirCategoriasModal(info.colKey, info.titulo, info.icono, info.singular);
            list.querySelectorAll('[data-cat]').forEach(fila => {
                fila.addEventListener('click', function () {
                    const valor = this.getAttribute('data-cat');
                    if (valor) {
                        window.colabAbrirGrupoModal(info.colKey, valor, { volver });
                        return;
                    }
                    const universo = colabObtenerUniversoDirectorio().included;
                    const sin = universo.filter(r => !(gc(r, info.colKey) || '').toString().trim());
                    _abrirGrupoModalPersonas(`Sin ${info.singular} registrada`,
                        'fas fa-circle-question', sin, { volver });
                });
            });
        }

        function _renderGrupoModalList(records) {
            const list = document.getElementById('colab-grupo-modal-list');
            if (!list) return;
            if (!records.length) {
                list.innerHTML = '<div style="padding:1.5rem;text-align:center;color:#aaa;font-size:.85rem;">Sin resultados</div>';
                return;
            }
            list.innerHTML = records.map((r, i) => {
                const num    = val(gc(r, 'num'))    || '—';
                const nombre = val(gc(r, 'nombre')) || '(Sin nombre)';
                const puesto = val(gc(r, 'puesto')) || '';
                const showAm = _grupoModalOpts && _grupoModalOpts.showAmonest;
                const amCnt  = showAm ? (() => { const raw = gc(r,'amonestaciones'); return raw ? String(raw).split('\n').filter(l=>l.trim()).length : 0; })() : 0;
                const amBadge = (showAm && amCnt > 0) ? `<span class="colab-grupo-item-amonest">${amCnt} amonest.</span>` : '';
                return `<div class="colab-grupo-item" onclick="colabAbrirDesdeGrupoModal(${i})">
                    <span class="colab-grupo-item-num"># ${num}</span>
                    <span class="colab-grupo-item-name">${nombre}</span>
                    <span class="colab-grupo-item-puesto">${puesto}</span>
                    ${amBadge}
                </div>`;
            }).join('');
            list._records = records;
        }

        window.colabGrupoModalFiltrar = function(q) {
            const query = (q || '').toLowerCase().trim();
            if (_grupoModalMode === 'categorias') {
                _renderGrupoModalCategorias(query
                    ? _grupoModalCategorias.filter(([nombre]) => nombre.toLowerCase().includes(query))
                    : _grupoModalCategorias);
                return;
            }
            const filtered = query
                ? _grupoModalRecords.filter(r => {
                    const nombre = (gc(r, 'nombre') || '').toLowerCase();
                    const num    = (gc(r, 'num')    || '').toString().toLowerCase();
                    const puesto = (gc(r, 'puesto') || '').toLowerCase();
                    return nombre.includes(query) || num.includes(query) || puesto.includes(query);
                  })
                : _grupoModalRecords;
            _renderGrupoModalList(filtered);
        };

        window.colabAbrirDesdeGrupoModal = function(idx) {
            const list   = document.getElementById('colab-grupo-modal-list');
            const record = list && list._records ? list._records[idx] : null;
            if (!record) return;
            colabGrupoModalClose();
            renderFicha(record);
        };

        window.colabGrupoModalClose = function(evt) {
            if (evt) {
                const bd = document.getElementById('colab-grupo-modal-backdrop');
                if (evt.target !== bd) return;
            }
            const bd = document.getElementById('colab-grupo-modal-backdrop');
            if (bd) bd.classList.remove('open');
            // Al cerrar no queda camino de vuelta pendiente de la sesión anterior.
            _grupoModalVolver = null;
            const back = document.getElementById('colab-grupo-modal-back');
            if (back) back.classList.add('d-none');
        };
    }   /* -- fin colabRenderDashboard -- */

    /* -- Autocomplete -- */
    /**
     * Cuenta amonestaciones (líneas no vacías) y devuelve el HTML
     * del semáforo disciplinario.
     * Escala:
     *   0       ? Verde   (Sin amonestaciones)
     *   1  2   ? Amarillo (En observación)
     *   3+      ? Rojo     (Situación critica)
     * @param {object} c  fila del colaborador
     * @param {boolean} sm  true = tamaño pequeño (para listas)
     */
    /* -- Semáforo: umbrales globales (localStorage) -- */
    function semGetThresholds() {
        return {
            amarillo: parseInt(localStorage.getItem('colab_sem_amarillo') || '1', 10),
            rojo:     parseInt(localStorage.getItem('colab_sem_rojo')     || '3', 10)
        };
    }
    function semClassify(n) {
        const t = semGetThresholds();
        if (n < t.amarillo) return { cls: 'sem-verde',    label: n === 0 ? 'Sin amonestaciones' : n + ' amonest.' };
        if (n < t.rojo)     return { cls: 'sem-amarillo', label: n + ' amonest.' };
        return                      { cls: 'sem-rojo',    label: n + ' amonest.' };
    }

    function colabSemaforoHtml(c, sm) {
        const raw  = val(gc(c, 'amonestaciones')) || '';
        const n    = raw.split(/\n/).map(l => l.trim()).filter(Boolean).length;
        const { cls, label } = semClassify(n);
        const szCls = sm ? ' sem-sm' : '';
        const icon  = sm ? '' : '<i class="fas fa-shield-alt me-1" style="font-size:.7em;opacity:.75"></i>';
        return `<span class="colab-semaforo ${cls}${szCls}" title="${label}"><span class="sem-dot"></span>${icon}${label}</span>`;
    }

    async function colabAutocompletar(query) {
        const sugBox = document.getElementById('colab-suggestions-list');
        const nameInput = document.getElementById('colab-name-input');
        if (!sugBox) return;

        const q = norm(query);
        if (q.length < 2) {
            sugBox.classList.remove('visible');
            sugBox.innerHTML = '';
            if (nameInput) nameInput.setAttribute('aria-expanded', 'false');
            return;
        }

        const todos = await colabCargarTodos();
        const matches = todos
            .filter(c => {
                const cNombre = norm(gc(c, 'nombre'));
                const cNum    = norm(gc(c, 'num'));
                const cPuesto = norm(gc(c, 'puesto'));
                return cNombre.includes(q) || cNum.includes(q) || cPuesto.includes(q);
            })
            .slice(0, 8);

        if (!matches.length) {
            sugBox.classList.remove('visible');
            if (nameInput) nameInput.setAttribute('aria-expanded', 'false');
            return;
        }

        sugBox.innerHTML = matches.map((c, i) => {
            const cNum    = val(gc(c, 'num'));
            const cNombre = val(gc(c, 'nombre'));
            const cPuesto = val(gc(c, 'puesto'));
            const selQuery = cNum || cNombre || '';
            const safeQ = encodeURIComponent(selQuery);
            return `<div class="colab-sug-item" role="option" tabindex="-1" data-idx="${i}"
                  data-q="${safeQ}"
                  onclick="colabSeleccionarSugerencia(decodeURIComponent(this.getAttribute('data-q')))">
                <span class="colab-sug-num"># ${cNum || '—'}</span>
                <span class="colab-sug-name">${cNombre || '—'}</span>
                <span class="colab-sug-puesto">${cPuesto || ''}</span>
                ${colabSemaforoHtml(c, true)}
            </div>`;
        }).join('');

        /* Posicionar el dropdown con fixed relativo al input de nombre */
        const anchor = nameInput || document.getElementById('colab-num-input');
        if (anchor) {
            const rect = anchor.getBoundingClientRect();
            sugBox.style.top   = (rect.bottom + 6) + 'px';
            sugBox.style.left  = rect.left + 'px';
            sugBox.style.width = rect.width + 'px';
        }

        sugBox.classList.add('visible');
        if (nameInput) nameInput.setAttribute('aria-expanded', 'true');
    }

    window.colabSeleccionarSugerencia = function(query) {
        const numInput  = document.getElementById('colab-num-input');
        const nameInput = document.getElementById('colab-name-input');
        const sugBox    = document.getElementById('colab-suggestions-list');
        // Si es número, ponerlo en el campo de número
        if (/^\d+$/.test(String(query))) {
            if (numInput) numInput.value = query;
            if (nameInput) nameInput.value = '';
        } else {
            if (nameInput) nameInput.value = query;
        }
        if (sugBox) { sugBox.classList.remove('visible'); sugBox.innerHTML = ''; }
        colabBuscar();
    };

    /* -- BUSCAR -- */
    window.colabBuscar = async function() {
        const numInput  = document.getElementById('colab-num-input');
        const nameInput = document.getElementById('colab-name-input');
        const numVal    = (numInput?.value || '').trim();
        const nameVal   = (nameInput?.value || '').trim();

        if (!numVal && !nameVal) {
            colabSetState('inicial');
            return;
        }

        colabSetState('cargando');

        const todos = await colabCargarTodos();
        if (!todos.length && !colabLoaded) {
            const msgEl = document.getElementById('colab-vacio-msg');
            if (msgEl) {
                const errDetail = colabLastError ? ` — ${colabLastError}` : '';
                msgEl.textContent = `Error de conexión${errDetail}. Revisa la consola (F12) para más detalles.`;
            }
            colabSetState('vacio');
            return;
        }

        let result = null;

        if (numVal) {
            // Buscar por número exacto primero, luego parcial
            result = todos.find(c => String(gc(c, 'num') || '').trim() === numVal);
            if (!result) result = todos.find(c => norm(gc(c, 'num')).includes(norm(numVal)));
        }
        if (!result && nameVal) {
            const q = norm(nameVal);
            result = todos.find(c => norm(gc(c, 'nombre')).includes(q));
            // También buscar en puesto si no hay coincidencia de nombre
            if (!result) result = todos.find(c => norm(gc(c, 'puesto')).includes(q));
        }

        if (!result) {
            const msgEl = document.getElementById('colab-vacio-msg');
            if (msgEl) {
                const termino = numVal ? `No. Empleado "${numVal}"` : `"${nameVal}"`;
                msgEl.textContent = `No se encontró ningún colaborador con ${termino}.`;
            }
            colabSetState('vacio');
            return;
        }

        renderFicha(result);
    };

    /* -- LIMPIAR -- */
    window.colabLimpiar = function() {
        const numInput  = document.getElementById('colab-num-input');
        const nameInput = document.getElementById('colab-name-input');
        const sugBox    = document.getElementById('colab-suggestions-list');
        if (numInput) numInput.value = '';
        if (nameInput) nameInput.value = '';
        if (sugBox) { sugBox.classList.remove('visible'); sugBox.innerHTML = ''; }
        // Limpiar alerta hero de cursos
        const heroAlertEl = document.getElementById('colab-cursos-hero-alert');
        if (heroAlertEl) { heroAlertEl.classList.remove('visible'); heroAlertEl.innerHTML = ''; }
        // Ocultar panel de vacaciones
        const vacPanel = document.getElementById('colab-vac-panel');
        if (vacPanel) vacPanel.classList.add('d-none');
        _vacCurrentNumEmpl = null;
        colabSetState('inicial');
        if (colabLoaded) colabRenderDashboard();
    };

    /* -- Reintentar carga del directorio -- */
    window.colabReintentar = function() {
        colabLoaded      = false;
        colabCache       = null;
        colabDirectoryUniverse = null;
        colabLoadPromise = null;
        colabLoadAttempts = 0;
        const loading = document.getElementById('cd-loading');
        if (loading) loading.innerHTML = '<div class="spinner-border spinner-border-sm text-primary" role="status"><span class="visually-hidden">Cargando...</span></div>';
        colabRenderDashboard();
    };

    /* -- Permiso de eliminación: solo Colab Editor -- */
    function colabCanDelete() {
        return colabEsEditor();
    }

    /* -- Abrir modal de confirmación de eliminación -- */
    window.colabEliminarColaborador = function() {
        if (!colabCurrentRow) return;
        if (!colabRequireEdit()) return;
        const c = colabCurrentRow;
        const nombre = val(gc(c, 'nombre')) || '(sin nombre)';
        const numEmpl = val(gc(c, 'num')) || '—';
        const label = document.getElementById('colab-delete-nombre-confirm');
        if (label) label.textContent = `No. ${numEmpl} — ${nombre}`;
        // Cerrar el modal de edición si estuviera abierto
        try {
            bootstrap.Modal.getInstance(document.getElementById('colabEditModal'))?.hide();
        } catch (_) { }
        const modal = new bootstrap.Modal(document.getElementById('colabEliminarModal'));
        modal.show();
    };

    /* -- Ejecutar la eliminación tras confirmar -- */
    window.colabConfirmarEliminar = async function() {
        if (!colabCurrentRow) return;
        if (!colabRequireEdit()) return;
        const c = colabCurrentRow;
        const numEmpl = String(gc(c, 'num') || '').trim();
        const numCol  = colabCols?.num;
        if (!numCol || !numEmpl) { alert('No se puede identificar al colaborador para eliminarlo.'); return; }

        const btnConfirm = document.getElementById('btn-colab-confirmar-eliminar');
        if (btnConfirm) { btnConfirm.disabled = true; btnConfirm.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Eliminando…'; }

        try {
            const sb = window.supabaseClient;
            if (!sb) throw new Error('Supabase no disponible');

            const safeNumCol = /[\s.]/.test(numCol) ? `"${numCol}"` : numCol;
            const { error } = await sb.from('agenda_2026').delete().eq(safeNumCol, numEmpl);
            if (error) throw error;

            // Cerrar modal de confirmación
            bootstrap.Modal.getInstance(document.getElementById('colabEliminarModal'))?.hide();

            // Registrar en historial global (Historia)
            const _nombreElim = val(gc(c, 'nombre')) || '(sin nombre)';
            window.logHistory?.('ELIMINAR', 'Colaboradores', numEmpl, {
                summary: `Colaborador eliminado: No. ${numEmpl} — ${_nombreElim}`,
                old: c
            });

            // Invalidar caché
            colabCache = null; colabDirectoryUniverse = null; colabLoaded = false; colabLoadPromise = null;
            colabCurrentRow = null;

            // Volver a la vista inicial y recargar dashboard
            colabSetState('inicial');
            const todos = await colabCargarTodos();
            if (todos.length) colabRenderDashboard();

        } catch (err) {
            console.error('[Colaboradores] Error al eliminar:', err);
            alert('Error al eliminar: ' + (err?.message || String(err)));
        } finally {
            if (btnConfirm) { btnConfirm.disabled = false; btnConfirm.innerHTML = '<i class="fas fa-trash-alt me-1"></i>Sí, eliminar'; }
        }
    };

    /* -- Eventos del input de nombre y número -- */
    function initColabEvents() {
        const nameInput = document.getElementById('colab-name-input');
        const numInput  = document.getElementById('colab-num-input');
        let numDebounce = null;

        /* Teleportar el dropdown al <body> para que ningún ancestro lo recorte */
        const sugBox = document.getElementById('colab-suggestions-list');
        if (sugBox && sugBox.parentElement !== document.body) {
            document.body.appendChild(sugBox);
        }

        if (nameInput) {
            nameInput.addEventListener('input', () => colabAutocompletar(nameInput.value, nameInput));
            nameInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') { colabBuscar(); }
                if (e.key === 'Escape') {
                    const sb = document.getElementById('colab-suggestions-list');
                    if (sb) sb.classList.remove('visible');
                }
            });
        }
        if (numInput) {
            numInput.addEventListener('input', () => {
                /* Mostrar sugerencias anclándose al input numérico */
                colabAutocompletar(numInput.value, numInput);
                /* Auto-buscar tras 600 ms de inactividad */
                clearTimeout(numDebounce);
                numDebounce = setTimeout(() => {
                    if (numInput.value.trim()) colabBuscar();
                }, 600);
            });
            numInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') colabBuscar();
            });
        }
        // Cerrar sugerencias al hacer click fuera
        document.addEventListener('click', e => {
            if (!e.target.closest('.colab-search-input-wrap')) {
                const sb = document.getElementById('colab-suggestions-list');
                if (sb) sb.classList.remove('visible');
            }
        });
        // Reposicionar dropdown al hacer scroll/resize
        window.addEventListener('scroll', () => {
            const sb = document.getElementById('colab-suggestions-list');
            if (!sb || !sb.classList.contains('visible')) return;
            const bar = document.querySelector('.colab-search-bar');
            const barRect = bar ? bar.getBoundingClientRect() : null;
            const anchor = document.activeElement && document.activeElement.id === 'colab-num-input'
                ? document.getElementById('colab-num-input')
                : document.getElementById('colab-name-input') || document.getElementById('colab-num-input');
            if (anchor) {
                const rect = anchor.getBoundingClientRect();
                sb.style.top  = (rect.bottom + 4) + 'px';
                sb.style.left = (barRect ? barRect.left : rect.left) + 'px';
            }
        }, { passive: true });
    }

    /* -- Hook al entrar a la sección --

       Aquí se envolvía window.showSection para enterarse de las entradas a
       la sección. Era el tercer parche de ese tipo en el proyecto, y todos
       tenían el mismo problema: dependían del orden de carga y de que nadie
       más quisiera hacer lo mismo. Ahora lo dice el loader, llamando a
       initColaboradores() -- que es lo que hay al final de este archivo. */

    /* --------------- EDITOR DE COLABORADORES --------------- */

    let colabCurrentRow = null; // fila en pantalla (raw row)

    /* -- Etiquetas legibles por campo semántico -- */
    const COLAB_FIELD_LABELS = {
        nombre:'Nombre', puesto:'Puesto', fecha_ingreso:'Fecha de Ingreso',
        onomastico:'Fecha Nacimiento', celular:'No. Celular', extension:'Extensión',
        correo:'Correo', profesion:'Profesión', militar:'Militar/Civil',
        nivel:'Nivel', plaza:'Plaza', turno:'Turno', ryr:'RyR',
        grado:'Grado', matricula:'Matrícula', grado_academico:'Grado Académico',
        cedula:'Cédula Profesional', licencia:'Licencia', licencia_tipo:'Tipo Licencia',
        vig_licencia:'Vigencia Licencia', vig_credencial:'Vigencia Credencial',
        vig_ine:'Vigencia INE', domicilio:'Domicilio', rfc:'RFC', curp:'CURP',
        comisionado:'Comisionado', direccion:'Dirección', subdireccion:'Subdireccion',
        gerencia:'Gerencia', coordinacion:'Coordinacion',
        amonestaciones:'Amonestaciones', comentarios:'Comentarios',
        c1_nombre:'Contacto 1 — Nombre', c1_parentesco:'Contacto 1 — Parentesco',
        c1_tel:'Contacto 1 — Tel.', c2_nombre:'Contacto 2 — Nombre',
        c2_parentesco:'Contacto 2 — Parentesco', c2_tel:'Contacto 2 — Tel.',
        sangre:'Tipo de Sangre', alerg_med:'Alergia Medicamento',
        alerg_ali:'Alergia Alimento', nss:'NSS',
        estado_civil:'Estado Civil', dependientes:'Dependientes',
        rubrica:'Rúbrica', doc_ingreso:'Doc. Ingreso',
        foto:'Foto de perfil', foto_ine:'INE frente', foto_ine_rev:'INE reverso',
        foto_cred:'TIA / Credencial AIFA', cv_url:'Currículum Vitae (CV)',
        estatus:'Estatus', sexo:'Sexo',
    };

    /* Mapeo: id-del-input ? clave-semántica */
    const COLAB_EDIT_FIELD_MAP = {
        'ce-nombre':'nombre','ce-puesto':'puesto','ce-fecha-ingreso':'fecha_ingreso',
        'ce-onomastico':'onomastico','ce-celular':'celular','ce-extension':'extension',
        'ce-correo':'correo','ce-correo-personal':'correo_personal','ce-profesion':'profesion','ce-militar':'militar','ce-sexo':'sexo',
        'ce-amonestaciones':'amonestaciones','ce-comentarios':'comentarios',
        'ce-nivel':'nivel','ce-plaza':'plaza','ce-turno':'turno','ce-ryr':'ryr',
        'ce-grado':'grado','ce-matricula':'matricula','ce-grado-academico':'grado_academico',
        'ce-cedula':'cedula','ce-comisionado':'comisionado','ce-direccion':'direccion',
        'ce-subdireccion':'subdireccion','ce-gerencia':'gerencia','ce-coordinacion':'coordinacion',
        'ce-licencia':'licencia','ce-licencia-tipo':'licencia_tipo','ce-vig-licencia':'vig_licencia',
        'ce-vig-credencial':'vig_credencial','ce-vig-ine':'vig_ine','ce-domicilio':'domicilio',
        'ce-rfc':'rfc','ce-curp':'curp','ce-estado-civil':'estado_civil',
        'ce-dependientes':'dependientes','ce-rubrica':'rubrica','ce-doc-ingreso':'doc_ingreso',
        'ce-c1-nombre':'c1_nombre','ce-c1-parentesco':'c1_parentesco','ce-c1-tel':'c1_tel',
        'ce-c2-nombre':'c2_nombre','ce-c2-parentesco':'c2_parentesco','ce-c2-tel':'c2_tel',
        'ce-sangre':'sangre','ce-alerg-med':'alerg_med','ce-alerg-ali':'alerg_ali','ce-nss':'nss',
        'ce-estatus':'estatus','ce-fecha-baja':'fecha_baja','ce-motivo-baja':'motivo_baja',
    };

    const COLAB_DOCUMENT_IMAGE_UI = Object.freeze({
        ine_front: Object.freeze({
            field: 'foto_ine', inputId: 'ce-doc-ine-front', previewId: 'ce-doc-ine-front-preview',
            placeholderId: 'ce-doc-ine-front-placeholder', removeId: 'ce-doc-ine-front-remove',
            statusId: 'ce-doc-ine-front-status', label: 'INE frente'
        }),
        ine_back: Object.freeze({
            field: 'foto_ine_rev', inputId: 'ce-doc-ine-back', previewId: 'ce-doc-ine-back-preview',
            placeholderId: 'ce-doc-ine-back-placeholder', removeId: 'ce-doc-ine-back-remove',
            statusId: 'ce-doc-ine-back-status', label: 'INE reverso'
        }),
        credential: Object.freeze({
            field: 'foto_cred', inputId: 'ce-doc-credential', previewId: 'ce-doc-credential-preview',
            placeholderId: 'ce-doc-credential-placeholder', removeId: 'ce-doc-credential-remove',
            statusId: 'ce-doc-credential-status', label: 'TIA / Credencial AIFA'
        })
    });
    let colabDocumentImageState = {};
    let colabDocumentImageLoadToken = 0;

    function colabDocumentImageConfig(kind) {
        const config = COLAB_DOCUMENT_IMAGE_UI[kind];
        if (!config) throw new Error('Tipo de documento no configurado.');
        return config;
    }

    function colabDocumentImageStatus(kind, message, tone) {
        const config = colabDocumentImageConfig(kind);
        const status = document.getElementById(config.statusId);
        if (!status) return;
        status.className = `cedit-doc-upload-status small mt-1 ${tone ? `text-${tone}` : 'text-muted'}`;
        status.textContent = message || '';
    }

    function colabDocumentImagePreview(kind, src) {
        const config = colabDocumentImageConfig(kind);
        const img = document.getElementById(config.previewId);
        const placeholder = document.getElementById(config.placeholderId);
        if (!img || !placeholder) return;
        if (src) {
            img.onerror = () => {
                img.hidden = true;
                placeholder.hidden = false;
                colabDocumentImageStatus(kind, 'No se pudo visualizar la imagen.', 'danger');
            };
            img.src = src;
            img.hidden = false;
            placeholder.hidden = true;
        } else {
            img.removeAttribute('src');
            img.hidden = true;
            placeholder.hidden = false;
        }
    }

    function colabDocumentImageRevokePreview(state) {
        if (state?.objectUrl && window.URL?.revokeObjectURL) {
            window.URL.revokeObjectURL(state.objectUrl);
        }
    }

    async function colabDocumentImagesInit(c) {
        const token = ++colabDocumentImageLoadToken;
        Object.values(colabDocumentImageState).forEach(colabDocumentImageRevokePreview);
        colabDocumentImageState = {};

        for (const [kind, config] of Object.entries(COLAB_DOCUMENT_IMAGE_UI)) {
            const previousValue = String(gc(c, config.field) || '').trim();
            colabDocumentImageState[kind] = { previousValue, file: null, remove: false, objectUrl: null };
            const input = document.getElementById(config.inputId);
            const removeBtn = document.getElementById(config.removeId);
            if (input) input.value = '';
            if (removeBtn) removeBtn.classList.toggle('d-none', !previousValue);
            colabDocumentImagePreview(kind, null);
            colabDocumentImageStatus(kind, previousValue ? 'Cargando documento actual…' : 'Sin documento cargado.');
            if (!previousValue) continue;
            try {
                if (!window.employeeDocumentUpload) throw new Error('Módulo de documentos no disponible.');
                const src = await window.employeeDocumentUpload.resolve(window.supabaseClient, previousValue, kind);
                if (token !== colabDocumentImageLoadToken) return;
                colabDocumentImagePreview(kind, src);
                colabDocumentImageStatus(kind, 'Documento actual listo.', 'success');
            } catch (error) {
                if (token !== colabDocumentImageLoadToken) return;
                const mapped = window.employeeDocumentUpload?.mapError(error, kind);
                colabDocumentImageStatus(kind, mapped?.userMessage || 'No se pudo cargar el documento actual.', 'danger');
            }
        }
    }

    window.colabDocumentImageSelected = async function(kind, input) {
        const config = colabDocumentImageConfig(kind);
        const file = input?.files?.[0];
        if (!file) return;
        colabDocumentImageStatus(kind, `Validando ${config.label}…`);
        try {
            if (!window.employeeDocumentUpload) throw new Error('Módulo de documentos no disponible.');
            await window.employeeDocumentUpload.validate(file);
            const previousState = colabDocumentImageState[kind] || {};
            colabDocumentImageRevokePreview(previousState);
            const objectUrl = window.URL?.createObjectURL ? window.URL.createObjectURL(file) : null;
            colabDocumentImageState[kind] = {
                previousValue: previousState.previousValue || '',
                file,
                remove: false,
                objectUrl
            };
            if (objectUrl) colabDocumentImagePreview(kind, objectUrl);
            document.getElementById(config.removeId)?.classList.remove('d-none');
            colabDocumentImageStatus(kind, `${file.name} · imagen válida y lista para guardar.`, 'success');
        } catch (error) {
            input.value = '';
            const mapped = window.employeeDocumentUpload?.mapError(error, kind);
            colabDocumentImageStatus(kind, mapped?.userMessage || error?.message || 'Archivo no válido.', 'danger');
        }
    };

    window.colabDocumentImageRemove = function(kind) {
        const config = colabDocumentImageConfig(kind);
        const state = colabDocumentImageState[kind] || { previousValue: '' };
        colabDocumentImageRevokePreview(state);
        colabDocumentImageState[kind] = {
            previousValue: state.previousValue || '',
            file: null,
            remove: true,
            objectUrl: null
        };
        const input = document.getElementById(config.inputId);
        if (input) input.value = '';
        document.getElementById(config.removeId)?.classList.add('d-none');
        colabDocumentImagePreview(kind, null);
        colabDocumentImageStatus(
            kind,
            state.previousValue ? 'El documento se eliminará al guardar cambios.' : 'Sin documento cargado.',
            state.previousValue ? 'warning' : ''
        );
    };

    async function colabPrepareDocumentImageChanges(sb, c, numEmpl, updatePayload, cambios, uploaded, previousToDelete) {
        for (const [kind, config] of Object.entries(COLAB_DOCUMENT_IMAGE_UI)) {
            const state = colabDocumentImageState[kind];
            if (!state || (!state.file && !state.remove)) continue;
            const realCol = colabCols?.[config.field];
            if (!realCol) {
                throw new window.employeeDocumentUpload.EmployeeDocumentUploadError(
                    'DOCUMENT_COLUMN_MISSING',
                    `No se encontró la columna para asociar ${config.label}.`,
                    { documentKind: kind }
                );
            }
            const oldValue = String(c[realCol] || '').trim();
            if (state.file) {
                colabDocumentImageStatus(kind, 'Subiendo imagen al almacenamiento seguro…');
                const result = await window.employeeDocumentUpload.upload({
                    client: sb,
                    file: state.file,
                    employeeNumber: numEmpl,
                    kind
                });
                uploaded.push({ kind, reference: result.storageReference });
                updatePayload[realCol] = result.storageReference;
                cambios.push({ campo: config.field, valor_anterior: oldValue || null, valor_nuevo: result.storageReference });
                if (window.employeeDocumentUpload.isStorageReference(oldValue)) {
                    previousToDelete.push({ kind, reference: oldValue });
                }
                colabDocumentImagePreview(kind, result.previewUrl);
                colabDocumentImageStatus(kind, 'Imagen cargada; guardando asociación…', 'success');
            } else if (state.remove && oldValue) {
                updatePayload[realCol] = null;
                cambios.push({ campo: config.field, valor_anterior: oldValue, valor_nuevo: null });
                if (window.employeeDocumentUpload.isStorageReference(oldValue)) {
                    previousToDelete.push({ kind, reference: oldValue });
                }
            }
        }
    }

    /* -- Verificar si el usuario actual puede editar -- */
    function colabCanEdit() {
        return colabEsEditor();
    }

    function colabGetOnboardingPortalUrl(urlSuffix) {
        if (!urlSuffix) return '';
        const configuredBase = colabGetConfiguredOnboardingBase();
        const baseForUrl = configuredBase || colabGetCurrentPublicOnboardingBase();
        try {
            return new URL(urlSuffix, baseForUrl || window.location.href).href;
        } catch (_) {
            return urlSuffix;
        }
    }

    function colabIsPrivateHost(hostname) {
        const host = String(hostname || '').toLowerCase();
        if (!host || host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
        if (/^10\./.test(host)) return true;
        if (/^192\.168\./.test(host)) return true;
        if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
        if (host.endsWith('.local')) return true;
        return false;
    }

    function colabNormalizeOnboardingBaseUrl(raw) {
        const trimmed = String(raw || '').trim();
        if (!trimmed) return '';
        try {
            const parsed = new URL(trimmed, window.location.href);
            if (/colaborador-registro\.html$/i.test(parsed.pathname)) return parsed.href;
            const normalizedPath = parsed.pathname.replace(/\/+$/, '') + '/colaborador-registro.html';
            parsed.pathname = normalizedPath;
            parsed.search = '';
            parsed.hash = '';
            return parsed.href;
        } catch (_) {
            return '';
        }
    }

    function colabGetConfiguredOnboardingBase() {
        const appConfigured = window.APP_CONFIG && window.APP_CONFIG.ONBOARDING_PUBLIC_BASE_URL;
        const stored = localStorage.getItem('colab_onboarding_public_base_url');
        return colabNormalizeOnboardingBaseUrl(appConfigured || stored || '');
    }

    function colabGetCurrentPublicOnboardingBase() {
        try {
            const current = new URL('colaborador-registro.html', window.location.href);
            if (current.protocol !== 'https:' && current.protocol !== 'http:') return '';
            if (colabIsPrivateHost(current.hostname)) return '';
            return current.href;
        } catch (_) {
            return '';
        }
    }

    function colabRefreshOnboardingBaseUi() {
        const inputEl = document.getElementById('colab-onboarding-public-base');
        const helpEl = document.getElementById('colab-onboarding-base-help');
        if (!inputEl || !helpEl) return;
        const configured = colabGetConfiguredOnboardingBase();
        const fallback = colabGetCurrentPublicOnboardingBase();
        inputEl.value = configured || fallback || '';
        if (configured) {
            helpEl.textContent = 'Se usará esta URL pública guardada para generar el QR.';
            helpEl.style.color = '#2e7d32';
        } else if (fallback) {
            helpEl.textContent = 'Se usará la URL actual porque parece pública.';
            helpEl.style.color = '#60758a';
        } else {
            helpEl.textContent = 'La URL actual no parece pública. Captura aquí la URL que sí abre en el celular.';
            helpEl.style.color = '#c62828';
        }
    }

    window.colabGuardarOnboardingBaseUrl = function() {
        const inputEl = document.getElementById('colab-onboarding-public-base');
        const raw = String(inputEl?.value || '').trim();
        const normalized = colabNormalizeOnboardingBaseUrl(raw);
        if (!normalized) {
            alert('Captura una URL válida, por ejemplo: https://tu-dominio/colaborador-registro.html');
            return;
        }
        localStorage.setItem('colab_onboarding_public_base_url', normalized);
        colabRefreshOnboardingBaseUi();
    };

    function colabSetOnboardingModalState(opts) {
        const panelEl = document.getElementById('colab-onboarding-panel');
        const titleEl = document.getElementById('colab-onboarding-nombre');
        const linkEl = document.getElementById('colab-onboarding-link');
        const qrEl = document.getElementById('colab-onboarding-qr-img');
        const captionEl = document.getElementById('colab-onboarding-qr-caption');
        const statusEl = document.getElementById('colab-onboarding-status');
        if (panelEl) panelEl.classList.remove('d-none');
        colabRefreshOnboardingBaseUi();
        if (titleEl) titleEl.textContent = opts.nombre || '—';
        if (linkEl) linkEl.value = opts.link || '';
        if (qrEl) {
            qrEl.innerHTML = '';
            if (opts.link && window.QRCode) {
                try {
                    new QRCode(qrEl, {
                        text: opts.link,
                        width: 220,
                        height: 220,
                        colorDark: '#0f172a',
                        colorLight: '#ffffff',
                        correctLevel: QRCode.CorrectLevel.M
                    });
                } catch (_) {}
            }
        }
        if (captionEl) captionEl.textContent = opts.caption || '';
        if (statusEl) {
            statusEl.className = opts.statusClass || 'small text-muted mt-3';
            statusEl.textContent = opts.status || '';
        }
    }

    window.colabCerrarOnboardingPanel = function() {
        const panelEl = document.getElementById('colab-onboarding-panel');
        if (panelEl) panelEl.classList.add('d-none');
    };

    window.colabCopiarOnboardingLink = async function() {
        const linkEl = document.getElementById('colab-onboarding-link');
        const statusEl = document.getElementById('colab-onboarding-status');
        const link = String(linkEl?.value || '').trim();
        if (!link) return;
        try {
            await navigator.clipboard.writeText(link);
            if (statusEl) {
                statusEl.className = 'small text-success mt-3';
                statusEl.textContent = 'Enlace copiado al portapapeles.';
            }
        } catch (_) {
            linkEl?.select();
            document.execCommand?.('copy');
            if (statusEl) {
                statusEl.className = 'small text-success mt-3';
                statusEl.textContent = 'Enlace seleccionado. Si no se copió automático, usa Ctrl+C.';
            }
        }
    };

    window.colabAbrirOnboardingLink = function() {
        const link = String(document.getElementById('colab-onboarding-link')?.value || '').trim();
        if (!link) return;
        window.open(link, '_blank', 'noopener');
    };

    /* -- Datos que fija el área al generar el QR; el colaborador los ve bloqueados -- */
    const COLAB_ONBOARDING_FIJOS = [
        { clave: 'nombre',       input: 'cn-nombre',       label: 'Nombre completo', tab: '#cnuevo-gen'  },
        { clave: 'puesto',       input: 'cn-puesto',       label: 'Puesto',          tab: '#cnuevo-gen'  },
        { clave: 'nivel',        input: 'cn-nivel',        label: 'Nivel',           tab: '#cnuevo-clas' },
        { clave: 'plaza',        input: 'cn-plaza',        label: 'Plaza',           tab: '#cnuevo-clas' },
        { clave: 'direccion',    input: 'cn-direccion',    label: 'Dirección',       tab: '#cnuevo-org'  },
        { clave: 'subdireccion', input: 'cn-subdireccion', label: 'Subdirección',    tab: '#cnuevo-org'  },
        { clave: 'gerencia',     input: 'cn-gerencia',     label: 'Gerencia',        tab: '#cnuevo-org'  },
        { clave: 'coordinacion', input: 'cn-coordinacion', label: 'Coordinación',    tab: '#cnuevo-org'  }
    ];

    // El numero de empleado va aparte en el RPC, pero para el alta es
    // un campo mas de los que hay que tener antes de generar el QR.
    const COLAB_ONBOARDING_REQUERIDOS = [
        { clave: 'num_empleado', input: 'cn-num', label: 'No. Empleado', tab: '#cnuevo-gen' }
    ].concat(COLAB_ONBOARDING_FIJOS);

    /* -- Nombre de la pestaña donde vive un campo, leido de la pestaña misma -- */
    function colabSeccionDeTab(tabSelector) {
        const btn = document.querySelector('#colabNuevoTabs [data-bs-target="' + tabSelector + '"]');
        return btn ? btn.textContent.trim() : 'Otros datos';
    }

    function colabPintarFaltantesOnboarding(faltan) {
        const body = document.getElementById('colab-faltantes-body');
        if (!body) return;
        const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

        // Agrupados por pestaña: es justo lo que hace molesto capturarlos,
        // así el área ve de dónde salen y no los busca uno por uno.
        const secciones = [];
        faltan.forEach(function(campo) {
            let grupo = secciones.find(g => g.tab === campo.tab);
            if (!grupo) {
                grupo = { tab: campo.tab, nombre: colabSeccionDeTab(campo.tab), campos: [] };
                secciones.push(grupo);
            }
            grupo.campos.push(campo);
        });

        body.innerHTML = secciones.map(function(grupo) {
            const campos = grupo.campos.map(function(campo) {
                return '<div class="col-12 col-md-6">' +
                    '<label class="form-label fw-semibold small" for="cf-' + esc(campo.input) + '">' +
                        esc(campo.label) + ' <span class="text-danger">*</span>' +
                    '</label>' +
                    '<input type="text" class="form-control form-control-sm" id="cf-' + esc(campo.input) + '" ' +
                        'data-destino="' + esc(campo.input) + '" autocomplete="off">' +
                '</div>';
            }).join('');
            return '<div class="colab-faltantes-grupo">' +
                '<div class="colab-faltantes-seccion">' + esc(grupo.nombre) + '</div>' +
                '<div class="row g-3">' + campos + '</div>' +
            '</div>';
        }).join('');
    }

    function colabAbrirFaltantesOnboarding(faltan) {
        colabPintarFaltantesOnboarding(faltan);
        const errEl = document.getElementById('colab-faltantes-error');
        if (errEl) errEl.style.display = 'none';

        const el = document.getElementById('colabOnboardingFaltantesModal');
        if (!el || typeof bootstrap === 'undefined') return;
        el.addEventListener('shown.bs.modal', function() {
            el.querySelector('input[data-destino]')?.focus();
        }, { once: true });
        el.addEventListener('hidden.bs.modal', function() {
            // Bootstrap quita modal-open al cerrar el de arriba y deja
            // el alta, que sigue abierta, sin poder hacer scroll.
            if (document.getElementById('colabNuevoModal')?.classList.contains('show')) {
                document.body.classList.add('modal-open');
            }
        }, { once: true });
        bootstrap.Modal.getOrCreateInstance(el).show();
    }

    window.colabConfirmarFaltantesOnboarding = async function() {
        const body = document.getElementById('colab-faltantes-body');
        const errEl = document.getElementById('colab-faltantes-error');
        const inputs = body ? Array.from(body.querySelectorAll('input[data-destino]')) : [];

        const vacios = inputs.filter(i => !i.value.trim());
        inputs.forEach(i => i.classList.toggle('is-invalid', !i.value.trim()));
        if (vacios.length) {
            if (errEl) {
                errEl.textContent = 'Todos son obligatorios para generar el QR.';
                errEl.style.display = '';
            }
            vacios[0].focus();
            return;
        }
        if (errEl) errEl.style.display = 'none';

        // Se copian al alta para que "Registrar Colaborador" los guarde igual.
        inputs.forEach(function(i) {
            const destino = document.getElementById(i.dataset.destino);
            if (destino) destino.value = i.value.trim();
        });

        const el = document.getElementById('colabOnboardingFaltantesModal');
        if (el && typeof bootstrap !== 'undefined') bootstrap.Modal.getInstance(el)?.hide();
        await window.colabGenerarNuevoOnboardingQr();
    };

    async function colabGenerarOnboardingQrDesdeDatos(datosBase) {
        let sb = window.supabaseClient;
        if (!sb && typeof window.ensureSupabaseClient === 'function') sb = await window.ensureSupabaseClient();
        if (!sb) {
            alert('No se pudo inicializar Supabase para generar el QR.');
            return;
        }

        const numEmpl = String(datosBase?.numEmpl || '').trim();
        const fijos = datosBase?.fijos || {};
        const nombre = String(fijos.nombre || '').trim() || 'Colaborador';
        if (!numEmpl) {
            alert('El colaborador no tiene número de empleado identificable.');
            return;
        }

        colabSetOnboardingModalState({
            nombre: `${nombre} (${numEmpl})`,
            link: '',
            caption: 'Generando acceso...',
            status: 'Creando token seguro de onboarding...',
            statusClass: 'small text-muted mt-3'
        });

        try {
            // Van todos porque el registro puede no existir todavía en agenda_2026:
            // el portal los lee de aquí para mostrárselos bloqueados.
            const metadata = fijos;
            const { data, error } = await sb.rpc('create_colab_onboarding_link', {
                p_num_empleado: numEmpl,
                p_days_valid: 30,
                p_metadata: metadata
            });
            if (error) throw error;
            if (!data?.url_suffix) throw new Error('No se recibió url_suffix del backend.');

            const fullUrl = colabGetOnboardingPortalUrl(data.url_suffix);
            if (!fullUrl) throw new Error('Define una URL pública del portal para que el celular pueda abrir el onboarding.');
            colabSetOnboardingModalState({
                nombre: `${nombre} (${numEmpl})`,
                link: fullUrl,
                caption: 'Escanea este QR o comparte el enlace al colaborador.',
                status: `Token creado. Expira: ${data.expires_at ? new Date(data.expires_at).toLocaleString('es-MX') : 'sin fecha'}`,
                statusClass: 'small text-success mt-3'
            });
        } catch (err) {
            colabSetOnboardingModalState({
                nombre: `${nombre} (${numEmpl})`,
                link: '',
                caption: 'No se pudo generar el QR.',
                status: 'Error al generar onboarding: ' + (err?.message || err),
                statusClass: 'small text-danger mt-3'
            });
        }
    }

    window.colabGenerarNuevoOnboardingQr = async function() {
        if (!colabRequireEdit()) return;

        const fijos = {};
        const faltan = [];
        COLAB_ONBOARDING_REQUERIDOS.forEach(function(campo) {
            const valor = (document.getElementById(campo.input)?.value || '').trim();
            if (!valor) { faltan.push(campo); return; }
            if (campo.clave !== 'num_empleado') fijos[campo.clave] = valor;
        });

        if (faltan.length) {
            // No se pueden dejar para después: el portal los muestra bloqueados
            // y el colaborador no tiene forma de capturarlos. Se piden en un
            // modal porque están repartidos en tres pestañas distintas del alta.
            colabAbrirFaltantesOnboarding(faltan);
            return;
        }

        await colabGenerarOnboardingQrDesdeDatos({
            numEmpl: (document.getElementById('cn-num')?.value || '').trim(),
            fijos
        });
    };

    /* -- Preview CV inline (ficha) -- */
    window.colabToggleCvPreview = function(url) {
        const wrap   = document.getElementById('colab-cv-inline-preview');
        const iframe = document.getElementById('colab-cv-iframe-ficha');
        if (!wrap || !iframe) return;
        const isHidden = wrap.classList.contains('d-none');
        if (isHidden) {
            iframe.src = url || '';
            wrap.classList.remove('d-none');
            wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            wrap.classList.add('d-none');
            iframe.src = '';
        }
    };

    /* -- Preview CV inline (modal editor) -- */
    window.colabToggleEditCvPreview = function(url) {
        const wrap   = document.getElementById('cedit-cv-preview-wrap');
        const iframe = document.getElementById('cedit-cv-iframe');
        if (!wrap || !iframe) return;
        const isHidden = wrap.classList.contains('d-none');
        if (isHidden) {
            if (url) iframe.src = url;
            wrap.classList.remove('d-none');
        } else {
            wrap.classList.add('d-none');
            if (url) iframe.src = '';   // liberar
        }
    };

    /* -- Historial: cargar y renderizar -- */
    async function colabCargarHistorial(numEmpleado) {
        const panel = document.getElementById('colab-historial-panel');
        const list  = document.getElementById('colab-historial-list');
        if (!panel || !list) return;
        if (!numEmpleado) { panel.classList.add('d-none'); return; }
        try {
            const sb = window.supabaseClient;
            if (!sb) return;
            const { data, error } = await sb
                .from('colab_historial')
                .select('*')
                .eq('num_empleado', String(numEmpleado))
                .order('fecha', { ascending: false })
                .limit(100);
            if (error) throw error;
            panel.classList.remove('d-none');
            if (!data || !data.length) {
                list.innerHTML = '<div class="colab-historial-empty"><i class="fas fa-history me-1"></i>Sin cambios registrados aún.</div>';
                return;
            }
            list.innerHTML = `<div class="colab-hist-timeline">${data.map(h => {
                const fecha = new Date(h.fecha).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
                const label = COLAB_FIELD_LABELS[h.campo] || h.campo;
                return `<div class="colab-hist-item">
                    <div><span class="colab-hist-campo">${label}:</span>
                    <span class="colab-hist-valores">
                        <span class="colab-hist-ant">${h.valor_anterior || '(vacío)'}</span>
                        <i class="fas fa-arrow-right" style="font-size:.65rem;color:#9e9e9e"></i>
                        <span class="colab-hist-nvo">${h.valor_nuevo || '(vacío)'}</span>
                    </span></div>
                    <div class="colab-hist-meta"><i class="fas fa-user-edit me-1"></i>${h.usuario_nombre || 'Sistema'} &nbsp;·&nbsp; ${fecha}</div>
                </div>`;
            }).join('')}</div>`;
        } catch (err) {
            console.warn('[Colaboradores] Error historial:', err);
            panel.classList.remove('d-none');
            list.innerHTML = '<div class="colab-historial-empty text-danger">Error al cargar historial.</div>';
        }
    }

    /* -- Historial de Plaza: cargar y renderizar -- */
    async function colabCargarHistorialPlaza(numEmpleado) {
        const panel = document.getElementById('colab-historial-plaza-panel');
        const list  = document.getElementById('colab-historial-plaza-list');
        if (!panel || !list) return;
        if (!numEmpleado) { panel.classList.add('d-none'); return; }
        try {
            const sb = window.supabaseClient;
            if (!sb) return;
            const { data, error } = await sb
                .from('colab_historial')
                .select('*')
                .eq('num_empleado', String(numEmpleado))
                .eq('campo', 'plaza')
                .order('fecha', { ascending: false })
                .limit(50);
            if (error) throw error;
            panel.classList.remove('d-none');
            if (!data || !data.length) {
                list.innerHTML = '<div class="colab-historial-empty"><i class="fas fa-id-badge me-1"></i>Sin cambios de plaza registrados aún.</div>';
                return;
            }
            list.innerHTML = `<div class="colab-hist-timeline">${data.map(h => {
                const fecha = new Date(h.fecha).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
                return `<div class="colab-hist-item">
                    <div><span class="colab-hist-campo">Plaza:</span>
                    <span class="colab-hist-valores">
                        <span class="colab-hist-ant">${h.valor_anterior || '(vacío)'}</span>
                        <i class="fas fa-arrow-right" style="font-size:.65rem;color:#9e9e9e"></i>
                        <span class="colab-hist-nvo">${h.valor_nuevo || '(vacío)'}</span>
                    </span></div>
                    <div class="colab-hist-meta"><i class="fas fa-user-edit me-1"></i>${h.usuario_nombre || 'Sistema'} &nbsp;·&nbsp; ${fecha}</div>
                </div>`;
            }).join('')}</div>`;
        } catch (err) {
            console.warn('[Colaboradores] Error historial plaza:', err);
            panel.classList.remove('d-none');
            list.innerHTML = '<div class="colab-historial-empty text-danger">Error al cargar historial de plaza.</div>';
        }
    }

    /* -- Historial completo del módulo Colaboradores -- */
    let colabAuditRaw = [];

    function colabHistEsc(s) {
        return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    function colabHistText(s) {
        return String(s ?? '').trim();
    }

    function colabHistPrettyField(field) {
        const key = colabHistText(field);
        return COLAB_FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Campo';
    }

    function colabHistFormatValue(v) {
        if (v === null || v === undefined || v === '') return '(vacío)';
        if (typeof v === 'object') {
            try { return JSON.stringify(v); } catch (_) { return String(v); }
        }
        return String(v);
    }

    function colabHistNormalizeAction(rawAction, details, changes) {
        const action = norm(rawAction);
        const statusChange = (changes || []).find(c => norm(c.field || c.campo) === 'estatus');
        if (statusChange) {
            const oldStatus = norm(statusChange.old ?? statusChange.anterior);
            const newStatus = norm(statusChange.new ?? statusChange.nuevo);
            if (newStatus === 'baja' && oldStatus !== 'baja') return 'Dar de baja';
            if (newStatus === 'activo' && oldStatus === 'baja') return 'Reactivar';
        }
        if ((changes || []).some(c => norm(c.field || c.campo) === 'plaza')) return 'Cambiar plaza';
        if (action.includes('crear') || action.includes('agregar') || action.includes('insert')) return 'Crear';
        if (action.includes('eliminar') || action.includes('borrar') || action.includes('delete')) return 'Eliminar';
        if (action.includes('curso') && action.includes('asign')) return 'Asignar curso';
        if (action.includes('curso')) return 'Modificar curso';
        if (action.includes('foto')) return 'Cambiar fotografía';
        if (action.includes('document')) return 'Agregar documento';
        if (action.includes('amonest')) return 'Agregar amonestación';
        if (action.includes('vacacion')) return 'Modificar vacaciones';
        if (action.includes('coment')) return 'Agregar comentario';
        return 'Editar';
    }

    function colabHistActionClass(action) {
        const a = norm(action);
        if (a.includes('crear')) return 'colab-audit-crear';
        if (a.includes('baja') || a.includes('eliminar')) return a.includes('eliminar') ? 'colab-audit-eliminar' : 'colab-audit-baja';
        if (a.includes('reactivar')) return 'colab-audit-reactivar';
        if (a.includes('plaza')) return 'colab-audit-plaza';
        if (a.includes('editar') || a.includes('modificar') || a.includes('cambiar') || a.includes('curso') || a.includes('document') || a.includes('amonest') || a.includes('vacacion') || a.includes('coment')) return 'colab-audit-editar';
        return 'colab-audit-otro';
    }

    function colabHistIcon(action) {
        const a = norm(action);
        if (a.includes('crear')) return 'fa-plus-circle';
        if (a.includes('eliminar')) return 'fa-trash-alt';
        if (a.includes('baja')) return 'fa-user-slash';
        if (a.includes('reactivar')) return 'fa-user-check';
        if (a.includes('plaza')) return 'fa-id-badge';
        if (a.includes('curso')) return 'fa-graduation-cap';
        if (a.includes('document')) return 'fa-file-alt';
        if (a.includes('amonest')) return 'fa-exclamation-triangle';
        if (a.includes('vacacion')) return 'fa-umbrella-beach';
        if (a.includes('coment')) return 'fa-comment';
        if (a.includes('foto')) return 'fa-camera';
        return 'fa-pencil-alt';
    }

    function colabHistExtractChanges(details) {
        const d = details || {};
        const raw = Array.isArray(d.changes) ? d.changes : [];
        return raw.map(c => ({
            field: c.field ?? c.campo ?? c.nombre_campo ?? '',
            old: c.old ?? c.anterior ?? c.valor_anterior ?? '',
            new: c.new ?? c.nuevo ?? c.valor_nuevo ?? ''
        })).filter(c => c.field || c.old || c.new);
    }

    function colabHistDataFromObject(obj, semanticKey) {
        if (!obj || typeof obj !== 'object') return '';
        const real = colabCols?.[semanticKey];
        return obj[real] ?? obj[semanticKey] ?? obj[semanticKey === 'num' ? 'No. Empleado' : ''] ?? '';
    }

    function colabHistBuildDetailHtml(item) {
        const changes = item.changes || [];
        let html = `<div class="fw-semibold text-dark mb-1">${colabHistEsc(item.summary || item.action)}</div>`;
        if (changes.length) {
            html += '<div class="colab-audit-detail">';
            changes.forEach(c => {
                html += `<div class="colab-audit-change">
                    <span class="colab-audit-field">${colabHistEsc(colabHistPrettyField(c.field))}</span>
                    <span class="colab-audit-old">${colabHistEsc(colabHistFormatValue(c.old))}</span>
                    <i class="fas fa-arrow-right text-muted" style="font-size:.7rem"></i>
                    <span class="colab-audit-new">${colabHistEsc(colabHistFormatValue(c.new))}</span>
                </div>`;
            });
            html += '</div>';
        }
        if (item.plazaChange) {
            html += `<div class="small text-primary fw-semibold mt-1"><i class="fas fa-id-badge me-1"></i>${colabHistEsc(item.plazaChange)}</div>`;
        }
        return html;
    }

    function colabHistGetFilters() {
        return {
            nombre: norm(document.getElementById('colab-hist-f-nombre')?.value || ''),
            num: norm(document.getElementById('colab-hist-f-num')?.value || ''),
            plaza: norm(document.getElementById('colab-hist-f-plaza')?.value || ''),
            usuario: norm(document.getElementById('colab-hist-f-usuario')?.value || ''),
            accion: norm(document.getElementById('colab-hist-f-accion')?.value || ''),
            estatus: norm(document.getElementById('colab-hist-f-estatus')?.value || ''),
            desde: document.getElementById('colab-hist-f-desde')?.value || '',
            hasta: document.getElementById('colab-hist-f-hasta')?.value || '',
        };
    }

    function colabHistApplyFilters(items) {
        const f = colabHistGetFilters();
        const desde = f.desde ? new Date(f.desde + 'T00:00:00') : null;
        const hasta = f.hasta ? new Date(f.hasta + 'T23:59:59') : null;
        return items.filter(item => {
            const fecha = new Date(item.date);
            if (desde && fecha < desde) return false;
            if (hasta && fecha > hasta) return false;
            if (f.nombre && !norm(item.nombre).includes(f.nombre)) return false;
            if (f.num && !norm(item.numEmpleado).includes(f.num)) return false;
            if (f.plaza && !norm(item.plaza).includes(f.plaza)) return false;
            if (f.usuario && !norm(item.usuario).includes(f.usuario)) return false;
            if (f.accion && !norm(item.action).includes(f.accion)) return false;
            if (f.estatus) {
                const statusChange = (item.changes || []).find(c => norm(c.field) === 'estatus');
                const est = norm(statusChange?.new || item.estatus || '');
                if (est !== f.estatus) return false;
            }
            return true;
        });
    }

    function colabHistRender(items) {
        const body = document.getElementById('colab-historial-cambios-body');
        const totalEl = document.getElementById('colab-hist-total');
        if (!body) return;
        const filtered = colabHistApplyFilters(items).sort((a,b) => new Date(b.date) - new Date(a.date));
        if (totalEl) totalEl.textContent = `${filtered.length} movimiento(s) mostrados de ${items.length} cargados.`;
        if (!filtered.length) {
            body.innerHTML = '<tr><td colspan="7" class="colab-audit-empty"><i class="fas fa-history fa-2x mb-2 d-block"></i>Sin movimientos que coincidan con los filtros.</td></tr>';
            return;
        }
        body.innerHTML = filtered.map(item => {
            const d = new Date(item.date);
            const fecha = isNaN(d) ? '—' : d.toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' });
            const hora = isNaN(d) ? '—' : d.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
            const actionClass = colabHistActionClass(item.action);
            const icon = colabHistIcon(item.action);
            const rol = item.rol || '—';
            return `<tr>
                <td class="text-nowrap"><strong>${colabHistEsc(fecha)}</strong><br><span class="text-muted">${colabHistEsc(hora)}</span></td>
                <td><strong>${colabHistEsc(item.usuario || 'Sistema')}</strong><br><span class="text-muted">${colabHistEsc(rol)}</span></td>
                <td><span class="colab-audit-action ${actionClass}"><i class="fas ${icon}"></i>${colabHistEsc(item.action)}</span></td>
                <td><strong>${colabHistEsc(item.nombre || '—')}</strong></td>
                <td><span class="font-monospace">${colabHistEsc(item.numEmpleado || '—')}</span></td>
                <td>${colabHistEsc(item.plaza || '—')}</td>
                <td>${colabHistBuildDetailHtml(item)}</td>
            </tr>`;
        }).join('');
    }

    async function colabHistLoadRoleMap(sb, userIds) {
        const map = {};
        const ids = [...new Set((userIds || []).filter(Boolean))];
        if (!ids.length) return map;
        try {
            const { data, error } = await sb.from('user_roles').select('user_id, role').in('user_id', ids);
            if (!error && Array.isArray(data)) data.forEach(r => { map[r.user_id] = r.role; });
        } catch (_) { }
        return map;
    }

    window.colabHistorialCargar = async function() {
        if (!colabRequireHistorial()) return;
        const body = document.getElementById('colab-historial-cambios-body');
        if (body) body.innerHTML = '<tr><td colspan="7" class="colab-audit-empty"><span class="spinner-border spinner-border-sm me-2"></span>Cargando historial de colaboradores...</td></tr>';
        try {
            const sb = window.supabaseClient || await window.ensureSupabaseClient?.();
            if (!sb) throw new Error('Supabase no disponible');
            const colaboradores = await colabCargarTodos();
            const byNum = new Map();
            colaboradores.forEach(r => {
                const num = colabHistText(gc(r, 'num'));
                if (num) byNum.set(num, r);
            });

            const [histRes, globalRes] = await Promise.all([
                sb.from('colab_historial').select('*').order('fecha', { ascending: false }).limit(1500),
                sb.from('change_history').select('*').eq('entity_type', 'Colaboradores').order('created_at', { ascending: false }).limit(1000)
            ]);
            if (histRes.error) throw histRes.error;
            if (globalRes.error) throw globalRes.error;

            const userIds = [
                ...(histRes.data || []).map(r => r.usuario_id),
                ...(globalRes.data || []).map(r => r.user_id)
            ];
            const roleMap = await colabHistLoadRoleMap(sb, userIds);

            const specificItems = (histRes.data || []).map(h => {
                const num = colabHistText(h.num_empleado);
                const c = byNum.get(num);
                const changes = [{ field: h.campo, old: h.valor_anterior, new: h.valor_nuevo }];
                const action = colabHistNormalizeAction('EDITAR', null, changes);
                const plaza = norm(h.campo) === 'plaza' ? (h.valor_nuevo || h.valor_anterior || '') : colabHistText(gc(c || {}, 'plaza'));
                const oldPuesto = colabHistText(gc(c || {}, 'puesto'));
                const plazaChange = norm(h.campo) === 'plaza'
                    ? `La plaza cambió de ${colabHistFormatValue(h.valor_anterior)} a ${colabHistFormatValue(h.valor_nuevo)}${oldPuesto ? ' · Puesto actual: ' + oldPuesto : ''}.`
                    : '';
                return {
                    source: 'colab_historial',
                    date: h.fecha,
                    usuario: h.usuario_nombre || 'Sistema',
                    rol: roleMap[h.usuario_id] || '—',
                    action,
                    nombre: colabHistText(gc(c || {}, 'nombre')),
                    numEmpleado: num,
                    plaza,
                    estatus: colabHistText(gc(c || {}, 'estatus')),
                    summary: action === 'Cambiar plaza'
                        ? `Cambio de plaza del colaborador No. ${num}`
                        : `Actualización de ${colabHistPrettyField(h.campo)} del colaborador No. ${num}`,
                    changes,
                    plazaChange
                };
            });

            const globalItems = (globalRes.data || []).map(g => {
                const details = g.details || {};
                const changes = colabHistExtractChanges(details);
                const oldObj = details.old || {};
                const newObj = details.new || {};
                const num = colabHistText(g.record_id || colabHistDataFromObject(newObj, 'num') || colabHistDataFromObject(oldObj, 'num'));
                const c = byNum.get(num);
                const nombre = colabHistText(colabHistDataFromObject(newObj, 'nombre') || colabHistDataFromObject(oldObj, 'nombre') || gc(c || {}, 'nombre'));
                const plaza = colabHistText(colabHistDataFromObject(newObj, 'plaza') || colabHistDataFromObject(oldObj, 'plaza') || gc(c || {}, 'plaza'));
                const action = colabHistNormalizeAction(g.action_type, details, changes);
                return {
                    source: 'change_history',
                    date: g.created_at,
                    usuario: (g.user_email || '').split('@')[0] || 'Sistema',
                    rol: roleMap[g.user_id] || '—',
                    action,
                    nombre,
                    numEmpleado: num,
                    plaza,
                    estatus: colabHistText(gc(c || {}, 'estatus')),
                    summary: details.summary || `${action} en colaboradores`,
                    changes,
                    plazaChange: ''
                };
            });

            const seen = new Set();
            colabAuditRaw = [...specificItems, ...globalItems].filter(item => {
                const key = [item.source, item.date, item.numEmpleado, item.action, item.summary].join('|');
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
            colabHistRender(colabAuditRaw);
        } catch (err) {
            console.error('[Colaboradores] Error historial completo:', err);
            if (body) body.innerHTML = `<tr><td colspan="7" class="colab-audit-empty text-danger"><i class="fas fa-triangle-exclamation me-1"></i>Error al cargar historial: ${colabHistEsc(err?.message || err)}</td></tr>`;
        }
    };

    window.colabHistorialLimpiarFiltros = function() {
        ['colab-hist-f-nombre','colab-hist-f-num','colab-hist-f-plaza','colab-hist-f-usuario','colab-hist-f-accion','colab-hist-f-estatus','colab-hist-f-desde','colab-hist-f-hasta'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        colabHistRender(colabAuditRaw);
    };

    window.colabAbrirHistorialCambios = async function() {
        if (!colabRequireHistorial()) return;
        const modalEl = document.getElementById('colabHistorialCambiosModal');
        if (!modalEl) return;
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
        await colabHistorialCargar();
    };

    ['colab-hist-f-nombre','colab-hist-f-num','colab-hist-f-plaza','colab-hist-f-usuario','colab-hist-f-accion','colab-hist-f-estatus','colab-hist-f-desde','colab-hist-f-hasta'].forEach(id => {
        document.addEventListener('input', e => {
            if (e.target && e.target.id === id) colabHistRender(colabAuditRaw);
        });
        document.addEventListener('change', e => {
            if (e.target && e.target.id === id) colabHistRender(colabAuditRaw);
        });
    });

    /* -- Abrir modal editor -- */
    window.colabAbrirEditor = function() {
        if (!colabCurrentRow) return;
        if (!colabRequireEdit()) return;
        const c = colabCurrentRow;
        // Asegurarse de que el número de empleado está disponible para la pestaña de vacaciones
        _vacCurrentNumEmpl = val(gc(c, 'num')) || _vacCurrentNumEmpl;

        // Encabezado del modal
        const label = document.getElementById('colab-edit-num-label');
        if (label) label.textContent = `No. ${val(gc(c,'num')) || '—'} — ${val(gc(c,'nombre')) || '—'}`;

        // Foto actual
        const fi  = document.getElementById('cedit-foto-img');
        const ico = document.getElementById('cedit-foto-ico');
        if (fi && ico) {
            const numEmpl = val(gc(c, 'num'));
            if (numEmpl) {
                fi.src = EMPLOYEE_PHOTOS_BASE + numEmpl + '.' + EMPLOYEE_PHOTO_EXTS[0];
                fi.style.display = 'block'; ico.style.display = 'none';
                fi.onerror = () => { fi.style.display = 'none'; ico.style.display = ''; };
            } else {
                fi.style.display = 'none'; ico.style.display = '';
            }
        }
        const statusEl = document.getElementById('cedit-foto-status');
        if (statusEl) statusEl.innerHTML = '';

        colabDocumentImagesInit(c).catch(error => {
            console.error('[Colaboradores][Documento] Error inicializando editor', {
                code: error?.code || 'INIT_FAILED'
            });
        });

        // Listener del input de archivo
        const fileInput = document.getElementById('ce-foto-file');
        if (fileInput) {
            fileInput.value = '';
            fileInput.onchange = async function() {
                const file = this.files[0];
                if (!file) return;
                try {
                    if (!window.employeePhotoUpload) throw new Error('Validador de fotografías no disponible.');
                    await window.employeePhotoUpload.validate(file);
                    const reader = new FileReader();
                    reader.onload = e => {
                        if (fi) { fi.src = e.target.result; fi.style.display = 'block'; }
                        if (ico) ico.style.display = 'none';
                        if (statusEl) statusEl.innerHTML = '<small class="text-success"><i class="fas fa-check me-1"></i>Imagen válida y lista para guardar</small>';
                    };
                    reader.onerror = () => {
                        if (statusEl) statusEl.innerHTML = '<small class="text-danger"><i class="fas fa-times me-1"></i>No se pudo leer la imagen seleccionada.</small>';
                    };
                    reader.readAsDataURL(file);
                } catch (error) {
                    const mapped = window.employeePhotoUpload?.storageError(error);
                    this.value = '';
                    if (statusEl) statusEl.innerHTML = `<small class="text-danger"><i class="fas fa-times me-1"></i>${mapped?.userMessage || error.message}</small>`;
                }
            };
        }

        /* Si la columna de baja no está creada en la base, capturar aquí no
           guardaría nada: mejor decirlo que perder el dato en silencio. */
        (() => {
            const hayColumna = Boolean(colabCols && colabCols.fecha_baja);
            const aviso = document.getElementById('cedit-baja-sin-columna');
            if (aviso) aviso.classList.toggle('d-none', hayColumna);
            ['ce-fecha-baja', 'ce-motivo-baja'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.disabled = !hayColumna;
            });
        })();

        // Rellenar todos los campos del formulario
        Object.entries(COLAB_EDIT_FIELD_MAP).forEach(([formId, colKey]) => {
            const el = document.getElementById(formId);
            if (!el) return;
            el.value = colKey === 'estatus'
                ? colabNormalizarEstatus(gc(c, colKey))
                : colKey === 'onomastico'
                    ? colabFormatBirthDateDisplay(gc(c, colKey))
                    // Un <input type="date"> solo acepta AAAA-MM-DD: una fecha
                    // guardada como 15/03/2026 dejaba el campo en blanco.
                    : colKey === 'fecha_baja'
                        ? colabFechaISO(gc(c, colKey))
                        : String(gc(c, colKey) ?? '').trim();
        });

        const selEstatus = document.getElementById('ce-estatus');
        if (selEstatus && !selEstatus.dataset.colorWired) {
            selEstatus.dataset.colorWired = '1';
            selEstatus.addEventListener('change', colabPintarEstatus);
        }
        colabPintarEstatus();

        // El sexo guardado puede venir con una variante ("M", "Hombre"...) que no
        // está en el catálogo; se conserva como opción para no borrarla al guardar.
        (() => {
            const sexEl = document.getElementById('ce-sexo');
            const sexVal = String(gc(c, 'sexo') ?? '').trim();
            if (!sexEl) return;
            [...sexEl.querySelectorAll('option[data-sexo-extra]')].forEach(o => o.remove());
            if (sexVal && sexEl.value !== sexVal) {
                const opt = document.createElement('option');
                opt.value = opt.textContent = sexVal;
                opt.dataset.sexoExtra = '1';
                sexEl.appendChild(opt);
                sexEl.value = sexVal;
            }
        })();

        // Resetear al primer tab
        const firstTab = document.getElementById('cedit-tab-gen');
        if (firstTab && typeof bootstrap !== 'undefined') {
            bootstrap.Tab.getOrCreateInstance(firstTab).show();
        }

        // CV actual en el modal
        const cvCurrent     = document.getElementById('cedit-cv-current');
        const cvFile        = document.getElementById('ce-cv-file');
        const cvFname       = document.getElementById('cedit-cv-filename');
        const cvStatus      = document.getElementById('cedit-cv-status');
        const cvIframe      = document.getElementById('cedit-cv-iframe');
        const cvPreviewWrap = document.getElementById('cedit-cv-preview-wrap');
        // Resetear preview al abrir
        if (cvPreviewWrap) cvPreviewWrap.classList.add('d-none');
        if (cvIframe) cvIframe.src = '';
        const existingCv = val(gc(c, 'cv_url'));
        if (cvCurrent) {
            if (existingCv) {
                cvCurrent.innerHTML = `<div class="d-flex align-items-center justify-content-center gap-2 flex-wrap">
                    <span class="badge bg-success-subtle text-success border border-success-subtle fw-normal"><i class="fas fa-check-circle me-1"></i>CV cargado</span>
                    <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2" onclick="colabToggleEditCvPreview('${existingCv}')">
                        <i class="fas fa-eye me-1"></i>Vista previa
                    </button>
                </div>`;
            } else {
                cvCurrent.innerHTML = `<p class="text-muted small mb-0"><i class="fas fa-info-circle me-1"></i>No hay CV cargado aún.</p>`;
            }
        }
        if (cvFile)   { cvFile.value = ''; }
        if (cvFname)  { cvFname.textContent = ''; }
        if (cvStatus) { cvStatus.innerHTML = ''; }
        if (cvFile) {
            cvFile.onchange = function() {
                const f = this.files[0];
                if (cvFname) cvFname.textContent = f ? `Archivo: ${f.name} (${(f.size/1024/1024).toFixed(2)} MB)` : '';
                if (f && cvIframe && cvPreviewWrap) {
                    // Previsualizar PDF seleccionado localmente
                    const blobUrl = URL.createObjectURL(f);
                    cvIframe.src  = blobUrl;
                    cvPreviewWrap.classList.remove('d-none');
                }
            };
        }

        const saveLabel = document.getElementById('colab-edit-last-save');
        if (saveLabel) saveLabel.textContent = '';

        // Poblar preview de PDFs en tab Amonestaciones
        colabEditorAmonestPreview();
        colabEditorComentariosPreview();

        const modal = new bootstrap.Modal(document.getElementById('colabEditModal'));
        modal.show();
    };

    /* -- Preview PDFs en el tab Amonestaciones del editor -- */
    window.colabSemaforoEditorRefresh = function() {
        const ta = document.getElementById('ce-amonestaciones');
        const n  = ta ? String(ta.value || '').split(/\n/).map(l => l.trim()).filter(Boolean).length : 0;
        const { cls, label } = semClassify(n);
        const html = `<span class="colab-semaforo ${cls}"><span class="sem-dot"></span><i class="fas fa-shield-alt me-1" style="font-size:.7em;opacity:.75"></i>${label}</span>`;
        const badge = document.getElementById('cedit-sem-badge-live');
        if (badge) badge.innerHTML = html;
        const cnt = document.getElementById('cedit-sem-count');
        if (cnt) cnt.textContent = n;
        const mini = document.getElementById('cedit-amonest-sem-live');
        if (mini) mini.innerHTML = `<span class="colab-semaforo ${cls} sem-sm"><span class="sem-dot"></span>${label}</span>`;
        // Actualizar inputs de configuración con los valores actuales
        const t = semGetThresholds();
        const inAm = document.getElementById('sem-cfg-amarillo');
        const inRo = document.getElementById('sem-cfg-rojo');
        if (inAm && !inAm.dataset.dirty) inAm.value = t.amarillo;
        if (inRo && !inRo.dataset.dirty) inRo.value = t.rojo;
        semUpdateScalePreview();
    };

    window.semUpdateScalePreview = function() {
        const inAm = document.getElementById('sem-cfg-amarillo');
        const inRo = document.getElementById('sem-cfg-rojo');
        if (!inAm || !inRo) return;
        const am = Math.max(1, parseInt(inAm.value, 10) || 1);
        const ro = Math.max(am + 1, parseInt(inRo.value, 10) || (am + 1));
        const s0 = document.getElementById('sem-scale-verde');
        const s1 = document.getElementById('sem-scale-amarillo');
        const s2 = document.getElementById('sem-scale-rojo');
        if (s0) s0.textContent = am === 1 ? '0 amonestaciones' : '0 – ' + (am - 1) + ' amonest.';
        if (s1) s1.textContent = am + (ro - 1 > am ? ' — ' + (ro - 1) : '') + ' amonest.';
        if (s2) s2.textContent = ro + ' o más amonest.';
    };

    window.semGuardarReglas = function() {
        const inAm = document.getElementById('sem-cfg-amarillo');
        const inRo = document.getElementById('sem-cfg-rojo');
        if (!inAm || !inRo) return;
        const am = Math.max(1, parseInt(inAm.value, 10) || 1);
        const ro = Math.max(am + 1, parseInt(inRo.value, 10) || (am + 1));
        inAm.value = am; inRo.value = ro;
        localStorage.setItem('colab_sem_amarillo', am);
        localStorage.setItem('colab_sem_rojo', ro);
        delete inAm.dataset.dirty; delete inRo.dataset.dirty;
        colabSemaforoEditorRefresh();
        const btn = document.getElementById('sem-save-btn');
        if (btn) {
            btn.innerHTML = '<i class="fas fa-check me-1"></i>Guardado';
            btn.classList.replace('btn-primary','btn-success');
            setTimeout(() => { btn.innerHTML = '<i class="fas fa-save me-1"></i>Guardar reglas globales'; btn.classList.replace('btn-success','btn-primary'); }, 2000);
        }
    };

    window.colabEditorAmonestPreview = async function() {
        colabSemaforoEditorRefresh();
        const ta   = document.getElementById('ce-amonestaciones');
        const list = document.getElementById('cedit-amonest-pdf-list');
        if (!ta || !list) return;
        const c = colabCurrentRow;
        const numEmpleado = c ? (val(gc(c, 'num')) || 'sin_num') : 'sin_num';
        const lines = String(ta.value || '').split(/\n/).map(l => l.trim()).filter(Boolean);
        if (!lines.length) {
            list.innerHTML = '<p class="ca-empty">Sin amonestaciones registradas.</p>';
            return;
        }
        // Render inicial con botones
        list.innerHTML = `<ul class="ca-list">${lines.map((line, i) => {
            const idx = i + 1;
            return `<li class="ca-item">
                <span class="ca-text">${line.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>
                <div class="ca-actions" id="cedit-ca-actions-${numEmpleado}-${idx}">
                    ${colabAmonestBtns(numEmpleado, idx, null, true)}
                </div>
            </li>`;
        }).join('')}</ul>`;
        // Verificar archivos existentes
        try {
            const sb = window.supabaseClient;
            if (!sb) return;
            const { data: files } = await sb.storage.from(EMPLOYEE_DOCS_BUCKET).list(EMPLOYEE_DOCS_PREFIX.replace(/\/$/, ''), { search: numEmpleado + '_' });
            if (!files?.length) return;
            const existingSet = new Set(files.map(f => f.name));
            lines.forEach((_, i) => {
                const idx = i + 1;
                const fileName = numEmpleado + '_' + idx + '.pdf';
                if (existingSet.has(fileName)) {
                    const div = document.getElementById(`cedit-ca-actions-${numEmpleado}-${idx}`);
                    if (div) div.innerHTML = colabAmonestBtns(numEmpleado, idx, EMPLOYEE_DOCS_BASE + fileName, true);
                }
            });
        } catch (e) { /* silenciar */ }
    };

    /* -- PDFs por comentario: constantes -- */
    const EMPLOYEE_COMENT_PREFIX = 'comentarios/';
    const EMPLOYEE_COMENT_BASE   = 'https://fgstncvuuhpgyzmjceyr.supabase.co/storage/v1/object/public/employee-cvs/comentarios/';

    // Generar botones para un ítem de comentario
    function colabComentBtns(numEmpleado, idx, existingUrl, canEdit) {
        const viewBtn = existingUrl
            ? `<a class="ca-btn-view" href="${existingUrl}" target="_blank" rel="noopener"><i class="fas fa-file-pdf me-1"></i>Ver PDF</a>`
            : '';
        const attachBtn = canEdit
            ? `<label class="ca-btn-attach" title="Adjuntar PDF">
                <i class="fas fa-paperclip me-1"></i>${existingUrl ? 'Reemplazar' : 'Adjuntar PDF'}
                <input type="file" accept="application/pdf" style="display:none"
                    onchange="colabComentUpload('${numEmpleado}',${idx},this)">
               </label>`
            : '';
        return viewBtn + attachBtn;
    }

    // Subir PDF de comentario
    window.colabComentUpload = async function(numEmpleado, idx, inputEl) {
        if (!colabRequireEdit()) {
            if (inputEl) inputEl.value = '';
            return;
        }
        const file = inputEl?.files?.[0];
        if (!file) return;
        const actionsDiv = inputEl.closest('.ca-item')?.querySelector('.ca-actions');
        if (actionsDiv) actionsDiv.innerHTML = '<span class="ca-uploading"><i class="fas fa-spinner fa-spin me-1"></i>Subiendo…</span>';
        try {
            const sb = window.supabaseClient;
            if (!sb) throw new Error('Sin conexión Supabase');
            const path = numEmpleado + '_' + idx + '.pdf';
            const { error } = await sb.storage.from(EMPLOYEE_DOCS_BUCKET).upload(EMPLOYEE_COMENT_PREFIX + path, file, { upsert: true, contentType: 'application/pdf' });
            if (error) throw error;
            const url = EMPLOYEE_COMENT_BASE + path;
            if (actionsDiv) actionsDiv.innerHTML = colabComentBtns(numEmpleado, idx, url, true);
        } catch (err) {
            console.error('[Colaboradores] Error subiendo comentario PDF:', err);
            if (actionsDiv) actionsDiv.innerHTML = '<span class="ca-uploading text-danger"><i class="fas fa-times-circle me-1"></i>Error al subir</span>';
        }
    };

    // Renderizar bloque comentarios en la ficha
    async function renderComentarios(c) {
        const container = document.getElementById('cf-comentarios-list');
        if (!container) return;
        const rawText = gc(c, 'comentarios');
        const canEdit = colabCanEdit();
        const numEmpleado = val(gc(c, 'num')) || 'sin_num';
        if (!val(rawText)) { container.innerHTML = '<p class="ca-empty">—</p>'; return; }
        const lines = String(rawText).split(/\n/).map(l => l.trim()).filter(Boolean);
        container.innerHTML = `<ul class="ca-list">${lines.map((line, i) => {
            const idx = i + 1;
            return `<li class="ca-item">
                <span class="ca-text">${line.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>
                <div class="ca-actions" id="cc-actions-${numEmpleado}-${idx}">
                    ${colabComentBtns(numEmpleado, idx, null, canEdit)}
                </div>
            </li>`;
        }).join('')}</ul>`;
        try {
            const sb = window.supabaseClient;
            if (!sb) return;
            const { data: files } = await sb.storage.from(EMPLOYEE_DOCS_BUCKET).list(EMPLOYEE_COMENT_PREFIX.replace(/\/$/, ''), { search: numEmpleado + '_' });
            if (!files?.length) return;
            const existingSet = new Set(files.map(f => f.name));
            lines.forEach((_, i) => {
                const idx = i + 1;
                const fileName = numEmpleado + '_' + idx + '.pdf';
                if (existingSet.has(fileName)) {
                    const div = document.getElementById(`cc-actions-${numEmpleado}-${idx}`);
                    if (div) div.innerHTML = colabComentBtns(numEmpleado, idx, EMPLOYEE_COMENT_BASE + fileName, canEdit);
                }
            });
        } catch (e) { /* silenciar */ }
    }

    // Preview PDFs de comentarios en editor
    window.colabEditorComentariosPreview = async function() {
        const ta   = document.getElementById('ce-comentarios');
        const list = document.getElementById('cedit-coment-pdf-list');
        if (!ta || !list) return;
        const c = colabCurrentRow;
        const numEmpleado = c ? (val(gc(c, 'num')) || 'sin_num') : 'sin_num';
        const lines = String(ta.value || '').split(/\n/).map(l => l.trim()).filter(Boolean);
        if (!lines.length) { list.innerHTML = '<p class="ca-empty">Sin comentarios registrados.</p>'; return; }
        list.innerHTML = `<ul class="ca-list">${lines.map((line, i) => {
            const idx = i + 1;
            return `<li class="ca-item">
                <span class="ca-text">${line.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>
                <div class="ca-actions" id="cedit-cc-actions-${numEmpleado}-${idx}">
                    ${colabComentBtns(numEmpleado, idx, null, true)}
                </div>
            </li>`;
        }).join('')}</ul>`;
        try {
            const sb = window.supabaseClient;
            if (!sb) return;
            const { data: files } = await sb.storage.from(EMPLOYEE_DOCS_BUCKET).list(EMPLOYEE_COMENT_PREFIX.replace(/\/$/, ''), { search: numEmpleado + '_' });
            if (!files?.length) return;
            const existingSet = new Set(files.map(f => f.name));
            lines.forEach((_, i) => {
                const idx = i + 1;
                const fileName = numEmpleado + '_' + idx + '.pdf';
                if (existingSet.has(fileName)) {
                    const div = document.getElementById(`cedit-cc-actions-${numEmpleado}-${idx}`);
                    if (div) div.innerHTML = colabComentBtns(numEmpleado, idx, EMPLOYEE_COMENT_BASE + fileName, true);
                }
            });
        } catch (e) { /* silenciar */ }
    };

    /* -- Guardar cambios -- */
    window.colabGuardarCambios = async function() {
        if (!colabCurrentRow) return;
        if (!colabRequireEdit()) return;
        const c = colabCurrentRow;
        const numEmpl = String(gc(c, 'num') || '').trim();
        const numCol  = colabCols?.num;
        if (!numCol || !numEmpl) { alert('No se puede identificar al colaborador.'); return; }

        const btn = document.getElementById('btn-colab-save');
        if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Guardando…'; }

        const uploadedDocumentRefs = [];
        const previousDocumentRefs = [];
        let employeeRowUpdated = false;

        try {
            const sb = window.supabaseClient;
            if (!sb) throw new Error('Supabase no disponible');

            const updatePayload = {};
            const cambios = [];
            const userObj  = JSON.parse(sessionStorage.getItem('user') || '{}');
            const userName = userObj.user_metadata?.full_name || userObj.email || 'Usuario';
            const userId   = userObj.id || null;

            // Detectar cambios campo por campo
            Object.entries(COLAB_EDIT_FIELD_MAP).forEach(([formId, colKey]) => {
                const realCol = colabCols?.[colKey];
                if (!realCol) return;
                const el = document.getElementById(formId);
                if (!el) return;
                const newVal = colKey === 'estatus'
                    ? colabNormalizarEstatus(el.value)
                    : colKey === 'onomastico'
                        ? colabNormalizeBirthDateStorage(el.value)
                        : el.value.trim();
                const oldVal = colKey === 'estatus'
                    ? colabNormalizarEstatus(c[realCol])
                    : colKey === 'onomastico'
                        ? colabNormalizeBirthDateStorage(c[realCol])
                        : String(c[realCol] ?? '').trim();
                if (newVal !== oldVal) {
                    updatePayload[realCol] = newVal || null;
                    cambios.push({ campo: colKey, valor_anterior: oldVal || null, valor_nuevo: newVal || null });
                }
            });

            /* El bucle de arriba se salta los campos cuya columna no existe en la
               base. Para la baja eso significaba perder la captura sin decir nada:
               si hay algo escrito y no hay columna, se avisa en vez de guardar a
               medias. */
            const bajaSinColumna = [
                ['ce-fecha-baja', 'fecha_baja', 'Fecha de baja'],
                ['ce-motivo-baja', 'motivo_baja', 'Motivos de baja'],
            ].find(([formId, colKey]) =>
                !colabCols?.[colKey] && String(document.getElementById(formId)?.value || '').trim());
            if (bajaSinColumna) {
                throw new Error(
                    `La tabla agenda_2026 todavía no tiene la columna "${bajaSinColumna[2]}", así que ese dato no se guardaría. `
                    + 'Corre db/agregar_fecha_baja.sql en Supabase (SQL Editor) y vuelve a intentarlo.');
            }

            const cambioEstatus = cambios.find(ch => ch.campo === 'estatus');
            if (cambioEstatus) {
                const nuevo = cambioEstatus.valor_nuevo;
                const msg = nuevo === 'Baja'
                    ? '¿Confirmas que deseas cambiar el estatus de este colaborador a Baja? El registro se conservará y seguirá disponible para consulta.'
                    : '¿Confirmas que deseas reactivar a este colaborador?';
                if (!confirm(msg)) {
                    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save me-1"></i>Guardar Cambios'; }
                    return;
                }
            }

            if (!window.employeeDocumentUpload) throw new Error('El módulo seguro de documentos no está disponible.');
            await colabPrepareDocumentImageChanges(
                sb,
                c,
                numEmpl,
                updatePayload,
                cambios,
                uploadedDocumentRefs,
                previousDocumentRefs
            );

            // Subir CV si hay archivo seleccionado
            const cvFileInput = document.getElementById('ce-cv-file');
            if (cvFileInput && cvFileInput.files[0]) {
                const cvFile = cvFileInput.files[0];
                if (cvFile.size > 10 * 1024 * 1024) throw new Error('El CV no puede superar 10 MB.');
                const cvPath = `${numEmpl}.pdf`;
                const cvStatusEl = document.getElementById('cedit-cv-status');
                if (cvStatusEl) cvStatusEl.innerHTML = '<small class="text-primary"><span class="spinner-border spinner-border-sm me-1"></span>Subiendo CV…</small>';
                const { error: upCvErr } = await sb.storage.from('employee-cvs').upload(cvPath, cvFile, { upsert: true, contentType: 'application/pdf' });
                if (upCvErr) throw new Error('Error subiendo CV: ' + upCvErr.message);
                if (cvStatusEl) cvStatusEl.innerHTML = '<small class="text-success"><i class="fas fa-check me-1"></i>CV subido correctamente</small>';
                const newCvUrl = EMPLOYEE_CVDOCS_BASE + cvPath;
                const cvUrlCol = colabCols?.cv_url;
                if (cvUrlCol) { updatePayload[cvUrlCol] = newCvUrl; }   // actualizar columna en BD si existe
                cambios.push({ campo: 'cv_url', valor_anterior: val(gc(c, 'cv_url')) || null, valor_nuevo: newCvUrl });
            }

            // Subir foto si hay archivo seleccionado
            const fileInput = document.getElementById('ce-foto-file');
            if (fileInput && fileInput.files[0]) {
                const file = fileInput.files[0];
                const statusEl = document.getElementById('cedit-foto-status');
                if (statusEl) statusEl.innerHTML = '<small class="text-primary"><span class="spinner-border spinner-border-sm me-1"></span>Subiendo foto…</small>';
                if (!window.employeePhotoUpload) throw new Error('El módulo seguro de fotografías no está disponible.');
                const uploadedPhoto = await window.employeePhotoUpload.upload({
                    client: sb,
                    file,
                    employeeNumber: numEmpl
                });
                const photoCol = colabCols?.foto;
                const previousPhoto = photoCol ? val(c[photoCol]) : val(gc(c, 'foto'));
                if (photoCol) updatePayload[photoCol] = uploadedPhoto.publicUrl;
                if (statusEl) statusEl.innerHTML = '<small class="text-success"><i class="fas fa-check me-1"></i>Foto subida correctamente; guardando referencia…</small>';
                cambios.push({ campo: 'foto', valor_anterior: previousPhoto || null, valor_nuevo: uploadedPhoto.publicUrl });
            }

            if (!Object.keys(updatePayload).length && cambios.length === 0) {
                bootstrap.Modal.getInstance(document.getElementById('colabEditModal'))?.hide();
                return;
            }

            // Actualizar registro en agenda_2026
            if (Object.keys(updatePayload).length) {
                // Entrecomillar columna si tiene caracteres especiales (ej: "No. Empleado")
                const safeNumCol = /[\s.]/.test(numCol) ? `"${numCol}"` : numCol;
                const { error: dbErr } = await sb.from('agenda_2026').update(updatePayload).eq(safeNumCol, numEmpl);
                if (dbErr && uploadedDocumentRefs.length) {
                    throw new window.employeeDocumentUpload.EmployeeDocumentUploadError(
                        'DOCUMENT_ASSOCIATION_FAILED',
                        'Las imágenes se recibieron, pero no fue posible asociarlas con el colaborador. No se conservarán archivos incompletos.',
                        { cause: dbErr, documentKind: uploadedDocumentRefs[0]?.kind || null }
                    );
                }
                if (dbErr) throw dbErr;
                employeeRowUpdated = true;

                /* La baja es el dato que más se ha resistido a quedarse guardado, y un
                   update sin error no siempre significa que se haya escrito. Se relee la
                   fila y se compara: si no quedó, se dice por qué en vez de dar el
                   guardado por bueno. */
                const colsBaja = ['fecha_baja', 'motivo_baja']
                    .map(clave => colabCols?.[clave])
                    .filter(col => col && Object.prototype.hasOwnProperty.call(updatePayload, col));
                if (colsBaja.length) {
                    const { data: relectura } = await sb.from('agenda_2026').select('*').eq(safeNumCol, numEmpl).limit(1);
                    const filaGuardada = relectura && relectura[0];
                    if (filaGuardada) {
                        const sinColumna = colsBaja.find(col => !(col in filaGuardada));
                        if (sinColumna) {
                            throw new Error(`La tabla agenda_2026 no tiene la columna "${sinColumna}": corre db/agregar_fecha_baja.sql en Supabase y recarga la página.`);
                        }
                        const noQuedo = colsBaja.find(col =>
                            String(filaGuardada[col] ?? '').slice(0, 10) !== String(updatePayload[col] ?? '').slice(0, 10));
                        if (noQuedo) {
                            /* Un UPDATE que no pasa la política de RLS no falla: afecta
                               cero filas y responde como si todo hubiera ido bien. */
                            throw new Error(`La base no guardó "${noQuedo}". Casi siempre es permiso: tu rol no pasa la política de escritura de agenda_2026. `
                                + 'Corre db/fix_rls_colaboradores_edicion.sql en Supabase (SQL Editor) y vuelve a intentarlo.');
                        }
                    }
                }
            }

            for (const oldDocument of previousDocumentRefs) {
                try {
                    await window.employeeDocumentUpload.remove(sb, oldDocument.reference, oldDocument.kind);
                } catch (cleanupError) {
                    console.warn('[Colaboradores][Documento] No se pudo limpiar una versión anterior', {
                        documentKind: oldDocument.kind,
                        code: cleanupError?.code || 'CLEANUP_FAILED'
                    });
                }
            }

            // Registrar historial
            if (cambios.length) {
                const histRows = cambios.map(ch => ({
                    num_empleado:   numEmpl,
                    campo:          ch.campo,
                    valor_anterior: ch.valor_anterior,
                    valor_nuevo:    ch.valor_nuevo,
                    usuario_id:     userId,
                    usuario_nombre: userName,
                    fecha:          new Date().toISOString(),
                }));
                const { error: histErr } = await sb.from('colab_historial').insert(histRows);
                if (histErr) throw new Error('Datos guardados pero el historial falló: ' + histErr.message + '. ¿Ejecutaste el SQL db/colab_historial.sql en Supabase?');
            }

            // Registrar en historial global (Historia)
            window.logHistory?.('EDITAR', 'Colaboradores', numEmpl, {
                summary: `Actualización de colaborador No. ${numEmpl}${cambios.length ? ' — ' + cambios.length + ' campo(s) modificado(s)' : ''}`,
                changes: cambios.map(ch => ({ campo: ch.campo, anterior: ch.valor_anterior, nuevo: ch.valor_nuevo }))
            });

            // Invalidar caché y recargar
            colabCache = null; colabDirectoryUniverse = null; colabLoaded = false; colabLoadPromise = null;

            // Mostrar timestamp de último guardado
            const saveLabel = document.getElementById('colab-edit-last-save');
            if (saveLabel) saveLabel.textContent = `Guardado: ${new Date().toLocaleTimeString('es-MX')}`;

            bootstrap.Modal.getInstance(document.getElementById('colabEditModal'))?.hide();

            // Actualizar ficha
            const todos   = await colabCargarTodos();
            const updated = todos.find(r => String(gc(r, 'num') || '').trim() === numEmpl);
            if (updated) renderFicha(updated);

            await colabCargarHistorial(numEmpl);
            colabCargarHistorialPlaza(numEmpl);

        } catch (err) {
            if (!employeeRowUpdated && uploadedDocumentRefs.length && window.employeeDocumentUpload) {
                await Promise.allSettled(uploadedDocumentRefs.map(item =>
                    window.employeeDocumentUpload.remove(window.supabaseClient, item.reference, item.kind)
                ));
            }
            console.error('[Colaboradores] Error al guardar:', err);
            const photoStatus = document.getElementById('cedit-foto-status');
            const userMessage = err?.userMessage || err?.message || String(err);
            if (err?.name === 'EmployeePhotoUploadError' && photoStatus) {
                photoStatus.innerHTML = `<small class="text-danger"><i class="fas fa-times me-1"></i>${userMessage}</small>`;
            }
            if (err?.name === 'EmployeeDocumentUploadError' && err.documentKind) {
                colabDocumentImageStatus(err.documentKind, userMessage, 'danger');
            }
            alert('Error al guardar: ' + userMessage);
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save me-1"></i>Guardar Cambios'; }
        }
    };


    /* -- Init cuando el DOM está listo -- */
    /* -------------------------------------------
       NUEVO COLABORADOR
    ------------------------------------------- */

    /* Mapeo de campos del form "nuevo" ? clave semántica (igual que editar) */
    const COLAB_NUEVO_FIELD_MAP = {
        'cn-num':'num','cn-nombre':'nombre','cn-puesto':'puesto',
        'cn-fecha-ingreso':'fecha_ingreso','cn-onomastico':'onomastico',
        'cn-celular':'celular','cn-extension':'extension','cn-correo':'correo','cn-correo-personal':'correo_personal',
        'cn-profesion':'profesion','cn-militar':'militar',
        'cn-nivel':'nivel','cn-plaza':'plaza','cn-turno':'turno','cn-ryr':'ryr',
        'cn-grado':'grado','cn-matricula':'matricula',
        'cn-grado-academico':'grado_academico','cn-cedula':'cedula',
        'cn-comisionado':'comisionado','cn-direccion':'direccion',
        'cn-subdireccion':'subdireccion','cn-gerencia':'gerencia',
        'cn-coordinacion':'coordinacion',
        'cn-licencia':'licencia','cn-licencia-tipo':'licencia_tipo',
        'cn-vig-licencia':'vig_licencia','cn-vig-credencial':'vig_credencial',
        'cn-vig-ine':'vig_ine','cn-domicilio':'domicilio',
        'cn-rfc':'rfc','cn-curp':'curp','cn-estado-civil':'estado_civil',
        'cn-dependientes':'dependientes','cn-rubrica':'rubrica',
        'cn-doc-ingreso':'doc_ingreso',
        'cn-c1-nombre':'c1_nombre','cn-c1-parentesco':'c1_parentesco',
        'cn-c1-tel':'c1_tel','cn-c2-nombre':'c2_nombre',
        'cn-c2-parentesco':'c2_parentesco','cn-c2-tel':'c2_tel',
        'cn-sexo':'sexo','cn-sangre':'sangre','cn-alerg-med':'alerg_med',
        'cn-alerg-ali':'alerg_ali','cn-nss':'nss',
    };

    /* Control de contratos le agrega un sufijo al numero cuando alguien
       renueva: el 1551-2 es el MISMO 1551, no otra persona. Comparar los
       numeros tal cual dejaba pasar esa alta repetida, asi que se compara
       contra la base, sin el sufijo. */
    function colabNumBase(num) {
        return String(num == null ? '' : num)
            .trim()
            .replace(/\s+/g, '')
            .replace(/[-\/]\d{1,2}$/, '')
            .toUpperCase();
    }

    /** El colaborador ya registrado que es esta misma persona, si lo hay. */
    function colabBuscarMismaPersona(num) {
        const base = colabNumBase(num);
        if (!base) return null;
        return (colabCache || []).find(r => colabNumBase(gc(r, 'num')) === base) || null;
    }

    /* Se pone en true solo cuando el area confirma, a proposito, que quiere
       un expediente nuevo pese al aviso. Se reinicia con cada alta. */
    let colabDupConfirmado = false;

    /** Aviso en vivo debajo del numero, mientras se escribe. */
    function colabAvisarMismaPersona() {
        const aviso = document.getElementById('cn-num-aviso');
        const input = document.getElementById('cn-num');
        if (!aviso || !input) return;
        const valor = (input.value || '').trim();
        const previo = valor ? colabBuscarMismaPersona(valor) : null;
        if (!previo) {
            aviso.classList.add('d-none');
            aviso.textContent = '';
            input.classList.remove('is-invalid');
            return;
        }
        const numPrevio = String(gc(previo, 'num') || '').trim();
        const nombrePrevio = String(gc(previo, 'nombre') || '').trim();
        aviso.textContent = numPrevio === valor
            ? 'Este número ya está registrado' + (nombrePrevio ? ': ' + nombrePrevio : '') + '.'
            : 'Es la misma persona que el ' + numPrevio + (nombrePrevio ? ' — ' + nombrePrevio : '') +
              '. El sufijo solo marca la renovación de contrato.';
        aviso.classList.remove('d-none');
        input.classList.add('is-invalid');
    }

    /** Caja de confirmacion cuando el numero es una renovacion. */
    function colabMostrarAvisoRenovacion(previo, numVal) {
        const caja = document.getElementById('cn-dup-alert');
        if (!caja) return;
        const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const numPrevio = String(gc(previo, 'num') || '').trim();
        const nombrePrevio = String(gc(previo, 'nombre') || '').trim();
        caja.innerHTML =
            '<div class="cn-dup-msg"><i class="fas fa-triangle-exclamation me-2"></i>' +
            'El <strong>' + esc(numVal) + '</strong> es una renovación de contrato del ' +
            '<strong>' + esc(numPrevio) + '</strong>' + (nombrePrevio ? ' (' + esc(nombrePrevio) + ')' : '') +
            ', que ya está en el directorio: es la misma persona. Si continúas, quedará dos veces.</div>' +
            '<button type="button" class="btn btn-sm btn-warning fw-semibold" id="cn-dup-force">' +
            'Registrar de todos modos</button>';
        caja.classList.remove('d-none');
        document.getElementById('cn-dup-force')?.addEventListener('click', function () {
            colabDupConfirmado = true;
            caja.classList.add('d-none');
            window.colabGuardarNuevo();
        });
    }

    /** Abrir modal de nuevo colaborador */
    window.colabAbrirNuevo = function() {
        if (!colabRequireEdit()) return;
        // Limpiar todos los campos
        Object.keys(COLAB_NUEVO_FIELD_MAP).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        window.colabCerrarOnboardingPanel?.();
        // Limpiar errores
        const errEl = document.getElementById('colab-nuevo-error');
        if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
        // Cada alta arranca sin la confirmación de la anterior.
        colabDupConfirmado = false;
        document.getElementById('cn-dup-alert')?.classList.add('d-none');
        const numInput = document.getElementById('cn-num');
        if (numInput && !numInput.dataset.avisoNumWired) {
            numInput.dataset.avisoNumWired = '1';
            numInput.addEventListener('input', function () {
                colabDupConfirmado = false;
                document.getElementById('cn-dup-alert')?.classList.add('d-none');
                colabAvisarMismaPersona();
            });
        }
        colabAvisarMismaPersona();
        // Ir al primer tab
        const firstTab = document.querySelector('#colabNuevoTabs .nav-link');
        if (firstTab && typeof bootstrap !== 'undefined') {
            bootstrap.Tab.getOrCreateInstance(firstTab).show();
        }
        new bootstrap.Modal(document.getElementById('colabNuevoModal')).show();
    };

    /** Guardar nuevo colaborador en Supabase */
    window.colabGuardarNuevo = async function() {
        if (!colabRequireEdit()) return;

        const errEl = document.getElementById('colab-nuevo-error');
        const btnEl = document.getElementById('btn-colab-nuevo-save');

        // Validar campos requeridos
        const numVal    = (document.getElementById('cn-num')?.value || '').trim();
        const nombreVal = (document.getElementById('cn-nombre')?.value || '').trim();
        if (!numVal || !nombreVal) {
            if (errEl) { errEl.textContent = 'El No. Empleado y el Nombre son obligatorios.'; errEl.style.display = ''; }
            // Ir al tab Generales
            const genTab = document.querySelector('#colabNuevoTabs .nav-link');
            if (genTab && typeof bootstrap !== 'undefined') bootstrap.Tab.getOrCreateInstance(genTab).show();
            return;
        }
        if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }

        if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Guardando…'; }

        try {
            const sb = window.supabaseClient;
            if (!sb) throw new Error('Supabase no disponible');

            // Esperar a que las columnas sean detectadas
            await colabCargarTodos();
            if (!colabCols) throw new Error('No se detectaron las columnas de la tabla.');

            // El número de empleado no puede repetirse, y el sufijo de renovación
            // tampoco hace a otra persona: 1551-2 es el mismo 1551.
            const previo = colabBuscarMismaPersona(numVal);
            if (previo) {
                const numPrevio = String(gc(previo, 'num') || '').trim();
                const nombrePrevio = String(gc(previo, 'nombre') || '').trim();
                if (numPrevio === numVal) {
                    throw new Error(`Ya existe un colaborador con el No. de Empleado "${numVal}"` +
                        (nombrePrevio ? `: ${nombrePrevio}` : '') + '.');
                }
                if (!colabDupConfirmado) {
                    colabMostrarAvisoRenovacion(previo, numVal);
                    return;
                }
            }

            // Construir payload con las columnas reales
            const payload = {};
            Object.entries(COLAB_NUEVO_FIELD_MAP).forEach(([formId, colKey]) => {
                const realCol = colabCols?.[colKey];
                if (!realCol) return;
                const el = document.getElementById(formId);
                const v  = (el?.value || '').trim();
                if (v) payload[realCol] = v;
            });
            const estatusCol = colabCols?.estatus;
            if (estatusCol && !payload[estatusCol]) payload[estatusCol] = 'Activo';

            const { error } = await sb.from('agenda_2026').insert([payload]);
            if (error) throw error;

            // Registrar en historial global (Historia)
            window.logHistory?.('CREAR', 'Colaboradores', numVal, {
                summary: `Nuevo colaborador registrado: No. ${numVal} — ${nombreVal}`,
                new: payload
            });

            // Invalidar caché
            colabCache = null; colabDirectoryUniverse = null; colabLoaded = false; colabLoadPromise = null;

            bootstrap.Modal.getInstance(document.getElementById('colabNuevoModal'))?.hide();

            // Refrescar dashboard
            await colabCargarTodos();
            colabRenderDashboard();

            // Mostrar la ficha del nuevo
            const nuevoRegistro = (colabCache || []).find(r => String(gc(r, 'num') || '').trim() === numVal);
            if (nuevoRegistro) {
                renderFicha(nuevoRegistro);
                document.getElementById('colab-num-input').value = numVal;
            }

            // Toast de éxito (si Bootstrap toast no está, usar alert)
            if (typeof bootstrap !== 'undefined' && bootstrap.Toast) {
                const toastHtml = `<div class="position-fixed bottom-0 end-0 p-3" style="z-index:999999">
                    <div class="toast align-items-center text-white bg-success border-0 show" role="alert">
                        <div class="d-flex">
                            <div class="toast-body"><i class="fas fa-check-circle me-2"></i>Colaborador registrado con éxito.</div>
                            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Cerrar"></button>
                        </div>
                    </div>
                </div>`;
                const toastWrap = document.createElement('div');
                toastWrap.innerHTML = toastHtml;
                document.body.appendChild(toastWrap);
                setTimeout(() => toastWrap.remove(), 4000);
            }

        } catch (err) {
            console.error('[Colaboradores] Error al crear nuevo:', err);
            if (errEl) { errEl.textContent = 'Error: ' + (err?.message || String(err)); errEl.style.display = ''; }
        } finally {
            if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '<i class="fas fa-save me-1"></i>Registrar Colaborador'; }
        }
    };

    /* -------------------------------------------
       TABLA COMPLETA DE COLABORADORES
    ------------------------------------------- */

    let ctblData = [];        // datos actuales filtrados
    let ctblAllData = [];     // todos los datos sin filtrar
    let ctblSortCol = 'nombre';
    let ctblSortAsc = true;
    let ctblCols = [];        // columnas detectadas del primer registro
    let ctblFilterKeys = { dir: 'direccion', nivel: 'nivel', turno: 'turno' };
    let ctblSearchIndex = new WeakMap();
    let ctblRowHtmlCache = new WeakMap();
    let ctblRowNodeCache = new WeakMap();
    let ctblSearchTimer = null;
    let ctblSearchRunId = 0;
    let ctblSearchQueuedAt = 0;
    let ctblLastFilterMetrics = null;

    // Orden preferido de columnas
    const CTBL_COL_ORDER = [
        'estatus','Estatus','sangre','Tipo de sangre',
        'num_empleado','nombre','sexo','Sexo','puesto','plaza','nivel','turno',
        'direccion','subdireccion','gerencia','coordinacion',
        'fecha_ingreso','correo','celular','extension','profesion',
        'grado','matricula','grado_academico','Grado Académico','cedula',
        'militar','comisionado','ryr','onomastico',
        'estado_civil','dependientes','nss',
        'domicilio','rfc','curp','licencia','licencia_tipo',
        'vig_licencia','vig_credencial','vig_ine',
        'c1_nombre','c1_parentesco','c1_tel',
        'c2_nombre','c2_parentesco','c2_tel',
        'alerg_med','alerg_ali','amonestaciones','comentarios',
        'doc_ingreso','medidas','permisos','rubrica'
    ];

    // Etiquetas legibles
    const CTBL_COL_LABELS = {
        'num_empleado':'No. Empleado','nombre':'Nombre','sexo':'Sexo','Sexo':'Sexo','puesto':'Puesto',
        'plaza':'Plaza','nivel':'Nivel','turno':'Turno',
        'direccion':'Dirección','subdireccion':'Subdireccion',
        'gerencia':'Gerencia','coordinacion':'Coordinacion',
        'fecha_ingreso':'Fecha Ingreso','correo':'Correo',
        'celular':'Celular','extension':'Ext.','profesion':'Profesion',
        'grado_academico':'Grado Académico','Grado Académico':'Grado Académico',
        'estatus':'Estatus','Estatus':'Estatus','grado':'Grado Militar',
        'matricula':'Matrícula','cedula':'Cédula',
        'militar':'Mil./Civil','comisionado':'Comisionado','ryr':'R y R',
        'onomastico':'Onomástico','estado_civil':'Edo. Civil',
        'dependientes':'Dependientes','nss':'NSS','sangre':'Sangre','Tipo de sangre':'Sangre',
        'domicilio':'Domicilio','rfc':'RFC','curp':'CURP',
        'licencia':'Licencia','licencia_tipo':'Tipo Lic.',
        'vig_licencia':'Vig. Lic.','vig_credencial':'Vig. Cred.',
        'vig_ine':'Vig. INE',
        'c1_nombre':'Contacto 1','c1_parentesco':'Parentesco 1','c1_tel':'Tel. C1',
        'c2_nombre':'Contacto 2','c2_parentesco':'Parentesco 2','c2_tel':'Tel. C2',
        'alerg_med':'Alergia Med.','alerg_ali':'Alergia Ali.',
        'amonestaciones':'Amonestaciones','comentarios':'Comentarios',
        'doc_ingreso':'Doc. Ingreso','medidas':'Medidas',
        'permisos':'Permisos','rubrica':'Rúbrica',
        'foto_url':'Foto URL','cv_url':'CV URL',
        'id':'ID','created_at':'Creado'
    };

    // Columnas a ocultar de la tabla (internas)
    const CTBL_HIDDEN_COLS = new Set(['id','created_at','foto_url','cv_url','conducta','Conducta']);

    // Algunas fuentes traen el mismo dato con nombre técnico y nombre de Excel.
    // Esto evita duplicados visuales sin eliminar columnas reales de Supabase.
    function ctblCanonCol(k) {
        const raw = String(k || '').trim();
        const n = norm(raw).replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (n === 'estatus') return 'estatus';
        if (n === 'grado academico' || /^grado acad.mico$/i.test(raw)) return 'grado_academico';
        if (n === 'sangre' || n === 'tipo de sangre') return 'sangre';
        if (n === 'sexo' || n === 'genero' || n === 'sex') return 'sexo';
        if (n === 'no empleado' || n === 'num empleado' || n === 'numero empleado') return 'num_empleado';
        if (n === 'nombre') return 'nombre';
        return n || raw;
    }

    function ctblLabelCol(k) {
        return ctblCanonCol(k) === 'grado_academico'
            ? 'Grado Académico'
            : (CTBL_COL_LABELS[k] || k);
    }

    function ctblValorUtil(v) {
        const s = String(v ?? '').trim();
        if (!s) return false;
        return !/^(—|-|null|undefined|#n\/d)$/i.test(s);
    }

    function ctblDeduplicarCols(keys, rows = []) {
        const grupos = new Map();
        keys.forEach((k, idx) => {
            const canon = ctblCanonCol(k);
            if (!grupos.has(canon)) grupos.set(canon, []);
            grupos.get(canon).push({ key: k, idx });
        });
        return [...grupos.values()].map(cands => {
            if (cands.length === 1) return cands[0].key;
            return cands
                .map(c => ({
                    ...c,
                    score: rows.reduce((acc, r) => acc + (ctblValorUtil(r?.[c.key]) ? 1 : 0), 0)
                }))
                .sort((a, b) => (b.score - a.score) || (a.idx - b.idx))[0].key;
        });
    }

    function ctblFindColByCanon(canonName) {
        return ctblCols.find(k => ctblCanonCol(k) === canonName) || null;
    }

    function ctblSetSearchStatus(message, loading = false) {
        const el = document.getElementById('ctbl-search-status');
        if (!el) return;
        if (!message) {
            el.classList.add('d-none');
            el.innerHTML = '';
            return;
        }
        el.classList.remove('d-none');
        el.innerHTML = loading
            ? `<span class="spinner-border spinner-border-sm text-primary" style="width:.8rem;height:.8rem"></span>${message}`
            : message;
    }

    function ctblPrepararIndiceBusqueda() {
        ctblSearchIndex = new WeakMap();
        const numKey = ctblFindColByCanon('num_empleado') || 'num_empleado';
        const nombreKey = ctblFindColByCanon('nombre') || 'nombre';
        const puestoKey = ctblFindColByCanon('puesto') || 'puesto';
        const direccionKey = ctblFindColByCanon('direccion') || 'direccion';
        const subdireccionKey = ctblFindColByCanon('subdireccion') || 'subdireccion';
        const gerenciaKey = ctblFindColByCanon('gerencia') || 'gerencia';
        const coordinacionKey = ctblFindColByCanon('coordinacion') || 'coordinacion';
        ctblAllData.forEach(r => {
            const numero = norm(r?.[numKey]);
            const nombre = norm(r?.[nombreKey]);
            const puesto = norm(r?.[puestoKey]);
            const direccion = norm(r?.[direccionKey]);
            const subdireccion = norm(r?.[subdireccionKey]);
            const gerencia = norm(r?.[gerenciaKey]);
            const coordinacion = norm(r?.[coordinacionKey]);
            const partesNombre = nombre.split(' ').filter(Boolean);
            ctblSearchIndex.set(r, {
                numero,
                nombre,
                puesto,
                primerNombre: partesNombre[0] || '',
                apellidos: partesNombre.slice(1),
                direccion,
                subdireccion,
                gerencia,
                coordinacion,
                texto: `${numero} ${nombre} ${puesto} ${direccion} ${subdireccion} ${gerencia} ${coordinacion}`.trim()
            });
        });
    }

    function ctblTextoBusqueda(r) {
        let indice = ctblSearchIndex.get(r);
        if (indice !== undefined) return indice;
        const numKey = ctblFindColByCanon('num_empleado') || 'num_empleado';
        const nombreKey = ctblFindColByCanon('nombre') || 'nombre';
        const puestoKey = ctblFindColByCanon('puesto') || 'puesto';
        const direccionKey = ctblFindColByCanon('direccion') || 'direccion';
        const subdireccionKey = ctblFindColByCanon('subdireccion') || 'subdireccion';
        const gerenciaKey = ctblFindColByCanon('gerencia') || 'gerencia';
        const coordinacionKey = ctblFindColByCanon('coordinacion') || 'coordinacion';
        const numero = norm(r?.[numKey]);
        const nombre = norm(r?.[nombreKey]);
        const puesto = norm(r?.[puestoKey]);
        const direccion = norm(r?.[direccionKey]);
        const subdireccion = norm(r?.[subdireccionKey]);
        const gerencia = norm(r?.[gerenciaKey]);
        const coordinacion = norm(r?.[coordinacionKey]);
        const partesNombre = nombre.split(' ').filter(Boolean);
        indice = {
            numero,
            nombre,
            puesto,
            primerNombre: partesNombre[0] || '',
            apellidos: partesNombre.slice(1),
            direccion,
            subdireccion,
            gerencia,
            coordinacion,
            texto: `${numero} ${nombre} ${puesto} ${direccion} ${subdireccion} ${gerencia} ${coordinacion}`.trim()
        };
        ctblSearchIndex.set(r, indice);
        return indice;
    }

    function ctblRelevanciaBusqueda(indice, q) {
        if (!q) return 0;
        if (indice.numero === q) return 0;
        if (indice.primerNombre.startsWith(q)) return 1;
        if (indice.apellidos.some(parte => parte.startsWith(q))) return 2;
        if (indice.nombre.includes(q)) return 3;
        if (indice.numero.includes(q)) return 4;
        if (indice.puesto.includes(q)) return 5;
        if (indice.direccion.includes(q)) return 6;
        if (indice.subdireccion.includes(q)) return 7;
        if (indice.gerencia.includes(q)) return 8;
        if (indice.coordinacion.includes(q)) return 9;
        return Number.POSITIVE_INFINITY;
    }

    // Columnas de texto largo que necesitan wrap
    const CTBL_WRAP_COLS = new Set(['nombre','puesto','domicilio','comentarios','amonestaciones','profesion','grado_academico','coordinacion']);

    // Filtros activos por columna: { col: Set<string> }  null/falta = todo
    let _ctblColFilters = {};
    // Estado del popup abierto
    let _ctblCFP = { col: null, allVals: [], tempSel: new Set() };

    // Cerrar popup al clicar fuera
    document.addEventListener('click', e => {
        const popup = document.getElementById('ctbl-cfp');
        if (popup && popup.style.display !== 'none' && !popup.contains(e.target)) ctblFiltroColCerrar();
    });

    /** Generar thead dinámico con todas las columnas */
    function ctblGenerarThead() {
        const thead = document.getElementById('ctbl-thead');
        if (!thead || !ctblCols.length) return;
        const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        const thCols = ctblCols.map(col => {
            const label = ctblLabelCol(col);
            const hasF  = _ctblColFilters[col]?.size > 0;
            return `<th>
                <div class="ctbl-th-inner" onclick="colabTablaOrdenar('${esc(col)}')" title="Ordenar por ${esc(label)}">
                    ${esc(label)}
                    <span class="sort-arrow" id="ctbl-sort-${esc(col)}"></span>
                </div>
                <button class="ctbl-cfb${hasF?' has-filter':''}" id="ctbl-cfb-${esc(col)}"
                        onclick="event.stopPropagation();ctblAbrirFiltroCol('${esc(col)}',event)"
                        title="Filtrar por ${esc(label)}">${hasF?'\u25bc&#xFE0E;':'\u25bc'}</button>
            </th>`;
        });
        const conductaTh = `<th style="white-space:nowrap"><div class="ctbl-th-inner"><i class="fas fa-shield-alt me-1" style="opacity:.6"></i>Conducta</div></th>`;
        const gradoAcadIdx = ctblCols.findIndex(k => k === 'grado_academico' || /^grado\s+acad[eé]mico$/i.test(k));
        thCols.splice(gradoAcadIdx >= 0 ? gradoAcadIdx + 1 : 1, 0, conductaTh);
        thead.innerHTML = `<tr>${thCols.join('')}</tr>`;
    }

    /** Abrir modal y cargar tabla */
    window.colabAbrirTabla = async function() {
        const modal = new bootstrap.Modal(document.getElementById('colabTablaModal'));
        modal.show();
        // Resetear filtros de columna
        _ctblColFilters = {};
        const loadingEl = document.getElementById('ctbl-loading');
        const tableEl   = document.getElementById('ctbl-table');
        const emptyEl   = document.getElementById('ctbl-empty');
        if (loadingEl) loadingEl.classList.remove('d-none');
        if (tableEl)   tableEl.classList.add('d-none');
        if (emptyEl)   emptyEl.classList.add('d-none');

        const todos = await colabCargarTodos();
        ctblAllData = todos || [];

        // Detectar columnas del primer registro, ordenarlas por prioridad
        if (ctblAllData.length) {
            const allKeys = ctblDeduplicarCols(Object.keys(ctblAllData[0]).filter(k => !CTBL_HIDDEN_COLS.has(k)), ctblAllData);
            const preferred = ctblDeduplicarCols(CTBL_COL_ORDER.filter(k => allKeys.includes(k)), ctblAllData);
            const preferredCanon = new Set(preferred.map(ctblCanonCol));
            const rest = allKeys.filter(k => !preferredCanon.has(ctblCanonCol(k)) && !CTBL_HIDDEN_COLS.has(k));
            ctblCols = ctblDeduplicarCols([...preferred, ...rest], ctblAllData);
            const estatusKey = ctblCols.find(k => /^estatus$/i.test(k));
            const sangreKey = ctblCols.find(k => k === 'sangre' || /^tipo\s+de\s+sangre$/i.test(k));
            const frontKeys = [estatusKey, sangreKey].filter(Boolean);
            const frontCanon = new Set(frontKeys.map(ctblCanonCol));
            ctblCols = [...frontKeys, ...ctblCols.filter(k => !frontCanon.has(ctblCanonCol(k)))];
            // Columna de sort inicial: preferir num_empleado
            ctblSortCol = ctblCols.find(k => k === 'num_empleado' || k === 'num') || ctblCols[0] || 'nombre';
            ctblSortAsc = true;
            // Detectar raw keys para los filtros
            const dirKey   = allKeys.find(k => /direcc/i.test(k)) || 'direccion';
            const nivelKey = allKeys.find(k => /^nivel$/i.test(k)) || 'nivel';
            const turnoKey = allKeys.find(k => /^turno$/i.test(k)) || 'turno';
            ctblFilterKeys = { dir: dirKey, nivel: nivelKey, turno: turnoKey };
            ctblPrepararIndiceBusqueda();
            ctblPrepararRenderCache();
        }

        ctblGenerarThead();

        // Poblar dropdowns de filtros
        function poblarSelect(elId, rawKey) {
            const el = document.getElementById(elId);
            if (!el) return;
            const firstOpt = el.options[0];
            el.innerHTML = '';
            el.appendChild(firstOpt);
            const valores = [...new Set(ctblAllData.map(r => String(r[rawKey] || '').trim()).filter(Boolean))].sort();
            valores.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v; opt.textContent = v;
                el.appendChild(opt);
            });
        }
        poblarSelect('ctbl-dir',   ctblFilterKeys.dir);
        poblarSelect('ctbl-nivel', ctblFilterKeys.nivel);
        poblarSelect('ctbl-turno', ctblFilterKeys.turno);

        // Limpiar búsqueda
        const searchEl = document.getElementById('ctbl-search');
        if (searchEl) searchEl.value = '';

        if (loadingEl) loadingEl.classList.add('d-none');
        colabTablaFiltrar();
    };

    /** Filtrar tabla por texto, selects y filtros de columna */
    window.colabTablaFiltrarDebounced = function() {
        const runId = ++ctblSearchRunId;
        ctblSearchQueuedAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        if (ctblSearchTimer !== null) cancelAnimationFrame(ctblSearchTimer);
        ctblSearchTimer = requestAnimationFrame(() => {
            ctblSearchTimer = null;
            if (runId !== ctblSearchRunId) return;
            colabTablaFiltrar(ctblSearchQueuedAt);
        });
    };

    window.colabTablaFiltrar = function(inputStartedAt = 0) {
        const started = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        ++ctblSearchRunId;
        if (ctblSearchTimer !== null) cancelAnimationFrame(ctblSearchTimer);
        ctblSearchTimer = null;
        const q     = norm((document.getElementById('ctbl-search')?.value || ''));
        const dir   = (document.getElementById('ctbl-dir')?.value   || '');
        const nivel = (document.getElementById('ctbl-nivel')?.value || '');
        const turno = (document.getElementById('ctbl-turno')?.value || '');
        let processed = 0;

        const matches = [];
        for (const r of ctblAllData) {
            processed++;
            if (dir   && String(r[ctblFilterKeys.dir]   || '').trim() !== dir)   continue;
            if (nivel && String(r[ctblFilterKeys.nivel] || '').trim() !== nivel) continue;
            if (turno && String(r[ctblFilterKeys.turno] || '').trim() !== turno) continue;
            if (q && !ctblTextoBusqueda(r).texto.includes(q)) continue;
            // Filtros por columna individual
            let accepted = true;
            for (const [col, vals] of Object.entries(_ctblColFilters)) {
                if (!vals || !vals.size) continue;
                const cell = String(r[col] ?? '').trim() || '—';
                if (!vals.has(cell)) { accepted = false; break; }
            }
            if (accepted) matches.push(r);
        }
        ctblData = matches;
        const filterEnded = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

        // Aplicar orden actual
        const col = ctblSortCol;
        const estatusKey = ctblCols.find(k => /^estatus$/i.test(k));
        const estatusPeso = r => {
            const v = estatusKey ? String(r[estatusKey] ?? '').trim().toLowerCase() : '';
            if (v === 'activo') return 0;
            if (v === 'baja') return 2;
            return 1;
        };
        ctblData.sort((a, b) => {
            if (q) {
                const relevancia = ctblRelevanciaBusqueda(ctblTextoBusqueda(a), q) - ctblRelevanciaBusqueda(ctblTextoBusqueda(b), q);
                if (relevancia) return relevancia;
            }
            const ea = estatusPeso(a);
            const eb = estatusPeso(b);
            if (ea !== eb) return ea - eb;
            const ra = String(a[col] ?? '').trim();
            const rb = String(b[col] ?? '').trim();
            const na = parseFloat(ra), nb = parseFloat(rb);
            const numericCol = !isNaN(na) && !isNaN(nb);
            if (numericCol) return ctblSortAsc ? na - nb : nb - na;
            const va = norm(ra), vb = norm(rb);
            return ctblSortAsc ? va.localeCompare(vb, 'es') : vb.localeCompare(va, 'es');
        });
        const sortEnded = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

        ctblActualizarBannerFiltros();
        const renderMs = colabTablaRender();
        const elapsed = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - started;
        ctblLastFilterMetrics = {
            query: q,
            processed,
            results: ctblData.length,
            inputDelayMs: Math.round(Math.max(0, started - (inputStartedAt || started)) * 10) / 10,
            filterMs: Math.round((filterEnded - started) * 10) / 10,
            sortMs: Math.round((sortEnded - filterEnded) * 10) / 10,
            renderMs: Math.round(renderMs * 10) / 10,
            ms: Math.round(elapsed * 10) / 10,
            totalFromInputMs: Math.round(((inputStartedAt ? started - inputStartedAt : 0) + elapsed) * 10) / 10,
            supabaseQueries: 0
        };
        ctblSetSearchStatus(q ? `${ctblData.length} resultado(s) · ${ctblLastFilterMetrics.ms} ms` : '');
    };

    /** Actualiza barra de filtros activos */
    function ctblActualizarBannerFiltros() {
        const bar   = document.getElementById('ctbl-active-filters');
        const btnCl = document.getElementById('ctbl-clear-col-filters');
        const active = Object.entries(_ctblColFilters).filter(([,v]) => v?.size > 0);
        if (!bar) return;
        if (!active.length) {
            bar.style.display = 'none';
            if (btnCl) btnCl.style.display = 'none';
            return;
        }
        if (btnCl) btnCl.style.display = '';
        bar.style.display = 'flex';
        const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        bar.innerHTML = '<span style="color:#92400e;font-weight:700;flex-shrink:0"><i class="fas fa-filter me-1"></i>Filtros activos:</span>' +
            active.map(([col, vals]) => {
                const label = ctblLabelCol(col);
                const preview = [...vals].slice(0, 3).map(esc).join(', ') + (vals.size > 3 ? `… (+${vals.size-3})` : '');
                return `<span class="ctbl-af-tag">${esc(label)}: ${preview}
                    <button onclick="ctblQuitarFiltroCol('${esc(col)}')" title="Quitar filtro">&times;</button>
                </span>`;
            }).join('');
    }

    /** Ordenar tabla por columna */
    window.colabTablaOrdenar = function(col) {
        if (ctblSortCol === col) {
            ctblSortAsc = !ctblSortAsc;
        } else {
            ctblSortCol = col;
            ctblSortAsc = true;
        }
        document.querySelectorAll('[id^="ctbl-sort-"]').forEach(el => el.textContent = '');
        const arrow = document.getElementById('ctbl-sort-' + col);
        if (arrow) arrow.textContent = ctblSortAsc ? '?' : '?';
        colabTablaFiltrar();
    };

    /* ---------------- FILTROS POR COLUMNA (estilo Excel) ---------------- */

    window.ctblAbrirFiltroCol = function(col, e) {
        const popup = document.getElementById('ctbl-cfp');
        const title = document.getElementById('ctbl-cfp-title');
        const qInp  = document.getElementById('ctbl-cfp-q');
        if (!popup) return;

        // Valores Únicos de toda la data (sin filtros de columna excepto los demás)
        const allVals = [...new Set(ctblAllData.map(r => String(r[col] ?? '').trim() || '—'))]
            .sort((a,b) => {
                // orden numérico si posible
                const na = parseFloat(a), nb = parseFloat(b);
                if (!isNaN(na) && !isNaN(nb)) return na - nb;
                return a.localeCompare(b, 'es', {sensitivity:'base'});
            });

        const label = ctblLabelCol(col);
        _ctblCFP = {
            col,
            allVals,
            tempSel: new Set(_ctblColFilters[col] ?? allVals)
        };
        if (title) title.textContent = `Filtrar: ${label}`;
        if (qInp)  { qInp.value = ''; }

        ctblFiltroColRenderList('');

        // Posicionar popup cerca del botón
        popup.style.visibility = 'hidden';
        popup.style.display = 'flex';
        const btnRect = e.target.getBoundingClientRect();
        const pRect   = popup.getBoundingClientRect();
        const vw = window.innerWidth, vh = window.innerHeight;
        let x = btnRect.left, y = btnRect.bottom + 4;
        if (x + pRect.width  > vw) x = btnRect.right  - pRect.width;
        if (y + pRect.height > vh) y = btnRect.top    - pRect.height - 4;
        popup.style.left = Math.max(4, x) + 'px';
        popup.style.top  = Math.max(4, y) + 'px';
        popup.style.visibility = '';
    };

    function ctblFiltroColRenderList(filter) {
        const listEl = document.getElementById('ctbl-cfp-list');
        if (!listEl) return;
        const q = filter.toLowerCase().trim();
        const shown = q ? _ctblCFP.allVals.filter(v => v.toLowerCase().includes(q)) : _ctblCFP.allVals;
        const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        listEl.innerHTML = shown.map((v, i) => {
            const chk = _ctblCFP.tempSel.has(v) ? 'checked' : '';
            const safe = esc(v);
            return `<label class="ctbl-cfp-item">
                <input type="checkbox" value="${safe}" ${chk}
                       onchange="ctblFiltroColToggle(this.value,this.checked)">
                <span>${safe}</span>
            </label>`;
        }).join('');
        if (!shown.length) listEl.innerHTML = '<div style="color:#94a3b8;font-size:.78rem;padding:.5rem .7rem">Sin coincidencias</div>';
    }

    window.ctblFiltroColSearch = function(q) { ctblFiltroColRenderList(q); };

    window.ctblFiltroColToggle = function(val, checked) {
        if (checked) _ctblCFP.tempSel.add(val);
        else         _ctblCFP.tempSel.delete(val);
    };

    window.ctblFiltroColSelAll = function(all) {
        _ctblCFP.tempSel = all ? new Set(_ctblCFP.allVals) : new Set();
        ctblFiltroColRenderList(document.getElementById('ctbl-cfp-q')?.value || '');
    };

    window.ctblFiltroColAplicar = function() {
        const col = _ctblCFP.col;
        if (!col) return;
        // Si tienen todos los valores seleccionados = sin filtro
        const allSelected = _ctblCFP.tempSel.size === _ctblCFP.allVals.length;
        _ctblColFilters[col] = allSelected ? null : new Set(_ctblCFP.tempSel);
        // Actualizar botón en thead
        const btn = document.getElementById('ctbl-cfb-' + col);
        if (btn) {
            const hasF = !allSelected && _ctblCFP.tempSel.size > 0;
            btn.classList.toggle('has-filter', hasF);
        }
        ctblFiltroColCerrar();
        colabTablaFiltrar();
    };

    window.ctblFiltroColCerrar = function() {
        const popup = document.getElementById('ctbl-cfp');
        if (popup) popup.style.display = 'none';
    };

    window.ctblQuitarFiltroCol = function(col) {
        _ctblColFilters[col] = null;
        const btn = document.getElementById('ctbl-cfb-' + col);
        if (btn) btn.classList.remove('has-filter');
        colabTablaFiltrar();
    };

    window.ctblLimpiarFiltrosCols = function() {
        Object.keys(_ctblColFilters).forEach(k => _ctblColFilters[k] = null);
        document.querySelectorAll('.ctbl-cfb.has-filter').forEach(b => b.classList.remove('has-filter'));
        colabTablaFiltrar();
    };
    /* ------------------------------------------------------ */

    function ctblConstruirFilaHtml(r, dataIndex) {
        const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        const nombreKey = ctblCols.find(k => k === 'nombre') || 'nombre';
        const nombreVal = esc(String(r[nombreKey] ?? '—'));
        const raw = String(gc(r,'amonestaciones') ?? r['amonestaciones'] ?? '').trim();
        const n = raw ? raw.split(/\n/).map(l => l.trim()).filter(Boolean).length : 0;
        const { cls } = semClassify(n);
        const rowCls = cls === 'sem-rojo' ? ' class="ctbl-rojo"' : cls === 'sem-amarillo' ? ' class="ctbl-amarillo"' : '';
        const statusHtml = value => {
            const limpio = String(value || '').trim();
            const esBaja = /^baja$/i.test(limpio);
            const esActivo = /^activo$/i.test(limpio);
            const clsStatus = esBaja ? 'ctbl-status-baja' : esActivo ? 'ctbl-status-activo' : '';
            return clsStatus ? `<span class="ctbl-status-badge ${clsStatus}">${esc(limpio)}</span>` : esc(limpio || '—');
        };
        const allTds = ctblCols.map(col => {
            const v = String(r[col] ?? '').trim() || '—';
            const style = CTBL_WRAP_COLS.has(col) ? ' style="max-width:200px;white-space:normal"' : '';
            const content = /^estatus$/i.test(col)
                ? statusHtml(v)
                : /^fecha\s+de\s+nacimiento$/i.test(col)
                    ? esc(colabFormatBirthDateDisplay(v))
                    : esc(v);
            return `<td${style}>${content}</td>`;
        });
        const semTd = `<td class="ctbl-td-conducta">${colabSemaforoHtml(r, true)}</td>`;
        const gradoAcadIdx = ctblCols.findIndex(k => k === 'grado_academico' || /^grado\s+acad[eé]mico$/i.test(k));
        allTds.splice(gradoAcadIdx >= 0 ? gradoAcadIdx + 1 : 1, 0, semTd);
        return `<tr${rowCls} onclick="colabTablaVerFichaGlobal(${dataIndex})" title="Ver ficha de ${nombreVal}">${allTds.join('')}</tr>`;
    }

    function ctblPrepararRenderCache() {
        ctblRowHtmlCache = new WeakMap();
        ctblRowNodeCache = new WeakMap();
        ctblAllData.forEach((r, index) => ctblRowHtmlCache.set(r, ctblConstruirFilaHtml(r, index)));
    }

    function ctblObtenerFilaNode(r) {
        let node = ctblRowNodeCache.get(r);
        if (node) return node;
        const template = document.createElement('template');
        template.innerHTML = ctblRowHtmlCache.get(r) || ctblConstruirFilaHtml(r, ctblAllData.indexOf(r));
        node = template.content.firstElementChild;
        ctblRowNodeCache.set(r, node);
        return node;
    }

    /** Renderizar filas de la tabla */
    function colabTablaRender() {
        const renderStarted = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const tbody   = document.getElementById('ctbl-tbody');
        const tableEl = document.getElementById('ctbl-table');
        const emptyEl = document.getElementById('ctbl-empty');
        const badge   = document.getElementById('ctbl-badge');

        if (badge) badge.textContent = ctblData.length + (ctblData.length !== ctblAllData.length ? ` / ${ctblAllData.length}` : '');

        if (!ctblData.length) {
            if (tableEl) tableEl.classList.add('d-none');
            if (emptyEl) emptyEl.classList.remove('d-none');
            if (tbody) tbody.replaceChildren();
            return ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - renderStarted;
        }
        if (emptyEl) emptyEl.classList.add('d-none');
        if (tableEl) tableEl.classList.remove('d-none');

        if (tbody) {
            const desired = ctblData.map(ctblObtenerFilaNode);
            for (let i = 0; i < desired.length; i++) {
                if (tbody.children[i] !== desired[i]) tbody.insertBefore(desired[i], tbody.children[i] || null);
            }
            while (tbody.children.length > desired.length) tbody.lastElementChild.remove();
        }
        return ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - renderStarted;
    }

    /** Click en fila: cerrar modal y mostrar ficha */
    window.colabTablaVerFicha = function(idx) {
        const rec = ctblData[idx];
        colabTablaMostrarFicha(rec);
    };

    window.colabTablaVerFichaGlobal = function(idx) {
        const rec = ctblAllData[idx];
        colabTablaMostrarFicha(rec);
    };

    function colabTablaMostrarFicha(rec) {
        if (!rec) return;
        bootstrap.Modal.getInstance(document.getElementById('colabTablaModal'))?.hide();
        // Obtener número de empleado para el input de búsqueda
        const numEmpl = String(gc(rec,'num') || rec['num_empleado'] || '').trim();
        const numInput = document.getElementById('colab-num-input');
        if (numInput && numEmpl) numInput.value = numEmpl;
        renderFicha(rec);
    }

    /** Descargar CSV con todos los campos visibles */
    window.colabDescargarCSV = function() {
        if (!ctblData.length) return;
        const cols    = ctblCols.length ? ctblCols : ['num_empleado','nombre','puesto','plaza','nivel','turno','direccion','subdireccion','gerencia','fecha_ingreso','correo','celular'];
        const headers = cols.map(k => CTBL_COL_LABELS[k] || k);
        const esc = s => `"${String(s ?? '').replace(/"/g,'""')}"`;
        const rows = [headers.join(',')];
        ctblData.forEach(r => {
            rows.push(cols.map(k => esc(String(r[k] ?? ''))).join(','));
        });
        const blob = new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = `colaboradores_${new Date().toISOString().slice(0,10)}.csv`;
        a.click(); URL.revokeObjectURL(url);
    };

    /* ---------- MODAL TARJETA DE CUMPLEAÑOS ---------- */
    window.bdayAbrirTarjeta = function(idx) {
        const item = (window._bdayProximos || [])[idx];
        if (!item) return;
        const { r, f, d } = item;
        const MESES = ['enero','febrero','marzo','abril','mayo','junio',
                       'julio','agosto','septiembre','octubre','noviembre','diciembre'];
        const nombre   = (val(gc(r,'nombre'))  || '').trim();
        const puesto   = (val(gc(r,'puesto'))  || '').trim();
        const direccion= (val(gc(r,'direccion'))|| '').trim();
        const fechaStr = `${f.dia} de ${MESES[f.mes]}`;
        const esHoy    = d === 0;

        const nombreEl  = document.getElementById('bday-modal-nombre');
        const puestoEl  = document.getElementById('bday-modal-puesto');
        const msgEl     = document.getElementById('bday-modal-msg');
        if (nombreEl) nombreEl.textContent = nombre;
        if (puestoEl) puestoEl.textContent = (puesto ? puesto + (direccion ? ' — ' + direccion : '') : direccion);
        if (msgEl) {
            const intros = esHoy
                ? ['¡Hoy es tu gran día!', '¡Feliz cumpleaños!', 'En este día tan especial para ti,']
                : ['Con motivo de tu próximo cumpleaños,', `El ${fechaStr} es un día muy especial,`, 'Anticipándonos a tu gran día,'];
            const intro = intros[Math.floor(Math.random() * intros.length)];
            msgEl.innerHTML = intro + ' todo el equipo del <strong>Aeropuerto Internacional Felipe \u00c1ngeles<\/strong> te desea un maravilloso cumplea\u00f1os lleno de logros, bienestar y grandes vuelos por venir. Tu compromiso y dedicaci\u00f3n son el motor de nuestra operaci\u00f3n. \u2708\uFE0F<br><br><em>\u00a1Que este nuevo a\u00f1o de vida est\u00e9 lleno de cielos despejados y destinos maravillosos!<\/em>';
        }

        // Guardar Índice para imprimir
        window._bdayActiveIdx = idx;
        window._bdayBlob = null; // reset blob cache for new person

        const bg = document.getElementById('bday-card-modal-bg');
        if (bg) bg.classList.add('open');
    };

    window.bdayCardCerrar = function(evt) {
        if (evt && evt.target !== document.getElementById('bday-card-modal-bg')) return;
        const bg = document.getElementById('bday-card-modal-bg');
        if (bg) bg.classList.remove('open');
        window._bdayBlob = null;
    };

    window.bdayCopiarImagen = function() {
        var btn = document.getElementById('bday-btn-copy');
        var nombre = (document.getElementById('bday-modal-nombre') && document.getElementById('bday-modal-nombre').textContent || 'colaborador').trim();
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Copiando...'; }

        function _doClipboard(blob) {
            if (!navigator.clipboard || !window.ClipboardItem) {
                var a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'Feliz_Cumpleanios_' + nombre.replace(/\s+/g,'_') + '.png';
                a.click();
                alert('Tu navegador no permite copiar. La imagen fue descargada.');
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-copy"></i> Copiar imagen'; }
                return;
            }
            navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                .then(function() {
                    if (btn) { btn.innerHTML = '<i class="fas fa-check"></i> \u00a1Copiada!'; }
                    setTimeout(function() { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-copy"></i> Copiar imagen'; } }, 2200);
                })
                .catch(function() {
                    var a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = 'Feliz_Cumpleanios_' + nombre.replace(/\s+/g,'_') + '.png';
                    a.click();
                    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-copy"></i> Copiar imagen'; }
                });
        }

        if (window._bdayBlob) { _doClipboard(window._bdayBlob); return; }
        if (typeof html2canvas === 'undefined') { alert('Libreria no disponible.'); if (btn) { btn.disabled = false; } return; }
        var modal = document.getElementById('bday-card-modal');
        var fc = modal.querySelector('.bday-card-actions');
        if (fc) fc.style.display = 'none';
        html2canvas(modal, { scale:2, useCORS:true, allowTaint:false, logging:false, backgroundColor:'#0f1b3d' })
            .then(function(cv) {
                if (fc) fc.style.display = '';
                cv.toBlob(function(blob) { window._bdayBlob = blob; _doClipboard(blob); }, 'image/png');
            })
            .catch(function() {
                if (fc) fc.style.display = '';
                alert('No se pudo generar la imagen.');
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-copy"></i> Copiar imagen'; }
            });
    };

    window.bdayCompartirWA = function() {
        var btn = document.getElementById('bday-btn-wa');
        var nombre = (document.getElementById('bday-modal-nombre') && document.getElementById('bday-modal-nombre').textContent || 'colaborador').trim();
        var fileName = 'Feliz_Cumpleanios_' + nombre.replace(/\s+/g, '_') + '.png';
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ...'; }

        function _doShare(blob) {
            var file = new File([blob], fileName, { type: 'image/png' });
            function _fallback() {
                var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileName; a.click();
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fab fa-whatsapp"></i> Compartir'; }
                setTimeout(function() { alert('Imagen descargada. Arrastrala a WhatsApp Web.'); }, 600);
            }
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                navigator.share({ files: [file], title: '\u00a1Feliz Cumplea\u00f1os! - AIFA', text: '\u00a1Feliz Cumplea\u00f1os, ' + nombre + '! \uD83C\uDF82' })
                    .then(function() { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fab fa-whatsapp"></i> Compartir'; } })
                    .catch(function(e) { if (e.name !== 'AbortError') { _fallback(); } else { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fab fa-whatsapp"></i> Compartir'; } } });
            } else {
                _fallback();
            }
        }

        if (window._bdayBlob) { _doShare(window._bdayBlob); return; }
        if (typeof html2canvas === 'undefined') { alert('Libreria no disponible.'); if (btn) { btn.disabled = false; } return; }
        var modal = document.getElementById('bday-card-modal');
        var fc = modal.querySelector('.bday-card-actions');
        if (fc) fc.style.display = 'none';
        html2canvas(modal, { scale:2, useCORS:true, allowTaint:false, logging:false, backgroundColor:'#0f1b3d' })
            .then(function(cv) {
                if (fc) fc.style.display = '';
                cv.toBlob(function(blob) { window._bdayBlob = blob; _doShare(blob); }, 'image/png');
            })
            .catch(function() {
                if (fc) fc.style.display = '';
                alert('No se pudo generar la imagen.');
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fab fa-whatsapp"></i> Compartir'; }
            });
    };

    window.bdayEnviarCorreo = function() {
        var btn = document.getElementById('bday-btn-email');
        var idx = window._bdayActiveIdx;
        if (idx === undefined || idx === null) {
            alert('No hay colaborador activo.'); return;
        }
        var item = (window._bdayProximos || [])[idx];
        if (!item || !item.r) { alert('No se encontraron datos del colaborador.'); return; }
        var row = item.r;
        var correo = gc(row, 'correo_personal') || gc(row, 'correo');
        var nombre = gc(row, 'nombre') || 'Colaborador';

        console.log('[BdayCorreo] Columnas detectadas:', window._colabCols || colabCols);
        console.log('[BdayCorreo] row completo:', row);
        console.log('[BdayCorreo] correo detectado:', correo, '| nombre:', nombre);

        if (!correo) {
            alert('Este colaborador no tiene correo personal registrado.\n\nPuedes agregarlo en la ficha del colaborador (campo "Correo Personal").');
            return;
        }

        if (!confirm('Se enviar… la tarjeta de cumpleaños a:\n\n\uD83D\uDC64 ' + nombre + '\n\uD83D\uDCE7 ' + correo + '\n\n¿Continuar?')) return;

        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...'; }

        var fnUrl = 'https://fgstncvuuhpgyzmjceyr.supabase.co/functions/v1/send-birthday-emails';
        var anonKey = (window.supabaseClient && window.supabaseClient.supabaseKey)
            || (typeof SUPABASE_ANON_KEY !== 'undefined' && SUPABASE_ANON_KEY)
            || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnc3RuY3Z1dWhwZ3l6bWpjZXlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYyMjQ1MTEsImV4cCI6MjA2MTgwMDUxMX0.8-JDwjFNzHkxPVJUlRbHTSl3W2b48y_97FjR2GJ9IjI';

        console.log('[BdayCorreo] Enviando a función:', fnUrl);
        console.log('[BdayCorreo] anonKey presente:', !!anonKey);

        fetch(fnUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + anonKey
            },
            body: JSON.stringify({ email: correo, nombre: nombre })
        })
        .then(function(res) {
            console.log('[BdayCorreo] HTTP status:', res.status);
            return res.json();
        })
        .then(function(data) {
            console.log('[BdayCorreo] Respuesta función:', data);
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-envelope"></i> Enviar correo'; }
            if (data && data.sent > 0) {
                btn.innerHTML = '<i class="fas fa-check"></i> \u00a1Enviado!';
                alert('\u2705 Correo enviado exitosamente a:\n' + correo + '\n\nRevisa que no haya caído en SPAM.');
                setTimeout(function() { if (btn) btn.innerHTML = '<i class="fas fa-envelope"></i> Enviar correo'; }, 4000);
            } else {
                var errDetail = (data && data.detail && data.detail[0] && data.detail[0].error) || JSON.stringify(data) || 'Error desconocido';
                alert('\u274C No se pudo enviar el correo.\n\nDetalle: ' + errDetail);
            }
        })
        .catch(function(err) {
            console.error('[BdayCorreo] Error de red:', err);
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-envelope"></i> Enviar correo'; }
            alert('\u274C Error de red al enviar: ' + err);
        });
    };

    /** Descargar Excel con todos los campos visibles */
    window.colabDescargarExcel = function() {
        if (!ctblData.length) return;
        if (typeof XLSX === 'undefined') {
            alert('La librería Excel aún no ha cargado. Espera un momento e intenta de nuevo.');
            return;
        }
        const cols    = ctblCols.length ? ctblCols : ['num_empleado','nombre','puesto','plaza','nivel','turno','direccion','subdireccion','gerencia','fecha_ingreso','correo','celular'];
        const headers = cols.map(k => CTBL_COL_LABELS[k] || k);
        const wsData  = [headers, ...ctblData.map(r => cols.map(k => String(r[k] ?? '')))];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = cols.map(k => ({ wch: CTBL_WRAP_COLS.has(k) ? 28 : 14 }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Colaboradores');
        XLSX.writeFile(wb, `colaboradores_${new Date().toISOString().slice(0,10)}.xlsx`);
    };

    function colabPrintTimeout(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /** Espera imágenes, hojas de estilo y fuentes sin bloquear indefinidamente la impresión. */
    async function colabWaitForPrintAssets(doc, root, timeoutMs = 6000) {
        if (!doc || !root) return;
        const imageTasks = Array.from(root.querySelectorAll('img[src]')).map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(resolve => {
                img.addEventListener('load', resolve, { once: true });
                img.addEventListener('error', resolve, { once: true });
            });
        });
        const styleTasks = Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).map(link => {
            if (link.sheet) return Promise.resolve();
            return new Promise(resolve => {
                link.addEventListener('load', resolve, { once: true });
                link.addEventListener('error', resolve, { once: true });
            });
        });
        const fontTask = doc.fonts?.ready ? Promise.resolve(doc.fonts.ready).catch(() => {}) : Promise.resolve();
        await Promise.race([
            Promise.allSettled([...imageTasks, ...styleTasks, fontTask]),
            colabPrintTimeout(timeoutMs)
        ]);
    }

    /** Completa las consultas asíncronas que forman parte de la ficha antes de clonarla. */
    async function colabPrepareFichaForPrint() {
        const c = colabCurrentRow;
        const fichaEl = document.getElementById('colab-ficha-content');
        if (!c || !fichaEl) return;
        const numEmpl = val(gc(c, 'num'));
        const tasks = [
            renderAmonestaciones(c),
            renderComentarios(c),
            colabCargarCursos(numEmpl),
            vacLoadForColab(numEmpl),
            loadDocPhoto('colab-foto-ine', val(gc(c, 'foto_ine')), 'ine_front'),
            loadDocPhoto('colab-foto-ine-rev', val(gc(c, 'foto_ine_rev')), 'ine_back'),
            loadDocPhoto('colab-foto-cred', val(gc(c, 'foto_cred')), 'credential')
        ];
        const results = await Promise.allSettled(tasks);
        const failed = results.filter(result => result.status === 'rejected');
        if (failed.length) {
            console.warn('[Colaboradores][Impresión] Algunos recursos no pudieron actualizarse antes de imprimir', {
                failedResources: failed.length
            });
        }
        await colabWaitForPrintAssets(document, fichaEl, 5000);
    }

    /** Imprimir ficha completa del colaborador en una ventana limpia y multipágina. */
    window.colabImprimirFicha = async function() {
        const fichaEl = document.getElementById('colab-ficha-content');
        if (!fichaEl) return;

        // Abrir de inmediato para conservar el gesto del usuario y evitar el bloqueo de popups.
        const printWin = window.open('', '_blank', 'width=960,height=800');
        if (!printWin) {
            alert('Tu navegador bloqueó la ventana de impresión.\nPermite ventanas emergentes para esta página e inténtalo de nuevo.');
            return;
        }
        // Escapar los cierres evita que servidores de desarrollo que inyectan
        // live-reload interpreten este HTML interno como el cierre del documento principal.
        printWin.document.write('<!doctype html><html lang="es"><meta charset="utf-8"><title>Preparando ficha…</title><body style="font-family:Segoe UI,Arial,sans-serif;padding:2rem;color:#334155">Preparando la ficha completa para impresión…<\/body><\/html>');
        printWin.document.close();

        const previousCourseSearch = typeof _ccSearchText === 'string' ? _ccSearchText : '';
        const numEmpl = colabCurrentRow ? val(gc(colabCurrentRow, 'num')) : null;
        let courseFilterRestored = false;
        const restoreCourseFilter = () => {
            if (courseFilterRestored) return;
            courseFilterRestored = true;
            _ccSearchText = previousCourseSearch;
            if (previousCourseSearch && numEmpl) {
                colabCargarCursos(numEmpl).catch(error => {
                    console.warn('[Colaboradores][Impresión] No se pudo restaurar el filtro visual de cursos', {
                        code: error?.code || 'COURSE_FILTER_RESTORE_FAILED'
                    });
                });
            }
        };

        try {
            // La ficha impresa siempre incluye todos los cursos, aunque haya una búsqueda activa en pantalla.
            _ccSearchText = '';
            await colabPrepareFichaForPrint();

            // Extraer CSS del bloque <style> de la sección colaboradores.
            const sectionEl  = document.getElementById('colaboradores-section');
            const styleEl    = sectionEl ? sectionEl.querySelector('style') : null;
            const sectionCSS = styleEl ? styleEl.textContent : '';

            // Base URL para imágenes relativas.
            const baseHref = window.location.origin +
                window.location.pathname.replace(/\/[^\/]*$/, '/');

            const printRoot = document.createElement('main');
            printRoot.id = 'colab-print-document';
            printRoot.appendChild(fichaEl.cloneNode(true));
            const vacationPanel = document.getElementById('colab-vac-panel');
            if (vacationPanel) {
                const vacationClone = vacationPanel.cloneNode(true);
                vacationClone.classList.remove('d-none');
                printRoot.appendChild(vacationClone);
            }
            printRoot.querySelector('#colab-cv-inline-preview')?.remove();
            printRoot.querySelectorAll('*').forEach(node => {
                Array.from(node.attributes || []).forEach(attribute => {
                    if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name);
                });
                node.removeAttribute('draggable');
            });
            const fichaHTML = printRoot.outerHTML;
            restoreCourseFilter();

            const html = '<!DOCTYPE html>\n' +
                '<html lang="es"><head>\n' +
                '<meta charset="UTF-8">\n' +
                '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
                '<title>Ficha del Colaborador<\/title>\n' +
                '<base href="' + baseHref + '">\n' +
                '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" crossorigin="anonymous">\n' +
                '<' + 'style>\n' +
                ':root{--col-blue:#1558d6;--col-green:#2e7d32;--col-red:#c62828;--col-text:#1a2540;--col-muted:#7a8499;}\n' +
                '*{box-sizing:border-box;}\n' +
                'html,body{height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important;}\n' +
                'body{background:#fff;font-family:"Segoe UI",Arial,sans-serif;font-size:11.5px;margin:0;padding:0;}\n' +
                sectionCSS + '\n' +
                '.colab-action-bar,' +
                '.colab-btn-print,.colab-btn-edit,.colab-btn-delete,' +
                '.colab-cv-actions,#colab-cv-inline-preview,' +
                '.ca-btn-attach,.ca-actions,' +
                '#colab-cursos-toolbar,#colab-cursos-dropzone,' +
                '#vac-add-wrap,.vac-per-delete,.colab-vac-panel .ms-auto,' +
                '.colab-cursos-actions,.cc-btn,.colab-cursos-folder-rename-btn,.cc-folder-dropzone,' +
                '.colab-historial-panel,.colab-historial-plaza-panel{display:none!important;}\n' +
                '.colab-ficha{position:static!important;width:100%!important;height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important;box-shadow:none!important;border:none!important;border-radius:0!important;transform:none!important;}\n' +
                '.colab-ficha-body{height:auto!important;max-height:none!important;overflow:visible!important;}\n' +
                '.colab-tabla td,.colab-tabla th{font-size:10.5px!important;}\n' +
                '@media print{' +
                '@page{size:A4 portrait;margin:10mm;}' +
                'body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
                '.colab-ficha::before{opacity:0.05!important;}' +
                '}\n' +
                '<\/style><\/head><body>' +
                fichaHTML +
                '<\/body><\/html>';

            if (printWin.closed) return;
            printWin.document.open();
            printWin.document.write(html);
            printWin.document.close();

            await Promise.race([
                new Promise(resolve => {
                    if (printWin.document.readyState === 'complete') resolve();
                    else printWin.addEventListener('load', resolve, { once: true });
                }),
                colabPrintTimeout(6000)
            ]);
            await colabWaitForPrintAssets(printWin.document, printWin.document.body, 6000);
            await new Promise(resolve => printWin.requestAnimationFrame(() => printWin.requestAnimationFrame(resolve)));
            if (!printWin.closed) {
                printWin.focus();
                printWin.print();
            }
        } catch (error) {
            restoreCourseFilter();
            console.error('[Colaboradores][Impresión] No se pudo preparar la ficha', {
                code: error?.code || 'PRINT_PREPARATION_FAILED',
                message: error?.message || String(error)
            });
            if (!printWin.closed) printWin.close();
            alert('No se pudo preparar la ficha completa para impresión. Intenta nuevamente.');
        }
    };

    /** Mostrar/ocultar botón "Nuevo Colaborador" según permisos */
    function colabActualizarBotonesAdmin() {
        const btnNuevo = document.getElementById('colab-btn-nuevo');
        if (btnNuevo) btnNuevo.classList.toggle('d-none', !colabCanEdit());
        const btnMasiva = document.getElementById('colab-btn-masiva-cursos');
        if (btnMasiva) btnMasiva.classList.toggle('d-none', !colabCanEdit());
        const btnHistorial = document.getElementById('colab-btn-historial-cambios');
        if (btnHistorial) btnHistorial.classList.toggle('d-none', !colabPuedeVerHistorial());
    }

    /* ==============================================================
       VACACIONES DE COLABORADORES
       - Almacenado en agenda_2026.vacaciones (JSONB array)
       - 20 días/año · hasta 4 períodos sin restricción de días/período
       - Alerta cuando hay solapamiento entre colaboradores
       ============================================================== */

    let _vacCurrentNumEmpl = null; // empleado mostrado en el panel
    let _vacAllCache       = [];   // períodos planos para el calendario global
    let _vacCalDayMap      = {};   // 'YYYY-MM-DD' → [{...periodo, _nom, _num, _foto, _puesto}]

    /** Rellena el selector de año del panel con los últimos 3 años */
    function _vacInitAnioSelect() {
        const sel = document.getElementById('vac-panel-anio');
        if (!sel || sel.options.length) return;
        const cur = new Date().getFullYear();
        for (let y = cur - 1; y <= cur + 1; y++) {
            const opt = document.createElement('option');
            opt.value = y; opt.textContent = y;
            if (y === cur) opt.selected = true;
            sel.appendChild(opt);
        }
    }

    /** Lee el array vacaciones del empleado desde agenda_2026 */
    async function _vacFetchArray(numEmpl) {
        const client = window.supabaseClient || await window.ensureSupabaseClient?.();
        if (!client) return [];
        const numCol = colabCols?.num;
        if (!numCol) return [];
        const safeCol = /[\s.]/.test(numCol) ? `"${numCol}"` : numCol;
        const { data, error } = await client
            .from('agenda_2026')
            .select(`"${numCol}", vacaciones`)
            .eq(safeCol, numEmpl)
            .single();
        if (error || !data) return [];
        return Array.isArray(data.vacaciones) ? data.vacaciones : [];
    }

    /** Persiste el array actualizado en agenda_2026 */
    async function _vacSaveArray(numEmpl, arr) {
        if (!colabRequireEdit()) throw new Error(COLAB_EDIT_DENIED_MSG);
        const client = window.supabaseClient || await window.ensureSupabaseClient?.();
        if (!client) throw new Error('Supabase no disponible');
        const numCol = colabCols?.num;
        if (!numCol) throw new Error('Columna num_empleado no detectada');
        const safeCol = /[\s.]/.test(numCol) ? `"${numCol}"` : numCol;
        const { error } = await client
            .from('agenda_2026')
            .update({ vacaciones: arr })
            .eq(safeCol, numEmpl);
        if (error) throw error;
    }

    /** Carga y renderiza los períodos de vacaciones del colaborador activo */
    async function vacLoadForColab(numEmpl) {
        _vacInitAnioSelect();
        const num = numEmpl || _vacCurrentNumEmpl;
        if (!num) return;
        _vacCurrentNumEmpl = num;

        const anioSel = document.getElementById('vac-panel-anio');
        const anio = anioSel ? parseInt(anioSel.value) : new Date().getFullYear();

        const panel = document.getElementById('colab-vac-panel');
        if (panel) panel.classList.remove('d-none');
        const addWrap = document.getElementById('vac-add-wrap');
        if (addWrap) addWrap.classList.toggle('d-none', !colabCanEdit());

        try {
            const todos = await _vacFetchArray(num);
            const delAnio = todos.filter(r => r.anio === anio);
            // ordenar por fecha inicio
            delAnio.sort((a,b) => (a.fecha_inicio||'') < (b.fecha_inicio||'') ? -1 : 1);
            _vacRenderPanel(delAnio, anio);
        } catch (err) {
            console.warn('[Vacaciones] Error al cargar:', err?.message || err);
            _vacRenderPanel([], anio);
        }
    }

    /** Renderiza las tarjetas de períodos y la barra de progreso */
    function _vacRenderPanel(registros, anio) {
        const grid = document.getElementById('vac-period-grid');
        const bar  = document.getElementById('vac-progress-inner');
        const used = document.getElementById('vac-dias-usados');
        const rest = document.getElementById('vac-dias-restantes');

        const activos   = registros.filter(r => r.estado !== 'cancelado');
        const totalDias = activos.reduce((s, r) => s + (r.dias_totales || 0), 0);
        const restantes = Math.max(0, 20 - totalDias);
        const pct       = Math.min(100, (totalDias / 20) * 100);

        if (used) used.textContent = totalDias;
        if (rest) rest.textContent = restantes;
        if (bar) {
            bar.style.width = pct + '%';
            bar.className   = 'vac-progress-inner' + (totalDias >= 20 ? ' full' : totalDias > 20 ? ' over' : '');
        }
        const badgeEl = document.getElementById('colab-vac-anio-badge');
        if (badgeEl) badgeEl.textContent = anio;

        if (!grid) return;
        if (!registros.length) {
            grid.innerHTML = '<div class="vac-empty"><i class="fas fa-umbrella-beach"></i>Sin períodos registrados este año</div>';
            return;
        }
        grid.innerHTML = registros.map(r => {
            const inicio = _vacFmt(r.fecha_inicio);
            const fin    = _vacFmt(r.fecha_fin);
            const cls    = `estado-${r.estado || 'programado'}`;
            const canDel = colabCanEdit()
                ? `<button class="vac-per-delete" title="Eliminar período" onclick="vacEliminar('${r.id}')"><i class="fas fa-trash-alt"></i></button>` : '';
            return `<div class="vac-period-card ${cls}">
                ${canDel}
                <div class="vac-per-num">Período ${r.periodo_num || '?'}</div>
                <div class="vac-per-dates"><i class="fas fa-calendar-day me-1" style="color:#0288d1"></i>${inicio} → ${fin}</div>
                <div class="vac-per-dias">${r.dias_totales || '?'} días naturales</div>
                <span class="vac-per-estado ${r.estado || 'programado'}">${(r.estado||'programado').charAt(0).toUpperCase()+(r.estado||'programado').slice(1)}</span>
                ${r.observaciones ? `<div class="vac-per-obs">${_vacEsc(r.observaciones)}</div>` : ''}
            </div>`;
        }).join('');
    }

    /** Formatea fecha ISO a d/m/aa legible */
    function _vacFmt(s) {
        if (!s) return '—';
        const [y, m, d] = s.split('-');
        const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        return `${parseInt(d)} ${meses[parseInt(m)-1]} ${y}`;
    }
    function _vacEsc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    /** Abre el modal para agregar un período */
    function vacAbrirModal() {
        if (!colabRequireEdit()) return;
        if (!_vacCurrentNumEmpl) { alert('Primero selecciona un colaborador.'); return; }
        const row    = colabCurrentRow;
        const nombre = row && typeof val === 'function' ? val(gc(row,'nombre')) : '';
        document.getElementById('vac-modal-nombre').textContent = nombre || 'Colaborador';
        document.getElementById('vac-modal-num').textContent    = _vacCurrentNumEmpl;
        document.getElementById('vac-fecha-inicio').value       = '';
        document.getElementById('vac-fecha-fin').value          = '';
        document.getElementById('vac-observaciones').value      = '';
        document.getElementById('vac-dias-calc').textContent    = '';
        const alertEl = document.getElementById('vac-overlap-alert-modal');
        if (alertEl) alertEl.classList.add('d-none');
        // Mostrar días ya usados
        const usedEl = document.getElementById('vac-dias-usados');
        document.getElementById('vac-modal-dias-usados').textContent =
            (usedEl ? usedEl.textContent : '?') + ' / 20';
        // Auto-seleccionar siguiente período libre (basado en cuántos hay ya)
        // contamos períodos activos del año actual
        const anioSel = document.getElementById('vac-panel-anio');
        const anio    = anioSel ? parseInt(anioSel.value) : new Date().getFullYear();
        // contaremos al abrir; usar siguiente al mayor periodo_num existente
        _vacFetchArray(_vacCurrentNumEmpl).then(todos => {
            const delAnio = todos.filter(r => r.anio === anio && r.estado !== 'cancelado');
            const maxPer  = delAnio.reduce((m,r) => Math.max(m, r.periodo_num||0), 0);
            const selEl   = document.getElementById('vac-periodo-num');
            if (selEl) selEl.value = Math.min(4, maxPer + 1);
        }).catch(() => {});
        new bootstrap.Modal(document.getElementById('colabVacModal')).show();
    }

    /** Auto-completa la fecha fin (inicio + 4 días = 5 días por defecto) */
    function vacAutoFechaFin() {
        const ini = document.getElementById('vac-fecha-inicio').value;
        if (!ini) return;
        const d = new Date(ini + 'T00:00:00');
        d.setDate(d.getDate() + 4);
        document.getElementById('vac-fecha-fin').value = d.toISOString().slice(0,10);
        vacValidarFechas();
    }

    /** Cuenta días hábiles (L–V) entre dos fechas ISO inclusive */
    function _vacCountWorkDays(ini, fin) {
        const d1 = new Date(ini + 'T00:00:00');
        const d2 = new Date(fin + 'T00:00:00');
        let count = 0;
        for (let d = new Date(d1); d <= d2; d.setDate(d.getDate() + 1)) {
            const dow = d.getDay();
            if (dow !== 0 && dow !== 6) count++;
        }
        return count;
    }

    /** Valida fechas y muestra días hábiles calculados + alerta de solapamiento */
    async function vacValidarFechas() {
        const ini    = document.getElementById('vac-fecha-inicio').value;
        const fin    = document.getElementById('vac-fecha-fin').value;
        const calcEl = document.getElementById('vac-dias-calc');
        const alertEl = document.getElementById('vac-overlap-alert-modal');
        const btn    = document.getElementById('vac-btn-guardar');
        if (!ini || !fin) { if (calcEl) calcEl.textContent = ''; return; }
        const dIni = new Date(ini + 'T00:00:00');
        const dFin = new Date(fin + 'T00:00:00');
        if (dFin < dIni) {
            if (calcEl) calcEl.textContent = '⚠ La fecha fin debe ser posterior al inicio.';
            if (btn) btn.disabled = true; return;
        }

        // ── Validar elegibilidad por año aniversario ──
        const ingStr = (typeof gc === 'function' && colabCurrentRow) ? (gc(colabCurrentRow, 'fecha_ingreso') || '') : '';
        if (ingStr) {
            const anivInfo = _vacGetAnivYear(ingStr, ini);
            if (anivInfo && !anivInfo.eligible) {
                const fmtAniv = anivInfo.firstAniv.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
                if (calcEl) calcEl.innerHTML = `<span class="text-danger fw-semibold"><i class="fas fa-ban me-1"></i>Sin derecho a vacaciones aún. El colaborador cumple 1 año el <strong>${fmtAniv}</strong>.</span>`;
                if (btn) btn.disabled = true;
                return;
            }
        }

        const dias = _vacCountWorkDays(ini, fin);
        if (dias > 20) {
            if (calcEl) calcEl.textContent = `⚠ Máximo 20 días hábiles (L–V). Seleccionaste ${dias}.`;
            if (btn) btn.disabled = true; return;
        }

        // ── Verificar días restantes en el año aniversario ──
        if (ingStr && _vacCurrentNumEmpl) {
            try {
                const todos = await _vacFetchArray(_vacCurrentNumEmpl);
                const anivInfo = _vacGetAnivYear(ingStr, ini);
                if (anivInfo?.eligible && anivInfo.isoIni) {
                    const usadosAniv = todos
                        .filter(r => r.estado !== 'cancelado' && r.fecha_inicio >= anivInfo.isoIni && r.fecha_inicio <= anivInfo.isoFin)
                        .reduce((s, r) => s + (r.dias_totales || 0), 0);
                    const restantes = Math.max(0, 20 - usadosAniv);
                    if (usadosAniv + dias > 20) {
                        if (calcEl) calcEl.innerHTML = `<span class="text-danger fw-semibold"><i class="fas fa-exclamation-triangle me-1"></i>Solo quedan <strong>${restantes}</strong> días hábiles en este período aniversario (ya usados: ${usadosAniv}/20).</span>`;
                        if (btn) btn.disabled = true; return;
                    }
                    if (calcEl) calcEl.innerHTML = `<span class="text-success"><i class="fas fa-check me-1"></i>${dias} día${dias>1?'s':''} hábil${dias>1?'es':''}.</span> <span class="text-muted">Restan <strong>${restantes - dias}</strong> días en tu período aniversario.</span>`;
                } else {
                    if (calcEl) calcEl.innerHTML = `<span class="text-success"><i class="fas fa-check me-1"></i>${dias} día${dias>1?'s':''} hábil${dias>1?'es':''}.</span>`;
                }
            } catch (_) {
                if (calcEl) calcEl.innerHTML = `<span class="text-success"><i class="fas fa-check me-1"></i>${dias} día${dias>1?'s':''} hábil${dias>1?'es':''}.</span>`;
            }
        } else {
            if (calcEl) calcEl.innerHTML = `<span class="text-success"><i class="fas fa-check me-1"></i>${dias} día${dias>1?'s':''} hábil${dias>1?'es':''}. (L–V)</span>`;
        }

        if (btn) btn.disabled = false;
        await vacChequearSolapamiento(ini, fin, alertEl);
    }

    /** Busca vacaciones de OTROS colaboradores en el mismo rango (en colabCache) */
    async function vacChequearSolapamiento(ini, fin, alertEl) {
        if (!alertEl) return;
        try {
            // Usamos colabCache para no hacer extra queries — está en memoria
            const cache = window.colabCache || [];
            const solapados = [];
            for (const emp of cache) {
                const numEmp = typeof val === 'function' ? val(gc(emp,'num')) : '';
                if (!numEmp || numEmp === _vacCurrentNumEmpl) continue;
                const vacs = Array.isArray(emp.vacaciones) ? emp.vacaciones : [];
                for (const v of vacs) {
                    if (v.estado === 'cancelado') continue;
                    if (v.fecha_inicio <= fin && v.fecha_fin >= ini) {
                        solapados.push(typeof val === 'function' ? val(gc(emp,'nombre')) : numEmp);
                        break;
                    }
                }
            }
            if (solapados.length) {
                const nombres = [...new Set(solapados)].slice(0,3).join(', ');
                alertEl.innerHTML = `<i class="fas fa-exclamation-triangle me-1"></i>
                    <strong>¡Atención!</strong> ${solapados.length} colaborador${solapados.length>1?'es':''} ya ${solapados.length>1?'tienen':'tiene'} vacaciones en estas fechas: <strong>${nombres}</strong>${solapados.length>3?' y otros más.':'.'}`;
                alertEl.classList.remove('d-none');
            } else {
                alertEl.classList.add('d-none');
            }
        } catch (_) { alertEl.classList.add('d-none'); }
    }

    /** Guarda el período de vacaciones en agenda_2026.vacaciones */
    async function vacGuardar() {
        if (!colabRequireEdit()) return;
        const ini = document.getElementById('vac-fecha-inicio').value;
        const fin = document.getElementById('vac-fecha-fin').value;
        const per = parseInt(document.getElementById('vac-periodo-num').value);
        const est = document.getElementById('vac-estado').value;
        const obs = document.getElementById('vac-observaciones').value.trim();
        const btn = document.getElementById('vac-btn-guardar');

        if (!ini || !fin) { alert('Ingresa las fechas de inicio y fin.'); return; }
        const dIni = new Date(ini + 'T00:00:00');
        const dFin = new Date(fin + 'T00:00:00');
        if (dFin < dIni) { alert('La fecha fin debe ser posterior al inicio.'); return; }
        const dias = _vacCountWorkDays(ini, fin);
        if (dias > 20) { alert(`Máximo 20 días hábiles (L–V) por período.`); return; }

        // ── Validación de año aniversario ──────────────────────────
        const ingStr = (typeof gc === 'function' && colabCurrentRow) ? (gc(colabCurrentRow, 'fecha_ingreso') || '') : '';
        if (ingStr) {
            const anivInfo = _vacGetAnivYear(ingStr, ini);
            if (!anivInfo || !anivInfo.eligible) {
                const fmtAniv = anivInfo?.firstAniv
                    ? anivInfo.firstAniv.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
                    : '(fecha no calculada)';
                alert(`Este colaborador aún no ha cumplido 1 año en la empresa.\nLas vacaciones se pueden programar a partir del ${fmtAniv}.`);
                return;
            }
            // Verificar que no exceda 20 días en el período aniversario
            if (anivInfo.isoIni) {
                const todosCheck = await _vacFetchArray(_vacCurrentNumEmpl);
                const usadosAniv = todosCheck
                    .filter(r => r.estado !== 'cancelado' && r.fecha_inicio >= anivInfo.isoIni && r.fecha_inicio <= anivInfo.isoFin)
                    .reduce((s, r) => s + (r.dias_totales || 0), 0);
                if (usadosAniv + dias > 20) {
                    const restantes = Math.max(0, 20 - usadosAniv);
                    const fmtI = anivInfo.anivIni.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
                    const fmtF = anivInfo.anivFin.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
                    alert(`Solo quedan ${restantes} día${restantes!==1?'s':''} hábil${restantes!==1?'es':''} disponibles en el período aniversario ${fmtI} – ${fmtF}.\n(Ya programados: ${usadosAniv} de 20 días. Los días no utilizados no se acumulan.)`);
                    return;
                }
            }
        }
        // ──────────────────────────────────────────────────────────

        const anioSel = document.getElementById('ce-vac-anio') || document.getElementById('vac-panel-anio');
        const anio    = parseInt(anioSel?.value) || dIni.getFullYear();
        const creado_por = (() => { try { return JSON.parse(sessionStorage.getItem('user')||'{}').email || ''; } catch(_) { return ''; } })();

        if (btn) btn.disabled = true;
        try {
            const todos  = await _vacFetchArray(_vacCurrentNumEmpl);
            const nuevo  = {
                id: Date.now() + '-' + Math.random().toString(36).slice(2,8),
                anio, periodo_num: per,
                fecha_inicio: ini, fecha_fin: fin,
                dias_totales: dias, estado: est,
                observaciones: obs || null,
                creado_por: creado_por || null,
                creado_en: new Date().toISOString()
            };
            await _vacSaveArray(_vacCurrentNumEmpl, [...todos, nuevo]);
            // Actualizar colabCache local para que el detector de solapamiento sea inmediato
            if (colabCache) {
                const numCol = colabCols?.num;
                const emp = numCol ? colabCache.find(r => String(r[numCol]) === String(_vacCurrentNumEmpl)) : null;
                if (emp) emp.vacaciones = [...todos, nuevo];
            }
            bootstrap.Modal.getInstance(document.getElementById('colabVacModal'))?.hide();
            await vacLoadForColab(_vacCurrentNumEmpl);
            // También refrescar pestaña del modal de edición si está activa
            if (document.getElementById('cedit-vac')?.classList.contains('active')) {
                vacEditCargar();
            }
            _vacToast('✅ Período guardado correctamente.');
        } catch (err) {
            alert('Error al guardar: ' + (err?.message || err));
            if (btn) btn.disabled = false;
        }
    }

    /** Elimina un período de vacaciones por su id local */
    async function vacEliminar(id) {
        if (!colabRequireEdit()) return;
        if (!confirm('¿Eliminar este período de vacaciones?')) return;
        try {
            const todos    = await _vacFetchArray(_vacCurrentNumEmpl);
            const filtrado = todos.filter(r => r.id !== id);
            await _vacSaveArray(_vacCurrentNumEmpl, filtrado);
            // Actualizar cache local
            if (colabCache) {
                const numCol = colabCols?.num;
                const emp = numCol ? colabCache.find(r => String(r[numCol]) === String(_vacCurrentNumEmpl)) : null;
                if (emp) emp.vacaciones = filtrado;
            }
            await vacLoadForColab(_vacCurrentNumEmpl);
            // También refrescar pestaña del modal de edición si está activa
            if (document.getElementById('cedit-vac')?.classList.contains('active')) {
                vacEditCargar();
            }
            _vacToast('🗑 Período eliminado.');
        } catch (err) {
            alert('Error al eliminar: ' + (err?.message || err));
        }
    }

    /** Abre el calendario global de vacaciones */
    function vacCalAbrir() {
        new bootstrap.Modal(document.getElementById('colabVacCalModal')).show();
        vacCalCargar();
    }

    /** Carga todos los períodos del año desde el caché de agenda_2026 */
    async function vacCalCargar() {
        const anio = parseInt(document.getElementById('vac-cal-anio-filter')?.value || new Date().getFullYear());
        const grid = document.getElementById('vac-cal-grid');
        if (grid) grid.innerHTML = '<div class="text-center text-muted py-4"><i class="fas fa-circle-notch fa-spin me-2"></i>Cargando…</div>';
        try {
            // Asegurarse de que colabCache está cargado
            const empleados = await colabCargarTodos();
            const numCol    = colabCols?.num;
            const nomCol    = colabCols?.nombre;
            const fotoCol   = colabCols?.foto;
            const puestoCol = colabCols?.puesto;
            const areaCol   = colabCols?.coordinacion || colabCols?.gerencia || colabCols?.subdireccion || colabCols?.direccion;
            // Aplanar todos los períodos del año
            _vacAllCache = [];
            for (const emp of empleados) {
                const vacs = Array.isArray(emp.vacaciones) ? emp.vacaciones : [];
                const num  = numCol ? String(emp[numCol] || '') : '';
                const nom  = nomCol ? String(emp[nomCol] || '') : num;
                const foto = fotoCol ? (emp[fotoCol] || '') : '';
                const puesto = puestoCol ? (emp[puestoCol] || '') : '';
                // Área: coordinación → gerencia → subdirección → dirección (primer valor disponible)
                const area = [
                    colabCols?.coordinacion ? emp[colabCols.coordinacion] : '',
                    colabCols?.gerencia     ? emp[colabCols.gerencia]     : '',
                    colabCols?.subdireccion ? emp[colabCols.subdireccion] : '',
                    colabCols?.direccion    ? emp[colabCols.direccion]    : '',
                ].map(v => String(v||'').trim()).find(v => v) || '';
                for (const v of vacs) {
                    if (v.anio === anio) {
                        _vacAllCache.push({ ...v, _num: num, _nom: nom, _foto: foto, _puesto: puesto, _area: area });
                    }
                }
            }
            _vacAllCache.sort((a,b) => (a.fecha_inicio||'') < (b.fecha_inicio||'') ? -1 : 1);
            vacCalFiltrar();
            _vacDetectarSolapamientosGlobales(_vacAllCache);
        } catch (err) {
            if (grid) grid.innerHTML = `<div class="text-center text-danger py-4"><i class="fas fa-exclamation-circle me-2"></i>${err?.message || err}</div>`;
        }
    }

    /** Filtra y renderiza el calendario global como grilla de meses */
    function vacCalFiltrar() {
        const estado = document.getElementById('vac-cal-estado-filter')?.value || '';
        const busq   = (document.getElementById('vac-cal-search')?.value || '').toLowerCase().trim();
        const anio   = parseInt(document.getElementById('vac-cal-anio-filter')?.value || new Date().getFullYear());
        const grid   = document.getElementById('vac-cal-grid');
        const count  = document.getElementById('vac-cal-count');
        let lista = _vacAllCache;
        if (estado) lista = lista.filter(r => r.estado === estado);
        if (busq)   lista = lista.filter(r =>
            (r._nom||'').toLowerCase().includes(busq) ||
            (r._num||'').toLowerCase().includes(busq)
        );
        const total = lista.filter(r => r.estado !== 'cancelado').length;
        if (count) count.textContent = total + ' período' + (total !== 1 ? 's' : '');
        if (!grid) return;
        grid.innerHTML = _vacBuildCalendar(lista, anio);
        _vacCalInitEvents(grid);
    }

    /** Wires up tooltip + click delegation on the calendar grid */
    function _vacCalInitEvents(grid) {
        if (!grid) return;
        // Remove previous listeners by cloning (fast)
        const fresh = grid.cloneNode(true);
        grid.parentNode.replaceChild(fresh, grid);

        const tip = document.getElementById('vac-day-tip');

        fresh.addEventListener('mousemove', function(e) {
            const day = e.target.closest('.vac-day.has-vac');
            if (!day || !tip) return;
            const key = day.dataset.key;
            const vacs = _vacCalDayMap[key];
            if (!vacs || !vacs.length) return;

            const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
            const [y,m,d] = key.split('-').map(Number);
            const dateObj  = new Date(y, m-1, d);
            const dateLabel = `${DIAS[dateObj.getDay()]} ${d}/${m}/${y}`;

            const activos = vacs.filter(v => v.estado !== 'cancelado');
            const MAX_SHOW = 4;
            let rows = vacs.slice(0, MAX_SHOW).map(v => {
                const st = v.estado || 'programado';
                const nom = v._nom || v._num || '—';
                return `<div class="tip-row"><span class="tip-dot ${st}"></span><span class="tip-name">${nom}</span></div>`;
            }).join('');
            if (vacs.length > MAX_SHOW) rows += `<div class="tip-more">+${vacs.length - MAX_SHOW} más…</div>`;
            const overlapHtml = activos.length > 1
                ? `<div class="tip-overlap"><i class="fas fa-exclamation-triangle me-1"></i>${activos.length} colaboradores simultáneos</div>` : '';
            tip.innerHTML = `<div class="tip-date"><i class="fas fa-calendar-day me-1"></i>${dateLabel}</div>${rows}${overlapHtml}<div class="tip-hint">Clic para ver detalles</div>`;

            // Position
            const vw = window.innerWidth, vh = window.innerHeight;
            let tx = e.clientX + 14, ty = e.clientY + 14;
            tip.classList.add('visible');
            const tw = tip.offsetWidth, tH = tip.offsetHeight;
            if (tx + tw > vw - 8) tx = e.clientX - tw - 10;
            if (ty + tH > vh - 8) ty = e.clientY - tH - 10;
            tip.style.left = tx + 'px';
            tip.style.top  = ty + 'px';
        });

        fresh.addEventListener('mouseleave', function() {
            if (tip) { tip.classList.remove('visible'); tip.innerHTML = ''; }
        });

        fresh.addEventListener('click', function(e) {
            const day = e.target.closest('.vac-day.has-vac');
            if (!day) return;
            if (tip) { tip.classList.remove('visible'); tip.innerHTML = ''; }
            vacCalPopupOpen(day.dataset.key, day);
        });
    }

    /** Construye el HTML del calendario anual de vacaciones */
    function _vacBuildCalendar(lista, anio) {
        // Poblar _vacCalDayMap global
        _vacCalDayMap = {};
        lista.forEach(r => {
            if (!r.fecha_inicio || !r.fecha_fin) return;
            const ini = new Date(r.fecha_inicio + 'T00:00:00');
            const fin = new Date(r.fecha_fin + 'T00:00:00');
            for (let d = new Date(ini); d <= fin; d.setDate(d.getDate() + 1)) {
                const key = d.toISOString().slice(0, 10);
                if (!_vacCalDayMap[key]) _vacCalDayMap[key] = [];
                _vacCalDayMap[key].push(r);
            }
        });
        const todayStr = new Date().toISOString().slice(0, 10);
        const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        let html = `<div class="vac-legend">
            <span class="vac-leg programado">Programado</span>
            <span class="vac-leg disfrutado">Disfrutado</span>
            <span class="vac-leg cancelado">Cancelado</span>
            <span style="font-size:.72rem;color:#90a4ae;margin-left:.6rem"><i class="fas fa-info-circle me-1"></i>Días hábiles (L–V) cuentan hacia el límite de 20 días</span>
        </div><div class="vac-months-grid">`;
        for (let m = 0; m < 12; m++) {
            const lastDay  = new Date(anio, m + 1, 0).getDate();
            let startDow   = new Date(anio, m, 1).getDay();
            startDow = startDow === 0 ? 6 : startDow - 1; // L=0
            html += `<div class="vac-month-block"><div class="vac-month-name">${meses[m]}</div>`;
            html += '<div class="vac-dow-row"><span>L</span><span>M</span><span>X</span><span>J</span><span>V</span><span class="we">S</span><span class="we">D</span></div>';
            html += '<div class="vac-days-grid">';
            for (let i = 0; i < startDow; i++) html += '<div class="vac-day empty"></div>';
            for (let d = 1; d <= lastDay; d++) {
                const date   = new Date(anio, m, d);
                const key    = date.toISOString().slice(0, 10);
                const dow    = date.getDay();
                const isWE   = dow === 0 || dow === 6;
                const isToday = key === todayStr;
                const vacs   = _vacCalDayMap[key] || [];
                let cls = 'vac-day';
                if (isWE) cls += ' weekend';
                if (isToday) cls += ' today';
                if (vacs.length > 0) {
                    const activos = vacs.filter(v => v.estado !== 'cancelado');
                    if (activos.length > 1) {
                        cls += ' has-vac has-multi';
                    } else if (activos.length === 1) {
                        cls += ` has-vac vac-${activos[0].estado || 'programado'}`;
                    } else {
                        cls += ' has-vac vac-cancelado';
                    }
                }
                const dataKey = vacs.length > 0 ? ` data-key="${key}"` : '';
                html += `<div class="${cls}"${dataKey}>${d}</div>`;
            }
            html += '</div></div>'; // vac-days-grid / vac-month-block
        }
        html += '</div>'; // vac-months-grid
        return html;
    }

    /** Detecta solapamientos globales y muestra alerta */
    function _vacDetectarSolapamientosGlobales(lista) {
        const alertEl = document.getElementById('vac-global-overlap-alert');
        if (!alertEl) return;
        const activos = lista.filter(r => r.estado !== 'cancelado');
        const solapados = [];
        for (let i = 0; i < activos.length; i++) {
            for (let j = i + 1; j < activos.length; j++) {
                const a = activos[i], b = activos[j];
                if (a._num === b._num) continue;
                if (a.fecha_inicio <= b.fecha_fin && a.fecha_fin >= b.fecha_inicio) {
                    const key = [a._num, b._num].sort().join('|');
                    if (!solapados.includes(key)) solapados.push(key);
                }
            }
        }
        if (!solapados.length) { alertEl.innerHTML = ''; return; }
        alertEl.innerHTML = `<div class="vac-overlap-alert mb-2">
            <i class="fas fa-exclamation-triangle me-1"></i>
            <strong>¡Alerta de solapamiento!</strong> Se detectaron ${solapados.length} par${solapados.length>1?'es':''} de colaboradores con vacaciones en fechas que se cruzan.
        </div>`;
    }

    /** Abre el popup de detalle de un día del calendario global */
    function vacCalPopupOpen(key, anchorEl) {
        const popup = document.getElementById('vac-day-popup');
        const title = document.getElementById('vdp-title');
        const body  = document.getElementById('vdp-body');
        if (!popup || !title || !body) return;

        const vacs = _vacCalDayMap[key] || [];
        if (!vacs.length) return;

        const DIAS  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
        const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
        const [y,m,d] = key.split('-').map(Number);
        const dateObj = new Date(y, m-1, d);
        const dLabel  = `${DIAS[dateObj.getDay()].charAt(0).toUpperCase()+DIAS[dateObj.getDay()].slice(1)} ${d} de ${MESES[m-1]} ${y}`;
        title.innerHTML = `<i class="fas fa-calendar-day me-1"></i>${dLabel}<small>${vacs.length} período${vacs.length!==1?'s':''}</small>`;

        const activos = vacs.filter(v => v.estado !== 'cancelado');
        let overlapHtml = '';
        if (activos.length > 1) {
            overlapHtml = `<div class="vdp-overlap"><i class="fas fa-exclamation-triangle"></i>Solapamiento: ${activos.length} colaboradores este día</div>`;
        }

        const ESTADO_ICON = { programado: '🏖️', disfrutado: '✅', cancelado: '❌' };
        const fmtDate = s => {
            if (!s) return '?';
            const [y, mo, d] = s.split('-');
            return `${d}-${mo}-${y.slice(2)}`;
        };
        const rows = vacs.map(v => {
            const st   = v.estado || 'programado';
            const nom  = v._nom  || v._num || '—';
            const num  = v._num  || '';
            const psto = v._puesto || '';
            const area = v._area  || '';
            const ini  = fmtDate(v.fecha_inicio);
            const fin  = fmtDate(v.fecha_fin);
            const dias = v.dias_totales || '?';
            const initials = nom.split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase() || '?';
            const fotoHtml = v._foto
                ? `<img src="${v._foto}" alt="${nom}" loading="lazy" onerror="this.parentNode.textContent='${initials}'">`
                : initials;
            const numSafe = encodeURIComponent(num).replace(/'/g,"\\'");
            return `<div class="vdp-colab">
                <div class="vdp-avatar">${fotoHtml}</div>
                <div class="vdp-info">
                    <span class="vdp-name" onclick="vacCalAbrirColab('${numSafe}')" title="Ver tarjeta de ${nom}">${nom}</span>
                    <div class="vdp-num">${num}${psto ? ' · ' : ''}<span class="vdp-puesto">${psto}</span></div>
                    ${area ? `<div class="vdp-area"><i class="fas fa-building me-1" style="opacity:.45"></i>${area}</div>` : ''}
                    <div class="vdp-dates"><i class="fas fa-calendar-minus me-1" style="opacity:.5"></i>${ini} → ${fin} · <strong>${dias} días</strong></div>
                    <span class="vdp-badge ${st}">${ESTADO_ICON[st]||''} ${st.charAt(0).toUpperCase()+st.slice(1)}</span>
                </div>
            </div>`;
        }).join('');

        body.innerHTML = overlapHtml + rows;
        popup.classList.add('visible');

        // Posicionar cerca del día clicado, dentro de la ventana
        const vw = window.innerWidth, vh = window.innerHeight;
        let px, py;
        if (anchorEl) {
            const r = anchorEl.getBoundingClientRect();
            px = r.right + 8;
            py = r.top;
        } else {
            px = vw / 2 - 160;
            py = vh / 2 - 120;
        }
        popup.style.left = '0'; popup.style.top = '0';
        const pw = popup.offsetWidth || 330, pH = popup.offsetHeight || 200;
        if (px + pw > vw - 10) px = Math.max(8, (anchorEl ? anchorEl.getBoundingClientRect().left - pw - 8 : vw/2-pw/2));
        if (py + pH > vh - 10) py = Math.max(8, vh - pH - 10);
        popup.style.left = px + 'px';
        popup.style.top  = py + 'px';

        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', _vacCalPopupOutside, { once: true, capture: true });
        }, 0);
    }

    function _vacCalPopupOutside(e) {
        const popup = document.getElementById('vac-day-popup');
        if (popup && !popup.contains(e.target)) vacCalPopupClose();
    }

    function vacCalPopupClose() {
        const popup = document.getElementById('vac-day-popup');
        if (popup) popup.classList.remove('visible');
        document.removeEventListener('click', _vacCalPopupOutside, true);
    }

    /** Navega al colaborador: cierra el modal del calendario y abre su ficha */
    function vacCalAbrirColab(numEmplEncoded) {
        const numEmpl = decodeURIComponent(numEmplEncoded);
        vacCalPopupClose();
        // Cerrar modal del calendario
        const calModal = bootstrap.Modal.getInstance(document.getElementById('colabVacCalModal'));
        if (calModal) calModal.hide();
        // Navegar a sección colaboradores y buscar
        if (typeof window.showSection === 'function') {
            const link = document.querySelector('[onclick*="colaboradores"]') || null;
            window.showSection('colaboradores', link);
        }
        // Pequeño delay para que la sección esté visible antes de buscar
        setTimeout(() => {
            if (typeof window.colabSeleccionarSugerencia === 'function') {
                window.colabSeleccionarSugerencia(numEmpl);
            }
        }, 200);
    }

    /** Mini-toast de confirmación */
    function _vacToast(msg) {
        const t = document.createElement('div');
        t.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;background:#0277bd;color:#fff;padding:.65rem 1.2rem;border-radius:10px;font-size:.85rem;font-weight:600;z-index:9999;box-shadow:0 4px 18px rgba(0,0,0,.25);transition:opacity .4s';
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => { t.style.opacity='0'; setTimeout(()=>t.remove(),400); }, 2800);
    }

    /* ==============================================================
       VACACIONES — PESTAÑA EN MODAL DE EDICIÓN
       ============================================================== */

    /** Rellena el selector de año del tab de edición */
    function _vacInitEditAnioSelect() {
        const sel = document.getElementById('ce-vac-anio');
        if (!sel || sel.options.length) return;
        const cur = new Date().getFullYear();
        for (let y = cur - 1; y <= cur + 1; y++) {
            const opt = document.createElement('option');
            opt.value = y; opt.textContent = y;
            if (y === cur) opt.selected = true;
            sel.appendChild(opt);
        }
    }

    /** Calcula días de vacaciones proporcionales al año de ingreso (siempre 20 si ya pasó) */
    /** Parsea un string de fecha (DD/MM/YYYY o YYYY-MM-DD) → Date, o null */
    function _vacParseIngreso(s) {
        if (!s) return null;
        try {
            let d;
            if (/^\d{2}\/\d{2}\/\d{4}$/.test(String(s))) {
                const [dd, mm, yyyy] = String(s).split('/');
                d = new Date(+yyyy, +mm - 1, +dd);
            } else if (/^\d{4}-\d{2}-\d{2}/.test(String(s))) {
                const [yyyy, mm, dd] = String(s).slice(0, 10).split('-');
                d = new Date(+yyyy, +mm - 1, +dd);
            } else {
                d = new Date(s);
            }
            return isNaN(d.getTime()) ? null : d;
        } catch (_) { return null; }
    }

    /**
     * Dado un string de fecha ingreso y una fecha objetivo (YYYY-MM-DD),
     * devuelve info del año aniversario al que pertenece la fecha objetivo.
     * Retorna { eligible:false, firstAniv } si no ha cumplido 1 año en esa fecha.
     * Retorna { eligible:true, anivNum, anivIni, anivFin, isoIni, isoFin }.
     */
    function _vacGetAnivYear(ingStr, targetStr) {
        const ing = _vacParseIngreso(ingStr);
        if (!ing) return { eligible: true, anivNum: null, anivIni: null, anivFin: null };
        const target = _vacParseIngreso(targetStr);
        if (!target) return null;
        const firstAniv = new Date(ing.getFullYear() + 1, ing.getMonth(), ing.getDate());
        if (target < firstAniv) return { eligible: false, firstAniv };
        for (let n = 1; n <= 50; n++) {
            const anivIni = new Date(ing.getFullYear() + n, ing.getMonth(), ing.getDate());
            const anivFin = new Date(ing.getFullYear() + n + 1, ing.getMonth(), ing.getDate());
            anivFin.setDate(anivFin.getDate() - 1);
            if (target >= anivIni && target <= anivFin) {
                return {
                    eligible: true, anivNum: n,
                    anivIni, anivFin,
                    isoIni: anivIni.toISOString().slice(0, 10),
                    isoFin: anivFin.toISOString().slice(0, 10)
                };
            }
        }
        return { eligible: true, anivNum: null, anivIni: null, anivFin: null };
    }

    /**
     * Devuelve el año aniversario más reciente que EMPIEZA en/antes del
     * 31-dic del año calendario `anio`. Útil para el panel de edición.
     * Retorna { eligible:false, firstAniv } si no es elegible en ese año.
     */
    function _vacGetAnivYearForCal(ingStr, anio) {
        const ing = _vacParseIngreso(ingStr);
        if (!ing) return { eligible: true, anivNum: null };
        const firstAniv = new Date(ing.getFullYear() + 1, ing.getMonth(), ing.getDate());
        const endOfYear = new Date(anio, 11, 31);
        if (firstAniv > endOfYear) return { eligible: false, firstAniv };
        let bestN = 1;
        for (let n = 1; n <= 50; n++) {
            const anivStart = new Date(ing.getFullYear() + n, ing.getMonth(), ing.getDate());
            if (anivStart <= endOfYear) { bestN = n; } else { break; }
        }
        const anivIni = new Date(ing.getFullYear() + bestN, ing.getMonth(), ing.getDate());
        const anivFin = new Date(ing.getFullYear() + bestN + 1, ing.getMonth(), ing.getDate());
        anivFin.setDate(anivFin.getDate() - 1);
        const fmt = d => d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
        return {
            eligible: true, anivNum: bestN,
            anivIni, anivFin,
            isoIni: anivIni.toISOString().slice(0, 10),
            isoFin: anivFin.toISOString().slice(0, 10),
            label: `Período aniversario ${bestN}: ${fmt(anivIni)} – ${fmt(anivFin)}`
        };
    }

    /** (Mantenido por compatibilidad) – ahora delega en _vacGetAnivYearForCal */
    function _vacCalcLimite(fechaIngresoStr, anio) {
        const info = _vacGetAnivYearForCal(fechaIngresoStr, anio);
        return info.eligible ? 20 : 0;
    }

    /** Devuelve texto de antigüedad ("2 años 3 meses") */
    function _vacCalcAntiguedad(fechaIngresoStr) {
        if (!fechaIngresoStr) return '—';
        let ing;
        try {
            if (/\d{2}\/\d{2}\/\d{4}/.test(fechaIngresoStr)) {
                const [d, m, y] = fechaIngresoStr.split('/');
                ing = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
            } else {
                ing = new Date(fechaIngresoStr);
            }
        } catch (_) { return '—'; }
        if (isNaN(ing.getTime())) return '—';
        const hoy = new Date();
        let years = hoy.getFullYear() - ing.getFullYear();
        let months = hoy.getMonth() - ing.getMonth();
        if (months < 0) { years--; months += 12; }
        if (years < 0) return 'Recién ingresado';
        if (years === 0) return months === 0 ? 'Recién ingresado' : `${months} mes${months !== 1 ? 'es' : ''}`;
        return `${years} año${years !== 1 ? 's' : ''}${months > 0 ? ` ${months} mes${months !== 1 ? 'es' : ''}` : ''}`;
    }

    /** Inicializa y carga la pestaña Vacaciones del modal de edición */
    function vacEditInit() {
        _vacInitEditAnioSelect();
        const ingStr = document.getElementById('ce-fecha-ingreso')?.value || '';
        const ingresoEl  = document.getElementById('ce-vac-ingreso');
        const antEl      = document.getElementById('ce-vac-antiguedad');
        if (ingresoEl) ingresoEl.textContent = ingStr || '—';
        if (antEl)     antEl.textContent     = _vacCalcAntiguedad(ingStr);
        vacEditCargar();
    }

    /** Carga y renderiza los períodos de vacaciones en la pestaña del modal de edición */
    async function vacEditCargar() {
        const anioSel = document.getElementById('ce-vac-anio');
        const anio = parseInt(anioSel?.value || new Date().getFullYear());
        const grid    = document.getElementById('ce-vac-grid');
        const addWrap = document.getElementById('ce-vac-add-wrap');
        if (!_vacCurrentNumEmpl) return;
        if (grid) grid.innerHTML = '<div class="text-center py-3"><i class="fas fa-circle-notch fa-spin text-primary"></i> Cargando…</div>';
        try {
            let todos = await _vacFetchArray(_vacCurrentNumEmpl);
            // Reparar registros cuyo anio quedó como NaN (bug de versiones anteriores)
            const hayNaN = todos.some(r => !r.anio || isNaN(r.anio));
            if (hayNaN) {
                todos = todos.map(r => ({
                    ...r,
                    anio: (r.anio && !isNaN(r.anio)) ? r.anio
                        : (r.fecha_inicio ? parseInt(r.fecha_inicio.slice(0, 4)) : new Date().getFullYear())
                }));
                await _vacSaveArray(_vacCurrentNumEmpl, todos);
            }
            // Actualizar cache local
            if (colabCache) {
                const numCol = colabCols?.num;
                const emp = numCol ? colabCache.find(r => String(r[numCol]) === String(_vacCurrentNumEmpl)) : null;
                if (emp) emp.vacaciones = todos;
            }
            const ingStr = document.getElementById('ce-fecha-ingreso')?.value || '';
            // ── Calcular por período aniversario (no por año calendario) ──
            const anivInfo = _vacGetAnivYearForCal(ingStr, anio);
            const limite   = anivInfo.eligible ? 20 : 0;

            // Períodos a mostrar: los del año calendario seleccionado
            const anuales = todos.filter(r => r.anio === anio);
            anuales.sort((a, b) => (a.fecha_inicio || '') < (b.fecha_inicio || '') ? -1 : 1);

            // Días USADOS: contar desde el período aniversario correspondiente
            let usados = 0;
            if (anivInfo.eligible && anivInfo.isoIni) {
                usados = todos
                    .filter(r => r.estado !== 'cancelado' && r.fecha_inicio >= anivInfo.isoIni && r.fecha_inicio <= anivInfo.isoFin)
                    .reduce((s, r) => s + (r.dias_totales || 0), 0);
            } else {
                usados = anuales.filter(r => r.estado !== 'cancelado').reduce((s, r) => s + (r.dias_totales || 0), 0);
            }
            const restantes = Math.max(0, limite - usados);
            const pct = Math.min(100, limite > 0 ? (usados / limite * 100) : 0);

            // ── Mostrar/ocultar banner de elegibilidad ──
            const anivInfoEl = document.getElementById('ce-vac-aniv-info');
            if (anivInfoEl) {
                if (!ingStr) {
                    anivInfoEl.className = 'mb-2 d-none';
                } else if (!anivInfo.eligible) {
                    const fmtAniv = anivInfo.firstAniv.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
                    anivInfoEl.className = 'mb-2';
                    anivInfoEl.innerHTML = `<div class="alert alert-warning py-2 px-3 mb-0 small">
                        <i class="fas fa-clock me-1"></i>
                        <strong>Sin derecho a vacaciones en ${anio}.</strong>
                        Este colaborador cumple su primer año el <strong>${fmtAniv}</strong>. Las vacaciones podrán programarse a partir de esa fecha.
                    </div>`;
                } else if (anivInfo.label) {
                    anivInfoEl.className = 'mb-2';
                    anivInfoEl.innerHTML = `<div class="d-flex align-items-center gap-2 px-2 py-1 rounded" style="background:#f0f9ff;border:1px solid #b3e5fc;font-size:.75rem">
                        <i class="fas fa-calendar-check text-primary"></i>
                        <span class="text-muted">${anivInfo.label}</span>
                        <span class="ms-auto fw-semibold" style="color:#0277bd">${restantes} día${restantes!==1?'s':''} disponible${restantes!==1?'s':''}</span>
                    </div>`;
                }
            }
            // Actualizar indicadores
            const elLimite    = document.getElementById('ce-vac-limite');
            const elUsados    = document.getElementById('ce-vac-usados');
            const elRestantes = document.getElementById('ce-vac-restantes');
            const bar         = document.getElementById('ce-vac-progress');
            if (elLimite)    elLimite.textContent    = limite;
            if (elUsados)    elUsados.textContent    = usados;
            if (elRestantes) elRestantes.textContent = restantes;
            if (bar) {
                bar.style.width = pct + '%';
                bar.className   = 'vac-progress-inner' + (usados > limite ? ' over' : '');
            }
            // Renderizar tarjetas de períodos
            if (!grid) return;
            if (!anuales.length) {
                grid.innerHTML = '<div class="vac-empty"><i class="fas fa-umbrella-beach"></i>Sin períodos registrados este año</div>';
            } else {
                const canDel = colabCanEdit();
                grid.innerHTML = anuales.map(r => {
                    const ini = _vacFmt(r.fecha_inicio);
                    const fin = _vacFmt(r.fecha_fin);
                    const cls = `estado-${r.estado || 'programado'}`;
                    const delBtn = canDel
                        ? `<button class="vac-per-delete" title="Eliminar" onclick="vacEditEliminar('${r.id}')"><i class="fas fa-trash-alt"></i></button>`
                        : '';
                    return `<div class="vac-period-card ${cls}">
                        ${delBtn}
                        <div class="vac-per-num">Período ${r.periodo_num || '?'}</div>
                        <div class="vac-per-dates"><i class="fas fa-calendar-day me-1" style="color:#0288d1"></i>${ini} → ${fin}</div>
                        <div class="vac-per-dias">${r.dias_totales || '?'} días hábiles</div>
                        <span class="vac-per-estado ${r.estado || 'programado'}">${(r.estado || 'programado').charAt(0).toUpperCase() + (r.estado || 'programado').slice(1)}</span>
                        ${r.observaciones ? `<div class="vac-per-obs">${_vacEsc(r.observaciones)}</div>` : ''}
                    </div>`;
                }).join('');
            }
            if (addWrap) addWrap.classList.toggle('d-none', !colabCanEdit() || !anivInfo.eligible);
        } catch (err) {
            if (grid) grid.innerHTML = `<div class="text-danger small p-2"><i class="fas fa-exclamation-circle me-1"></i>${err?.message || err}</div>`;
        }
    }

    /** Elimina un período de vacaciones desde la pestaña del modal de edición */
    async function vacEditEliminar(id) {
        if (!colabRequireEdit()) return;
        if (!confirm('¿Eliminar este período de vacaciones?')) return;
        try {
            const todos    = await _vacFetchArray(_vacCurrentNumEmpl);
            const filtrado = todos.filter(r => r.id !== id);
            await _vacSaveArray(_vacCurrentNumEmpl, filtrado);
            if (colabCache) {
                const numCol = colabCols?.num;
                const emp = numCol ? colabCache.find(r => String(r[numCol]) === String(_vacCurrentNumEmpl)) : null;
                if (emp) emp.vacaciones = filtrado;
            }
            await vacEditCargar();
            _vacToast('🗑 Período eliminado.');
        } catch (err) {
            alert('Error al eliminar: ' + (err?.message || err));
        }
    }

    // Exponer funciones de vacaciones al scope global (requerido por onclick/oninput en HTML)
    window.vacCalAbrir      = vacCalAbrir;
    window.vacCalCargar     = vacCalCargar;
    window.vacCalFiltrar    = vacCalFiltrar;
    window.vacCalPopupClose = vacCalPopupClose;
    window.vacCalAbrirColab = vacCalAbrirColab;
    window.vacAbrirModal    = vacAbrirModal;
    window.vacLoadForColab  = vacLoadForColab;
    window.vacAutoFechaFin  = vacAutoFechaFin;
    window.vacValidarFechas = vacValidarFechas;
    window.vacGuardar       = vacGuardar;
    window.vacEliminar      = vacEliminar;
    window.vacEditInit      = vacEditInit;
    window.vacEditCargar    = vacEditCargar;
    window.vacEditEliminar  = vacEditEliminar;

    // Cerrar popup cuando se cierre el modal del calendario
    document.getElementById('colabVacCalModal')?.addEventListener('hide.bs.modal', vacCalPopupClose);

    /* --------------------------------------------------------------
       CURSOS Y CAPACITACIONES
       -------------------------------------------------------------- */

    const COLAB_CURSOS_BUCKET = 'colab-cursos-pdfs';
    const COLAB_CURSOS_BUCKET_URL = 'https://fgstncvuuhpgyzmjceyr.supabase.co/storage/v1/object/public/colab-cursos-pdfs/';
    const COLAB_CURSOS_WARN_DAYS  = 30;   // días antes del vencimiento para mostrar alerta

    /* -- helpers de fecha -- */
    function ccParseDate(s) {
        if (!s) return null;
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    }
    function ccFormatDate(s) {
        const d = ccParseDate(s);
        if (!d) return '';
        return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    function ccNextDue(curso) {
        if (!curso.es_recurrente || !curso.frecuencia_dias || !curso.fecha_realizacion) return null;
        const base = ccParseDate(curso.fecha_realizacion);
        if (!base) return null;
        // Calcular próxima ocurrencia a partir de hoy
        const today = new Date();
        today.setHours(0,0,0,0);
        const freq = curso.frecuencia_dias * 86400000;
        let next = new Date(base.getTime() + freq);
        while (next < today) next = new Date(next.getTime() + freq);
        return next;
    }
    /* 'ok' | 'warning' | 'expired' | 'none' */
    function ccStatus(curso) {
        if (!curso.es_recurrente) return 'none';
        const next = ccNextDue(curso);
        if (!next) return 'none';
        const today = new Date();
        today.setHours(0,0,0,0);
        const diff = Math.floor((next - today) / 86400000);
        if (diff < 0)                    return 'expired';
        if (diff <= COLAB_CURSOS_WARN_DAYS) return 'warning';
        return 'ok';
    }
    function ccFreqLabel(dias) {
        if (!dias) return '';
        const map = { 90: 'Trimestral', 180: 'Semestral', 365: 'Anual', 730: 'Bianual' };
        return map[dias] || `Cada ${dias} días`;
    }

    /* -- Cargar cursos desde Supabase -- */
    async function colabCargarCursos(numEmpleado) {
        // Cargar carpetas virtuales guardadas en localStorage
        try {
            const stored = localStorage.getItem(`cc_vf_${numEmpleado}`);
            _ccVirtualFolders = new Set(stored ? JSON.parse(stored) : []);
        } catch { _ccVirtualFolders = new Set(); }
        const listEl  = document.getElementById('colab-cursos-list');
        const alertEl = document.getElementById('colab-cursos-alert-banner');
        if (listEl) listEl.innerHTML = '<div class="colab-cursos-empty"><i class="fas fa-circle-notch fa-spin"></i>Cargando cursos…</div>';
        if (alertEl) alertEl.innerHTML = '';
        if (!numEmpleado) {
            if (listEl) listEl.innerHTML = '<div class="colab-cursos-empty"><i class="fas fa-book-open"></i>Sin número de empleado.</div>';
            return;
        }
        try {
            const sb = window.supabaseClient;
            if (!sb) throw new Error('Supabase no disponible');
            const { data, error } = await sb
                .from('colab_cursos')
                .select('*')
                .eq('num_empleado', String(numEmpleado))
                .order('fecha_realizacion', { ascending: false });
            if (error) throw error;
            colabRenderCursos(data || [], numEmpleado);
        } catch (err) {
            console.warn('[Cursos] Error:', err);
            if (listEl) listEl.innerHTML = `<div class="colab-cursos-empty text-danger"><i class="fas fa-exclamation-circle"></i>${err.message || 'Error al cargar cursos.'}</div>`;
        }
    }

    /* -- Render de la lista de cursos en la ficha -- */
    function colabRenderCursos(cursos, numEmpleado) {
        const listEl  = document.getElementById('colab-cursos-list');
        const alertEl = document.getElementById('colab-cursos-alert-banner');
        const heroEl  = document.getElementById('colab-cursos-hero-alert');
        const toolbar = document.getElementById('colab-cursos-toolbar');
        if (!listEl) return;

        const canEdit = colabCanEdit();
        const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

        // Mostrar/ocultar toolbar
        if (toolbar) toolbar.classList.toggle('d-none', !canEdit);

        // Sincronizar selector de orden
        const sortSel = document.getElementById('cc-cursos-sort');
        if (sortSel) sortSel.value = _ccSortOrder;

        // Actualizar datalist de categorías
        colabCursosRefreshCatList(cursos);

        // Contar alertas (sobre el set completo, no filtrado)
        let nExpired = 0, nWarn = 0;
        cursos.forEach(c => {
            const st = ccStatus(c);
            if (st === 'expired') nExpired++;
            else if (st === 'warning') nWarn++;
        });

        // Banner de alerta en la ficha
        if (alertEl) {
            if (nExpired > 0 || nWarn > 0) {
                const cls = nExpired > 0 ? 'danger' : 'warn';
                const ico = nExpired > 0 ? 'fa-exclamation-circle' : 'fa-exclamation-triangle';
                const msg = nExpired > 0
                    ? `${nExpired} curso${nExpired > 1 ? 's' : ''} vencido${nExpired > 1 ? 's' : ''}${nWarn > 0 ? ` — ${nWarn} por vencer` : ''}`
                    : `${nWarn} curso${nWarn > 1 ? 's' : ''} por vencer en los próximos ${COLAB_CURSOS_WARN_DAYS} días`;
                alertEl.innerHTML = `<div class="colab-cursos-banner ${cls} mb-2"><i class="fas ${ico}"></i>${msg}  revisa las fechas de actualización</div>`;
            } else {
                alertEl.innerHTML = '';
            }
        }

        // Píldora en el hero
        if (heroEl) {
            if (nExpired > 0 || nWarn > 0) {
                heroEl.classList.add('visible');
                const pills = [];
                if (nExpired > 0) pills.push(`<span class="colab-cursos-hero-pill danger"><i class="fas fa-exclamation-circle"></i>${nExpired} curso${nExpired>1?'s':''} vencido${nExpired>1?'s':''}</span>`);
                if (nWarn > 0)    pills.push(`<span class="colab-cursos-hero-pill"><i class="fas fa-exclamation-triangle"></i>${nWarn} curso${nWarn>1?'s':''} por vencer</span>`);
                heroEl.innerHTML = pills.join('');
            } else {
                heroEl.classList.remove('visible');
                heroEl.innerHTML = '';
            }
        }

        // Filtrar por búsqueda
        const q = _ccSearchText.toLowerCase().trim();
        const filtered = q ? cursos.filter(c =>
            (c.nombre||'').toLowerCase().includes(q) ||
            (c.descripcion||'').toLowerCase().includes(q) ||
            (c.categoria||'').toLowerCase().includes(q)
        ) : cursos;

        // Lista vacía
        if (!cursos.length) {
            let emptyHtml = `<div class="colab-cursos-empty"><i class="fas fa-book-open"></i>Sin cursos registrados aún.`;
            if (canEdit) emptyHtml += `<br><small>Arrastra un PDF o crea una carpeta con el botón de arriba.</small>`;
            emptyHtml += `</div>`;
            listEl.innerHTML = emptyHtml;
            return;
        }

        // Sin resultados de búsqueda
        if (!filtered.length) {
            listEl.innerHTML = `<div class="colab-cursos-empty"><i class="fas fa-search"></i>No se encontraron cursos para "<strong>${esc(q)}</strong>".</div>`;
            return;
        }

        // Función para resaltar texto buscado
        const hl = text => {
            if (!q) return esc(text);
            const idx = text.toLowerCase().indexOf(q);
            if (idx < 0) return esc(text);
            return esc(text.slice(0, idx)) + `<mark class="cc-search-hl">${esc(text.slice(idx, idx+q.length))}</mark>` + esc(text.slice(idx+q.length));
        };

        // Ordenar
        const orderSt = { expired: 0, warning: 1, ok: 2, none: 3 };
        const sorted = [...filtered].sort((a,b) => {
            if (_ccSortOrder === 'name') return (a.nombre||'').localeCompare(b.nombre||'', 'es');
            if (_ccSortOrder === 'date-desc') return (b.fecha_realizacion||'') > (a.fecha_realizacion||'') ? 1 : -1;
            if (_ccSortOrder === 'date-asc')  return (a.fecha_realizacion||'') > (b.fecha_realizacion||'') ? 1 : -1;
            return (orderSt[ccStatus(a)]||3) - (orderSt[ccStatus(b)]||3);
        });

        // Agrupar por categoría
        const groups = new Map();
        sorted.forEach(c => {
            const cat = (c.categoria || '').trim() || '__none__';
            if (!groups.has(cat)) groups.set(cat, []);
            groups.get(cat).push(c);
        });

        // Añadir carpetas virtuales vacías (sin cursos aún)
        _ccVirtualFolders.forEach(vf => {
            if (!groups.has(vf)) groups.set(vf, []);
        });

        // Mover 'Sin carpeta' al final
        const sortedGroups = [...groups.entries()].sort(([a],[b]) => {
            if (a === '__none__') return 1;
            if (b === '__none__') return -1;
            return a.localeCompare(b, 'es');
        });

        // -- Render de un curso individual --
        const renderCurso = curso => {
            const st    = ccStatus(curso);
            const next  = ccNextDue(curso);
            const iconCls = st === 'expired' ? 'expired' : st === 'warning' ? 'warning' : st === 'ok' ? 'ok' : 'none';
            const iconFa  = st === 'expired' ? 'fa-times-circle' : st === 'warning' ? 'fa-exclamation-triangle' : st === 'ok' ? 'fa-check-circle' : 'fa-graduation-cap';
            const itemCls = st === 'expired' ? ' expired' : st === 'warning' ? ' warning' : '';
            let statusBadge = '';
            if (st === 'expired') statusBadge = `<span class="colab-curso-badge expired"><i class="fas fa-times-circle"></i>Vencido</span>`;
            else if (st === 'warning') {
                const diff = next ? Math.ceil((next - new Date()) / 86400000) : 0;
                statusBadge = `<span class="colab-curso-badge warning"><i class="fas fa-exclamation-triangle"></i>Vence en ${diff} día${diff!==1?'s':''}</span>`;
            } else if (st === 'ok') statusBadge = `<span class="colab-curso-badge ok"><i class="fas fa-check-circle"></i>Vigente</span>`;
            const recurBadge = curso.es_recurrente
                ? `<span class="colab-curso-badge recur"><i class="fas fa-redo"></i>${ccFreqLabel(curso.frecuencia_dias)}</span>`
                : `<span class="colab-curso-badge one-time"><i class="fas fa-file-alt"></i>Inico</span>`;
            const pdfBtns = curso.pdf_url
                ? `<a href="${esc(curso.pdf_url)}" target="_blank" rel="noopener noreferrer" class="cc-btn view-pdf" title="Ver PDF"><i class="fas fa-file-pdf"></i> Ver PDF</a>`
                : (canEdit ? `<label class="cc-btn up-pdf" title="Subir PDF"><i class="fas fa-upload"></i> Subir PDF<input type="file" accept="application/pdf" style="display:none" onchange="colabCursosSubirPdf('${esc(curso.id)}', this)"></label>` : '');
            const delBtn = canEdit ? `<button type="button" class="cc-btn del" title="Eliminar" onclick="event.stopPropagation();colabCursosEliminar('${esc(curso.id)}')"><i class="fas fa-trash-alt"></i></button>` : '';
            let nextInfo = '';
            if (curso.es_recurrente && next) nextInfo = `<span><i class="fas fa-calendar-alt me-1"></i>Próxima: <strong>${ccFormatDate(next.toISOString())}</strong></span>`;
            return `<div class="colab-curso-item${itemCls}" id="cc-item-${esc(curso.id)}"
                data-id="${esc(curso.id)}" data-cat="${esc(curso.categoria||'')}" data-numempl="${esc(numEmpleado)}"
                ${canEdit ? `draggable="true" ondragstart="colabCursoDragStart(event,'${esc(curso.id)}')"
                oncontextmenu="event.preventDefault();event.stopPropagation();colabCursosShowCtxMenu(event,'course',{id:'${esc(curso.id)}',nombre:${JSON.stringify(curso.nombre)},pdfUrl:${JSON.stringify(curso.pdf_url||'')},cat:'${esc(curso.categoria||'')}',numEmpl:'${esc(numEmpleado)}'});"` : ''}>
                <div class="colab-curso-icon ${iconCls}"><i class="fas ${iconFa}"></i></div>
                <div class="colab-curso-body">
                    <div class="colab-curso-name${canEdit?' cc-renameable':''}" title="${esc(curso.nombre)}${canEdit?' · click para renombrar':''}"
                        ${canEdit ? `onclick="colabCursoClickRename('${esc(curso.id)}',this)"` : ''}>${hl(curso.nombre)}</div>
                    ${curso.descripcion ? `<div class="colab-curso-desc">${esc(curso.descripcion)}</div>` : ''}
                    <div class="colab-curso-meta">
                        ${curso.fecha_realizacion ? `<span><i class="fas fa-calendar-check me-1"></i>${ccFormatDate(curso.fecha_realizacion)}</span>` : ''}
                        ${recurBadge}${statusBadge}${nextInfo}
                    </div>
                </div>
                <div class="colab-curso-actions">${pdfBtns}${delBtn}</div>
            </div>`;
        };

        // -- Render de grupos (carpetas) --
        listEl.innerHTML = sortedGroups.map(([cat, items]) => {
            const isNone   = cat === '__none__';
            const catLabel = isNone ? 'Sin carpeta' : cat;
            const catKey   = esc(cat);
            const isOpen   = !_ccClosedFolders.has(cat);
            const grpExp   = items.filter(c => ccStatus(c) === 'expired').length;
            const grpWarn  = items.filter(c => ccStatus(c) === 'warning').length;
            const alertBadges = [
                grpExp  ? `<span class="badge bg-danger ms-1" style="font-size:.65rem">${grpExp} vencido${grpExp>1?'s':''}</span>` : '',
                grpWarn ? `<span class="badge bg-warning text-dark ms-1" style="font-size:.65rem">${grpWarn} por vencer</span>` : ''
            ].join('');
            const ctxHandler = canEdit && !isNone
                ? `oncontextmenu="event.preventDefault();event.stopPropagation();colabCursosShowCtxMenu(event,'folder',{cat:'${catKey}',numEmpl:'${esc(numEmpleado)}'});"`
                : '';
            const renameBtn = canEdit && !isNone
                ? `<button type="button" class="colab-cursos-folder-rename-btn" title="Renombrar carpeta"
                         onclick="event.stopPropagation();colabCursosFolderRename('${catKey}','${esc(numEmpleado)}')">
                     <i class="fas fa-pencil-alt"></i>
                   </button>`
                : '';
            // Drop zone en el cuerpo de la carpeta (visible al arrastrar)
            const dropZone = canEdit
                ? `<div class="cc-folder-dropzone" id="cc-fdz-${catKey}"
                          data-cat="${esc(cat)}" data-numempl="${esc(numEmpleado)}"
                          ondragover="event.preventDefault();this.classList.add('drag-active')"
                          ondragleave="this.classList.remove('drag-active')"
                          ondrop="this.classList.remove('drag-active');colabCursoFolderDrop(event,document.querySelector('.colab-cursos-folder-header[data-cat=\\'${catKey}\\']'))">
                     <i class="fas fa-arrow-down me-1"></i>Suelta aquí para mover a <strong>${catLabel}</strong>
                   </div>`
                : '';
            const emptyMsg = items.length === 0
                ? `<div class="cc-empty-folder-msg"><i class="fas fa-folder-open me-1"></i>Carpeta vacía l arrastra cursos aquí o usa click-derecho</div>`
                : '';
            return `<div class="colab-cursos-folder${isNone?' no-folder':''}">
                <div class="colab-cursos-folder-header${isOpen?'':' collapsed'}"
                     data-cat="${esc(cat)}" data-numempl="${esc(numEmpleado)}"
                     onclick="colabCursosFolderToggle('${catKey}')"
                     ${ctxHandler}
                     ${canEdit ? 'ondragover="colabCursoFolderDragOver(event)" ondragleave="colabCursoFolderDragLeave(event)" ondrop="colabCursoFolderDrop(event,this)"' : ''}>
                    <i class="fas ${isOpen?'fa-folder-open':'fa-folder'} folder-icon"></i>
                    <span class="folder-name">${catLabel}</span>
                    <span class="folder-count">${items.length} curso${items.length!==1?'s':''}</span>
                    ${alertBadges}
                    ${renameBtn}
                    <i class="fas fa-chevron-down folder-chevron"></i>
                </div>
                <div class="colab-cursos-folder-body${isOpen?'':' collapsed'}" id="ccf-body-${catKey}">
                    ${emptyMsg}
                    ${items.map(renderCurso).join('')}
                    ${dropZone}
                </div>
            </div>`;
        }).join('');

        // Activar drop zones si hay arrastre en curso
        if (_ccDraggingId) document.querySelectorAll('.cc-folder-dropzone').forEach(el => el.style.pointerEvents = 'all');
    }

    /* -- Subir PDF de un curso -- */
    window.colabCursosSubirPdf = async function(cursoId, inputEl) {
        if (!colabRequireEdit()) { if (inputEl) inputEl.value = ''; return; }
        const file = inputEl.files[0];
        if (!file) return;
        if (file.size > 15 * 1024 * 1024) { alert('El PDF no puede superar 15 MB.'); inputEl.value = ''; return; }
        const labelEl = inputEl.closest('.cc-btn');
        const origHtml = labelEl ? labelEl.innerHTML : '';
        if (labelEl) labelEl.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        try {
            const sb = window.supabaseClient;
            if (!sb) throw new Error('Supabase no disponible');
            const numEmpl = val(gc(colabCurrentRow, 'num')) || 'desconocido';
            const path = `${numEmpl}/${cursoId}.pdf`;
            const { error: upErr } = await sb.storage.from(COLAB_CURSOS_BUCKET).upload(path, file, { upsert: true, contentType: 'application/pdf' });
            if (upErr) throw upErr;
            const pdfUrl = COLAB_CURSOS_BUCKET_URL + path;
            const { error: dbErr } = await sb.from('colab_cursos').update({ pdf_url: pdfUrl }).eq('id', cursoId);
            if (dbErr) throw dbErr;
            // Recargar lista
            await colabCargarCursos(numEmpl);
        } catch (err) {
            console.error('[Cursos] Error subiendo PDF:', err);
            alert('Error al subir el PDF: ' + (err.message || err));
            if (labelEl) labelEl.innerHTML = origHtml;
        } finally {
            inputEl.value = '';
        }
    };

    /* -- Eliminar curso -- */
    window.colabCursosEliminar = async function(cursoId) {
        if (!colabRequireEdit()) return;
        if (!confirm('¿Eliminar este curso? Esta acción no se puede deshacer.')) return;
        try {
            const sb = window.supabaseClient;
            if (!sb) throw new Error('Supabase no disponible');
            const { error } = await sb.from('colab_cursos').delete().eq('id', cursoId);
            if (error) throw error;
            const numEmpl = val(gc(colabCurrentRow, 'num'));
            await colabCargarCursos(numEmpl);
            // Refrescar también el panel del modal si está abierto
            if (document.getElementById('cedit-cursos')?.classList.contains('active')) {
                colabCursosCargarEdit();
            }
        } catch (err) {
            alert('Error al eliminar: ' + (err.message || err));
        }
    };

    /* -- Cargar cursos en el modal de edición -- */
    window.colabCursosCargarEdit = async function() {
        const listEl = document.getElementById('cedit-cursos-list');
        if (!listEl) return;
        listEl.innerHTML = '<div class="text-center text-muted py-2 small"><span class="spinner-border spinner-border-sm me-1"></span>Cargando…</div>';
        const numEmpl = val(gc(colabCurrentRow, 'num'));
        if (!numEmpl) { listEl.innerHTML = '<div class="text-muted small">Sin número de empleado.</div>'; return; }
        try {
            const sb = window.supabaseClient;
            const { data, error } = await sb.from('colab_cursos').select('*').eq('num_empleado', String(numEmpl)).order('fecha_realizacion', { ascending: false });
            if (error) throw error;
            const cursos = data || [];
            if (!cursos.length) {
                listEl.innerHTML = '<div class="text-muted small py-1">Sin cursos registrados. Usa el botón "Añadir curso" para agregar el primero.</div>';
                return;
            }
            const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
            const freqOpts = (sel) => ['365','180','730','90','custom'].map(v => {
                const lbl = v==='365'?'Anual':v==='180'?'Semestral':v==='730'?'Bianual':v==='90'?'Trimestral':'Personalizado…';
                return `<option value="${v}"${sel===v?' selected':''}>${lbl}</option>`;
            }).join('');
            listEl.innerHTML = cursos.map(c => {
                const st = ccStatus(c);
                const stBadge = st === 'expired'
                    ? `<span class="badge bg-danger-subtle text-danger cedit-curso-row-badge ms-1">Vencido</span>`
                    : st === 'warning'
                        ? `<span class="badge bg-warning-subtle text-warning-emphasis cedit-curso-row-badge ms-1">Por vencer</span>`
                        : st === 'ok'
                            ? `<span class="badge bg-success-subtle text-success cedit-curso-row-badge ms-1">Vigente</span>`
                            : '';
                const recurTag = c.es_recurrente ? `<span class="badge cedit-curso-row-badge ms-1" style="background:#ede9fe;color:#5b21b6">${ccFreqLabel(c.frecuencia_dias)}</span>` : '';
                const pdfBtn = c.pdf_url
                    ? `<a href="${esc(c.pdf_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline-danger btn-sm py-0 px-1" style="font-size:.68rem" title="Ver PDF"><i class="fas fa-file-pdf"></i></a>`
                    : `<label class="btn btn-outline-primary btn-sm py-0 px-1" style="font-size:.68rem" title="Subir PDF"><i class="fas fa-upload"></i><input type="file" accept="application/pdf" style="display:none" onchange="colabCursosSubirPdf('${esc(c.id)}', this)"></label>`;
                const curFreqVal = c.frecuencia_dias && ![365,180,730,90].includes(c.frecuencia_dias) ? 'custom' : String(c.frecuencia_dias||'365');
                const editPanel = `<div class="cedit-curso-edit-panel" id="cep-${esc(c.id)}">
                    <div class="row g-2">
                        <div class="col-12 col-sm-6">
                            <label class="form-label">Nombre del curso</label>
                            <input type="text" class="form-control form-control-sm" id="cep-nombre-${esc(c.id)}" value="${esc(c.nombre)}">
                        </div>
                        <div class="col-12 col-sm-6">
                            <label class="form-label">Descripción (opcional)</label>
                            <input type="text" class="form-control form-control-sm" id="cep-desc-${esc(c.id)}" value="${esc(c.descripcion||'')}">
                        </div>
                        <div class="col-6 col-sm-4">
                            <label class="form-label">Fecha de realización</label>
                            <input type="date" class="form-control form-control-sm" id="cep-fecha-${esc(c.id)}" value="${esc(c.fecha_realizacion||'')}">
                        </div>
                        <div class="col-6 col-sm-4 d-flex align-items-end pb-1">
                            <div class="form-check">
                                <input class="form-check-input" type="checkbox" id="cep-rec-${esc(c.id)}"
                                    ${c.es_recurrente?'checked':''}
                                    onchange="colabCursoEditToggleFreq('${esc(c.id)}',this)">
                                <label class="form-check-label" for="cep-rec-${esc(c.id)}" style="font-size:.78rem">¿Recurrente?</label>
                            </div>
                        </div>
                        <div class="col-12 col-sm-4" id="cep-freq-wrap-${esc(c.id)}" style="${c.es_recurrente?'':'display:none'}">
                            <label class="form-label">Frecuencia</label>
                            <select class="form-select form-select-sm" id="cep-freq-${esc(c.id)}"
                                    onchange="colabCursoEditToggleCustom('${esc(c.id)}',this)">
                                ${freqOpts(curFreqVal)}
                            </select>
                        </div>
                        <div class="col-12 col-sm-4" id="cep-freq-custom-wrap-${esc(c.id)}" style="${c.es_recurrente && curFreqVal==='custom'?'':'display:none'}">
                            <label class="form-label">Días entre repetición</label>
                            <input type="number" min="1" class="form-control form-control-sm" id="cep-freq-custom-${esc(c.id)}"
                                   value="${c.es_recurrente && curFreqVal==='custom' ? (c.frecuencia_dias||'') : ''}" placeholder="Ej: 60">
                        </div>
                        <div class="col-12">
                            <label class="form-label"><i class="fas fa-folder me-1 text-warning"></i>Carpeta (opcional)</label>
                            <input type="text" class="form-control form-control-sm" id="cep-cat-${esc(c.id)}"
                                   list="colab-cursos-cat-list" value="${esc(c.categoria||'')}"
                                   placeholder="Ej: CURSOS TÉCNICOS">
                        </div>
                    </div>
                    <div class="d-flex gap-2 mt-2 align-items-center">
                        <button type="button" class="btn btn-primary btn-sm" onclick="colabCursoEditGuardar('${esc(c.id)}')"><i class="fas fa-save me-1"></i>Guardar cambios</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" onclick="colabCursoEditToggle('${esc(c.id)}')">Cancelar</button>
                        <span id="cep-status-${esc(c.id)}" style="font-size:.78rem"></span>
                    </div>
                </div>`;
                return `<div class="cedit-curso-row">
                    <div class="cedit-curso-row-name" title="${esc(c.nombre)}">${esc(c.nombre)}</div>
                    ${recurTag}${stBadge}
                    <div class="ms-auto d-flex gap-1 align-items-center">
                        <button type="button" class="btn btn-outline-secondary btn-sm py-0 px-1" style="font-size:.68rem" onclick="colabCursoEditToggle('${esc(c.id)}')" title="Editar"><i class="fas fa-pencil-alt"></i></button>
                        ${pdfBtn}
                        <button type="button" class="btn btn-outline-danger btn-sm py-0 px-1" style="font-size:.68rem" onclick="colabCursosEliminar('${esc(c.id)}')" title="Eliminar"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </div>
                ${editPanel}`;
            }).join('');
        } catch (err) {
            listEl.innerHTML = `<div class="text-danger small">${err.message || 'Error'}</div>`;
        }
    };

    /* -- Mostrar / ocultar formulario de agregar curso -- */
    window.colabCursosShowAddForm = function() {
        if (!colabRequireEdit()) return;
        const box = document.getElementById('cedit-cursos-add-box');
        if (!box) return;
        box.classList.add('visible');
        // Resetear campos
        ['cn-curso-nombre','cn-curso-desc'].forEach(id => { const e = document.getElementById(id); if(e) e.value = ''; });
        const fechaEl = document.getElementById('cn-curso-fecha');
        if (fechaEl) fechaEl.value = new Date().toISOString().slice(0,10);
        const recEl = document.getElementById('cn-curso-recurrente');
        if (recEl) { recEl.checked = false; colabCursoToggleFreq(recEl); }
        const statusEl = document.getElementById('cn-cursos-save-status');
        if (statusEl) statusEl.textContent = '';
        document.getElementById('cn-curso-nombre')?.focus();
    };
    window.colabCursosHideAddForm = function() {
        const box = document.getElementById('cedit-cursos-add-box');
        if (box) box.classList.remove('visible');
    };

    /* -- Edición inline en modal (toggle panel, frecuencia, guardar) -- */
    window.colabCursoEditToggle = function(id) {
        if (!colabRequireEdit()) return;
        const panel = document.getElementById('cep-' + id);
        if (!panel) return;
        panel.classList.toggle('open');
        const st = document.getElementById('cep-status-' + id);
        if (st) st.innerHTML = '';
    };
    window.colabCursoEditToggleFreq = function(id, chk) {
        const wrap = document.getElementById('cep-freq-wrap-' + id);
        if (wrap) wrap.style.display = chk?.checked ? '' : 'none';
        if (!chk?.checked) {
            const cw = document.getElementById('cep-freq-custom-wrap-' + id);
            if (cw) cw.style.display = 'none';
        }
    };
    window.colabCursoEditToggleCustom = function(id, sel) {
        const cw = document.getElementById('cep-freq-custom-wrap-' + id);
        if (cw) cw.style.display = sel?.value === 'custom' ? '' : 'none';
    };
    window.colabCursoEditGuardar = async function(id) {
        if (!colabRequireEdit()) return;
        const sb = window.supabaseClient;
        if (!sb || !id) return;
        const nombre = (document.getElementById('cep-nombre-' + id)?.value || '').trim();
        if (!nombre) { document.getElementById('cep-status-' + id).innerHTML = '<span class="text-danger">El nombre es obligatorio.</span>'; return; }
        const desc  = (document.getElementById('cep-desc-' + id)?.value || '').trim() || null;
        const fecha = document.getElementById('cep-fecha-' + id)?.value || null;
        const esRec = !!document.getElementById('cep-rec-' + id)?.checked;
        let frecDias = null;
        if (esRec) {
            const sel = document.getElementById('cep-freq-' + id);
            if (sel?.value === 'custom') {
                const cv = parseInt(document.getElementById('cep-freq-custom-' + id)?.value || '0', 10);
                if (!cv || cv < 1) { document.getElementById('cep-status-' + id).innerHTML = '<span class="text-danger">Ingresa un número válido de días.</span>'; return; }
                frecDias = cv;
            } else {
                frecDias = parseInt(sel?.value || '365', 10);
            }
        }
        const stEl = document.getElementById('cep-status-' + id);
        if (stEl) stEl.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>';
        try {
            const { error } = await sb.from('colab_cursos').update({
                nombre, descripcion: desc, fecha_realizacion: fecha || null,
                es_recurrente: esRec, frecuencia_dias: frecDias,
                categoria: (document.getElementById('cep-cat-' + id)?.value || '').trim() || null
            }).eq('id', id);
            if (error) throw error;
            if (stEl) stEl.innerHTML = '<span class="text-success"><i class="fas fa-check me-1"></i>Guardado</span>';
            setTimeout(async () => {
                await colabCursosCargarEdit();
                const numEmpl = val(gc(colabCurrentRow, 'num'));
                if (numEmpl) colabCargarCursos(numEmpl);
            }, 700);
        } catch (err) {
            if (stEl) stEl.innerHTML = `<span class="text-danger">${err.message || 'Error'}</span>`;
        }
    };

    /* -- Toggle frecuencia -- */
    window.colabCursoToggleFreq = function(chk) {
        const wrap = document.getElementById('cn-curso-freq-wrap');
        if (!wrap) return;
        const checked = chk ? chk.checked : document.getElementById('cn-curso-recurrente')?.checked;
        wrap.style.display = checked ? '' : 'none';
        if (!checked) {
            const cw = document.getElementById('cn-curso-freq-custom-wrap');
            if (cw) cw.style.display = 'none';
        }
    };
    window.colabCursoToggleCustomFreq = function(sel) {
        const cw = document.getElementById('cn-curso-freq-custom-wrap');
        if (cw) cw.style.display = sel && sel.value === 'custom' ? '' : 'none';
    };

    /* -- Guardar nuevo curso -- */
    window.colabCursosGuardarNuevo = async function() {
        if (!colabRequireEdit()) return;
        const statusEl = document.getElementById('cn-cursos-save-status');
        const nombre   = (document.getElementById('cn-curso-nombre')?.value || '').trim();
        if (!nombre) {
            if (statusEl) statusEl.innerHTML = '<span class="text-danger">El nombre del curso es obligatorio.</span>';
            document.getElementById('cn-curso-nombre')?.focus();
            return;
        }
        const numEmpl = val(gc(colabCurrentRow, 'num'));
        if (!numEmpl) {
            if (statusEl) statusEl.innerHTML = '<span class="text-danger">No se detectó el colaborador activo.</span>';
            return;
        }
        const desc         = (document.getElementById('cn-curso-desc')?.value || '').trim() || null;
        const fecha        = document.getElementById('cn-curso-fecha')?.value || null;
        const esRecurrente = !!document.getElementById('cn-curso-recurrente')?.checked;
        let frecDias = null;
        if (esRecurrente) {
            const sel = document.getElementById('cn-curso-freq');
            if (sel?.value === 'custom') {
                const cv = parseInt(document.getElementById('cn-curso-freq-custom')?.value || '0', 10);
                if (!cv || cv < 1) {
                    if (statusEl) statusEl.innerHTML = '<span class="text-danger">Ingresa un número válido de días.</span>';
                    return;
                }
                frecDias = cv;
            } else {
                frecDias = parseInt(sel?.value || '365', 10);
            }
        }
        const userObj  = JSON.parse(sessionStorage.getItem('user') || '{}');
        const userName = userObj.user_metadata?.full_name || userObj.email || 'Sistema';
        const btnSave  = document.querySelector('#cedit-cursos-add-box .btn-primary');
        if (btnSave) { btnSave.disabled = true; btnSave.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Guardando…'; }
        if (statusEl) statusEl.innerHTML = '';
        try {
            const sb = window.supabaseClient;
            if (!sb) throw new Error('Supabase no disponible');
            const { error } = await sb.from('colab_cursos').insert({
                num_empleado:     String(numEmpl),
                nombre:           nombre,
                descripcion:      desc,
                fecha_realizacion:fecha || null,
                es_recurrente:    esRecurrente,
                frecuencia_dias:  frecDias,
                categoria:        (document.getElementById('cn-curso-categoria')?.value || '').trim() || null,
                creado_por:       userName,
            });
            if (error) throw error;
            if (statusEl) statusEl.innerHTML = '<span class="text-success"><i class="fas fa-check me-1"></i>Guardado</span>';
            // Refrescar ambas listas
            colabCursosHideAddForm();
            await colabCursosCargarEdit();
            await colabCargarCursos(numEmpl);
        } catch (err) {
            if (statusEl) statusEl.innerHTML = `<span class="text-danger">${err.message || 'Error al guardar.'}</span>`;
        } finally {
            if (btnSave) { btnSave.disabled = false; btnSave.innerHTML = '<i class="fas fa-save me-1"></i>Guardar'; }
        }
    };

    /* --------------------------------------------------------------
       FIN CURSOS  Drag & Drop
       -------------------------------------------------------------- */

    /* Archivo pendiente para el modal quick-fill */
    let _ccDropFile = null;

    /* Carpetas colapsadas (Set de nombres de categoría cerradas) */
    let _ccClosedFolders  = new Set();
    /* Carpetas vacías creadas por el usuario (persisten en localStorage) */
    let _ccVirtualFolders = new Set();
    /* Texto de búsqueda activo */
    let _ccSearchText     = '';
    /* Orden activo: 'status' | 'name' | 'date-desc' | 'date-asc' */
    let _ccSortOrder      = 'status';
    /* Contexto del menú click-derecho (en window para acceso desde onclick inline) */
    window._ccCtx = null;

    /* Refresca el datalist con las categorías existentes */
    function colabCursosRefreshCatList(cursos) {
        const dl = document.getElementById('colab-cursos-cat-list');
        if (!dl) return;
        const cats = [...new Set((cursos || []).map(c => (c.categoria||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
        dl.innerHTML = cats.map(c => `<option value="${c.replace(/"/g,'&quot;')}">`).join('');
    }

    /* Toggle abrir/cerrar carpeta */
    window.colabCursosFolderToggle = function(catKey) {
        const header = document.querySelector(`.colab-cursos-folder-header[onclick*="'${catKey}'"]`);
        const body   = document.getElementById('ccf-body-' + catKey);
        if (!body) return;
        const isOpen = !body.classList.contains('collapsed');
        if (isOpen) {
            body.classList.add('collapsed');
            header?.classList.add('collapsed');
            _ccClosedFolders.add(catKey);
        } else {
            body.classList.remove('collapsed');
            header?.classList.remove('collapsed');
            _ccClosedFolders.delete(catKey);
        }
    };

    /* Renombrar carpeta: cambia la categoría de todos los cursos del grupo */
    window.colabCursosFolderRename = async function(catKey, numEmpl) {
        const sb = window.supabaseClient;
        if (!sb || !colabRequireEdit()) return;
        const oldCat = catKey === '__none__' ? null : catKey;
        const newName = prompt('Nuevo nombre para la carpeta:', oldCat || '');
        if (newName === null) return; // canceló
        const trimmed = newName.trim() || null;
        try {
            let q = sb.from('colab_cursos').update({ categoria: trimmed }).eq('num_empleado', String(numEmpl));
            if (oldCat) q = q.eq('categoria', oldCat);
            else        q = q.is('categoria', null);
            const { error } = await q;
            if (error) throw error;
            await colabCargarCursos(numEmpl);
        } catch (err) {
            alert('Error al renombrar: ' + (err.message || err));
        }
    };

    /* -----------------------------------------------------------
       GOOGLE DRIVE-STYLE: NUEVA CARPETA, ELIMINAR, BÚSQUEDA,
       ORDEN, MENÚ CONTEXTUAL
       ----------------------------------------------------------- */

    /* -- Nueva carpeta -- */
    window.colabCursosNuevaCarpeta = function() {
        if (!colabRequireEdit()) return;
        const numEmpl = val(gc(colabCurrentRow, 'num'));
        if (!numEmpl) return;
        const name = prompt('Nombre de la nueva carpeta:');
        if (!name?.trim()) return;
        const trimmed = name.trim().toUpperCase();
        _ccVirtualFolders.add(trimmed);
        try { localStorage.setItem(`cc_vf_${numEmpl}`, JSON.stringify([..._ccVirtualFolders])); } catch {}
        colabCargarCursos(numEmpl);
    };

    /* -- Eliminar carpeta (con opción de mantener o borrar cursos) -- */
    window.colabCursosDeleteFolder = async function(cat, numEmpl) {
        if (!colabRequireEdit()) return;
        const sb = window.supabaseClient;
        if (!sb) return;
        // Buscar cuántos cursos tiene la carpeta
        const { data: items } = await sb.from('colab_cursos').select('id').eq('num_empleado', String(numEmpl)).eq('categoria', cat);
        const count = items?.length || 0;
        let msg = `¿Eliminar la carpeta "${cat}"?`;
        if (count > 0) msg += `\n\nTiene ${count} curso${count!==1?'s':''}. ·Qué deseas hacer con ellos?\n\n Aceptar \u2192 mover a "Sin carpeta"\n• Cancelar \u2192 cancelar operación`;
        else msg += '\n\n Aceptar \u2192 eliminar carpeta vacía\n• Cancelar \u2192 cancelar';
        if (!confirm(msg)) return;
        try {
            if (count > 0) {
                const { error } = await sb.from('colab_cursos').update({ categoria: null }).eq('num_empleado', String(numEmpl)).eq('categoria', cat);
                if (error) throw error;
            }
            // Eliminar también de carpetas virtuales
            _ccVirtualFolders.delete(cat);
            try { localStorage.setItem(`cc_vf_${numEmpl}`, JSON.stringify([..._ccVirtualFolders])); } catch {}
            await colabCargarCursos(numEmpl);
        } catch (err) {
            alert('Error: ' + (err.message || err));
        }
    };

    /* -- Filtrar cursos por texto -- */
    window.colabCursosFiltrar = function(text) {
        _ccSearchText = text || '';
        const numEmpl = val(gc(colabCurrentRow, 'num'));
        if (numEmpl) colabCargarCursos(numEmpl);
    };

    /* -- Cambiar orden -- */
    window.colabCursosOrdenar = function(val_) {
        _ccSortOrder = val_ || 'status';
        const numEmpl = val(gc(colabCurrentRow, 'num'));
        if (numEmpl) colabCargarCursos(numEmpl);
    };

    /* ═══════════════════════════════════════════════════════════
       CALENDARIO GLOBAL DE VENCIMIENTOS DE CURSOS
       ═══════════════════════════════════════════════════════════ */

    let _ccalData  = null;   // [ {curso, nombre, nextDue, status} ]
    let _ccalYear  = new Date().getFullYear();
    let _ccalMonth = new Date().getMonth();

    window.cursosCalAbrir = async function() {
        const modal = new bootstrap.Modal(document.getElementById('cursosCalModal'));
        modal.show();
        _ccalYear  = new Date().getFullYear();
        _ccalMonth = new Date().getMonth();
        _ccalData  = null;
        await cursosCal_load();
        cursosCal_render();
        cursosCal_alertaProxima();
    };

    async function cursosCal_load() {
        const gridEl = document.getElementById('ccal-grid');
        const listEl = document.getElementById('ccal-list');
        if (gridEl) gridEl.innerHTML = '<div class="ccal-loading"><i class="fas fa-circle-notch fa-spin me-2"></i>Cargando\u2026</div>';
        if (listEl) listEl.innerHTML = '';
        try {
            let sb = window.supabaseClient;
            if (!sb && typeof window.ensureSupabaseClient === 'function') sb = await window.ensureSupabaseClient();
            if (!sb) throw new Error('Supabase no disponible');

            // 1. Todos los cursos recurrentes con fecha
            const { data: cursos, error: cErr } = await sb
                .from('colab_cursos')
                .select('*')
                .eq('es_recurrente', true)
                .not('fecha_realizacion', 'is', null);
            if (cErr) throw cErr;

            // 2. Nombres de empleados (una sola consulta)
            const nums = [...new Set((cursos || []).map(c => String(c.num_empleado)))];
            let nombreMap = {};
            if (nums.length) {
                const { data: dirRows } = await sb
                    .from('agenda_2026')
                    .select('num_empleado, nombre')
                    .in('num_empleado', nums);
                (dirRows || []).forEach(r => { nombreMap[String(r.num_empleado)] = r.nombre || r.num_empleado; });
            }

            // 3. Calcular pr\u00f3xima fecha y estado
            _ccalData = (cursos || []).map(c => ({
                curso:   c,
                nombre:  nombreMap[String(c.num_empleado)] || c.num_empleado,
                nextDue: ccNextDue(c),
                status:  ccStatus(c)
            })).filter(d => d.nextDue);
        } catch (err) {
            console.warn('[CursoCal] Error:', err);
            _ccalData = [];
            const gridEl2 = document.getElementById('ccal-grid');
            if (gridEl2) gridEl2.innerHTML = `<div class="ccal-empty" style="color:#ef4444"><i class="fas fa-exclamation-circle me-1"></i>${err.message}</div>`;
        }
    }

    function cursosCal_render() {
        const gridEl  = document.getElementById('ccal-grid');
        const listEl  = document.getElementById('ccal-list');
        const labelEl = document.getElementById('ccal-month-label');
        if (!gridEl) return;
        if (!_ccalData) {
            gridEl.innerHTML = '<div class="ccal-loading"><i class="fas fa-circle-notch fa-spin me-2"></i>Cargando\u2026</div>';
            return;
        }

        const MES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        if (labelEl) labelEl.textContent = `${MES[_ccalMonth]} ${_ccalYear}`;

        // Mapa d\u00eda -> eventos del mes visualizado
        const dayMap = {};
        _ccalData.forEach(d => {
            const nd = d.nextDue;
            if (nd.getFullYear() === _ccalYear && nd.getMonth() === _ccalMonth) {
                const k = nd.getDate();
                if (!dayMap[k]) dayMap[k] = [];
                dayMap[k].push(d);
            }
        });

        const today    = new Date(); today.setHours(0,0,0,0);
        const firstDay = new Date(_ccalYear, _ccalMonth, 1);
        const lastDay  = new Date(_ccalYear, _ccalMonth + 1, 0);
        const startDow = (firstDay.getDay() + 6) % 7; // lun=0
        const totalC   = Math.ceil((startDow + lastDay.getDate()) / 7) * 7;
        const DOW      = ['Lun','Mar','Mi\u00e9','Jue','Vie','S\u00e1b','Dom'];

        let html = DOW.map(d => `<div class="ccal-dow">${d}</div>`).join('');
        for (let i = 0; i < totalC; i++) {
            const dayNum = i - startDow + 1;
            if (dayNum < 1 || dayNum > lastDay.getDate()) {
                html += `<div class="ccal-day other-month"></div>`; continue;
            }
            const isToday = new Date(_ccalYear, _ccalMonth, dayNum).getTime() === today.getTime();
            const evs     = dayMap[dayNum] || [];
            let dots = '';
            if (evs.length) {
                const shown = evs.slice(0, 6);
                const rest  = evs.length - shown.length;
                dots = `<div class="ccal-dots">${shown.map(e => `<span class="ccal-dot ${e.status}" title="${(e.nombre+'').replace(/"/g,'')}: ${(e.curso.nombre+'').replace(/"/g,'')}"></span>`).join('')}${rest > 0 ? `<span style="font-size:.6rem;color:#64748b">+${rest}</span>` : ''}</div>`;
            }
            html += `<div class="ccal-day${isToday ? ' today' : ''}" title="${dayNum} ${MES[_ccalMonth]}"><div class="ccal-day-num">${dayNum}</div>${dots}</div>`;
        }
        gridEl.innerHTML = html;

        // Lista detallada del mes
        const monthItems = _ccalData
            .filter(d => d.nextDue.getFullYear() === _ccalYear && d.nextDue.getMonth() === _ccalMonth)
            .sort((a, b) => a.nextDue - b.nextDue);

        if (listEl) {
            if (!monthItems.length) {
                listEl.innerHTML = '<div class="ccal-empty"><i class="fas fa-check-circle me-1" style="color:#22c55e"></i>Sin vencimientos este mes</div>';
            } else {
                const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                listEl.innerHTML = monthItems.map(d => {
                    const ico  = d.status === 'expired' ? 'fa-exclamation-circle' : d.status === 'warning' ? 'fa-exclamation-triangle' : 'fa-check-circle';
                    const dt   = d.nextDue.toLocaleDateString('es-MX', {day:'2-digit', month:'short', year:'numeric'});
                    return `<div class="ccal-list-item"><span class="ccal-list-badge ${d.status}"><i class="fas ${ico}"></i></span><div class="ccal-list-info"><div class="ccal-list-name">${esc(d.nombre)}</div><div class="ccal-list-curso">${esc(d.curso.nombre)}</div></div><span class="ccal-list-date">${dt}</span></div>`;
                }).join('');
            }
        }
    }

    function cursosCal_alertaProxima() {
        if (!_ccalData) return;
        const today = new Date(); today.setHours(0,0,0,0);
        const lim30 = new Date(today.getTime() + 30 * 86400000);

        const proximos = _ccalData
            .filter(d => d.status === 'expired' || (d.nextDue >= today && d.nextDue <= lim30))
            .sort((a, b) => a.nextDue - b.nextDue);

        const sectionEl = document.getElementById('ccal-alert-section');
        const alertEl   = document.getElementById('ccal-alert-list');
        const whaWrap   = document.getElementById('ccal-wha-wrap');
        const whaBtn    = document.getElementById('ccal-wha-btn');

        if (!proximos.length) {
            if (sectionEl) sectionEl.style.display = 'none';
            if (alertEl)   alertEl.innerHTML = '';
            if (whaWrap)   whaWrap.style.display = 'none';
            return;
        }

        if (sectionEl) sectionEl.style.display = '';
        if (whaWrap)   whaWrap.style.display   = '';

        const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        if (alertEl) alertEl.innerHTML = proximos.map(d => {
            const ico     = d.status === 'expired' ? 'fa-exclamation-circle' : 'fa-exclamation-triangle';
            const dt      = d.nextDue.toLocaleDateString('es-MX', {day:'2-digit', month:'short', year:'numeric'});
            const diff    = Math.floor((d.nextDue - today) / 86400000);
            const diffLbl = d.status === 'expired' ? 'VENCIDO' : diff === 0 ? 'HOY' : `${diff} d\u00edas`;
            return `<div class="ccal-list-item"><span class="ccal-list-badge ${d.status}"><i class="fas ${ico}"></i></span><div class="ccal-list-info"><div class="ccal-list-name">${esc(d.nombre)}</div><div class="ccal-list-curso">${esc(d.curso.nombre)}</div></div><span class="ccal-list-date">${dt} &nbsp;<strong>${diffLbl}</strong></span></div>`;
        }).join('');

        // Mensaje WhatsApp
        if (whaBtn) {
            const lineas = proximos.map(d => {
                const dt   = d.nextDue.toLocaleDateString('es-MX', {day:'2-digit', month:'short', year:'numeric'});
                const diff = Math.floor((d.nextDue - today) / 86400000);
                const lbl  = d.status === 'expired' ? 'VENCIDO' : diff === 0 ? 'HOY' : `en ${diff} d\u00edas`;
                return `\u2022 ${d.nombre} \u2014 ${d.curso.nombre} \u2014 ${dt} (${lbl})`;
            });
            const msg = `\u26a0\ufe0f *Alerta de cursos por vencer \u2014 AIFA*\n\n${lineas.join('\n')}\n\nFavor de coordinar la actualizaci\u00f3n con los colaboradores indicados.\n\n_AIFA Operaciones \u2014 Sistema de Capacitaci\u00f3n_`;
            whaBtn.href = `https://wa.me/?text=${encodeURIComponent(msg)}`;
        }
    }

    window.cursosCalPrev = function() {
        _ccalMonth--;
        if (_ccalMonth < 0) { _ccalMonth = 11; _ccalYear--; }
        cursosCal_render();
    };
    window.cursosCalNext = function() {
        _ccalMonth++;
        if (_ccalMonth > 11) { _ccalMonth = 0; _ccalYear++; }
        cursosCal_render();
    };

    /* ═══════════════════════════════════════════════════════════
       AGENDA DE CURSOS PROGRAMADOS (agenda_2026.cursos_programados)
       ═══════════════════════════════════════════════════════════ */

    let _caRows = [];             // [{ num, nombre, cursos_programados:[] }]
    let _caYear = new Date().getFullYear();
    let _caMonth = new Date().getMonth();
    let _caDate = '';
    let _caNumCol = 'num_empleado';
    let _caNombreCol = 'nombre';
    let _caAttEventsBound = false;

    function caEsc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function caQCol(col) {
        return /[\s.]/.test(col) ? `"${col}"` : col;
    }

    function caNormEvents(arr) {
        if (!Array.isArray(arr)) return [];
        return arr.filter(Boolean).map(e => ({
            session_id: e.session_id || e.id || null,
            curso: String(e.curso || '').trim(),
            fecha: String(e.fecha || '').slice(0, 10),
            hora: String(e.hora || '').slice(0, 5),
            modalidad: String(e.modalidad || '').trim(),
            lugar: String(e.lugar || '').trim(),
            notas: String(e.notas || '').trim(),
            recurrente: !!e.recurrente,
            recurrencia: e.recurrencia && typeof e.recurrencia === 'object' ? {
                tipo: String(e.recurrencia.tipo || '').trim(),
                meses: Number(e.recurrencia.meses || 0),
                dias: Number(e.recurrencia.dias || 0),
                etiqueta: String(e.recurrencia.etiqueta || '').trim()
            } : null,
            creado_en: e.creado_en || null,
            creado_por: e.creado_por || null
        })).filter(e => e.curso && /^\d{4}-\d{2}-\d{2}$/.test(e.fecha));
    }

    function caRecurrenceDefaults(tipo) {
        const map = { semestral: { meses: 6, dias: 0 }, bimestral: { meses: 2, dias: 0 }, anual: { meses: 12, dias: 0 } };
        return map[tipo] || { meses: 0, dias: 0 };
    }

    function caGetRecurrence() {
        const recurrente = !!document.getElementById('ca-recurrente')?.checked;
        if (!recurrente) return { recurrente: false, recurrencia: null };
        const tipo = String(document.getElementById('ca-recur-tipo')?.value || 'semestral').trim();
        const etiqueta = String(document.getElementById('ca-recur-etiqueta')?.value || '').trim();
        const base = tipo === 'personalizado'
            ? {
                meses: Math.max(0, parseInt(document.getElementById('ca-recur-meses')?.value || '0', 10) || 0),
                dias: Math.max(0, parseInt(document.getElementById('ca-recur-dias')?.value || '0', 10) || 0)
              }
            : caRecurrenceDefaults(tipo);
        return {
            recurrente: true,
            recurrencia: {
                tipo,
                meses: base.meses,
                dias: base.dias,
                etiqueta
            }
        };
    }

    function caRecurrenceLabel(ev) {
        if (!ev?.recurrente) return '';
        const rec = ev.recurrencia || {};
        if (rec.etiqueta) return rec.etiqueta;
        if (rec.tipo && rec.tipo !== 'personalizado') {
            const map = { semestral: 'Semestral', bimestral: 'Bimestral', anual: 'Anual' };
            return map[rec.tipo] || 'Recurrente';
        }
        const parts = [];
        if (Number(rec.meses) > 0) parts.push(`${rec.meses} mes${Number(rec.meses) === 1 ? '' : 'es'}`);
        if (Number(rec.dias) > 0) parts.push(`${rec.dias} día${Number(rec.dias) === 1 ? '' : 's'}`);
        return parts.length ? parts.join(' y ') : 'Recurrente';
    }

    function caRecurrenceToggleCustom() {
        const recurrente = !!document.getElementById('ca-recurrente')?.checked;
        const box = document.getElementById('ca-recur-box');
        const custom = document.getElementById('ca-recur-custom');
        const tipo = String(document.getElementById('ca-recur-tipo')?.value || 'semestral');
        if (box) box.classList.toggle('d-none', !recurrente);
        if (custom) custom.classList.toggle('visible', recurrente && tipo === 'personalizado');
        if (recurrente && tipo !== 'personalizado') {
            const def = caRecurrenceDefaults(tipo);
            const mes = document.getElementById('ca-recur-meses');
            const dias = document.getElementById('ca-recur-dias');
            if (mes) mes.value = String(def.meses);
            if (dias) dias.value = String(def.dias);
        }
    }

    async function caLoadRows() {
        let sb = window.supabaseClient;
        if (!sb && typeof window.ensureSupabaseClient === 'function') sb = await window.ensureSupabaseClient();
        if (!sb) throw new Error('Supabase no disponible');

        await colabCargarTodos();
        _caNumCol = colabCols?.num || 'num_empleado';
        _caNombreCol = colabCols?.nombre || 'nombre';

        const selectStr = `${caQCol(_caNumCol)},${caQCol(_caNombreCol)},cursos_programados`;
        const { data, error } = await sb
            .from('agenda_2026')
            .select(selectStr)
            .limit(3000);

        if (error) {
            if (/cursos_programados/i.test(error.message || '')) {
                throw new Error('Falta la columna cursos_programados en agenda_2026. Ejecuta db/add_cursos_programados_column.sql en Supabase.');
            }
            throw error;
        }

        _caRows = (data || []).map(r => ({
            num: String(r[_caNumCol] ?? '').trim(),
            nombre: String(r[_caNombreCol] ?? r[_caNumCol] ?? '').trim(),
            cursos_programados: caNormEvents(r.cursos_programados)
        })).filter(r => r.num);
    }

    function caBuildSessions() {
        const map = new Map();
        _caRows.forEach(emp => {
            (emp.cursos_programados || []).forEach(ev => {
                const key = ev.session_id || `${ev.fecha}|${ev.hora}|${ev.curso}|${ev.modalidad}|${ev.lugar}`;
                if (!map.has(key)) {
                    map.set(key, {
                        key,
                        session_id: ev.session_id || null,
                        curso: ev.curso,
                        fecha: ev.fecha,
                        hora: ev.hora || '',
                        modalidad: ev.modalidad || '',
                        lugar: ev.lugar || '',
                        notas: ev.notas || '',
                        recurrente: !!ev.recurrente,
                        recurrencia: ev.recurrencia || null,
                        asistentes: []
                    });
                }
                map.get(key).asistentes.push({ num: emp.num, nombre: emp.nombre });
            });
        });
        return [...map.values()].sort((a, b) => {
            const fa = (a.fecha || '').localeCompare(b.fecha || '');
            if (fa) return fa;
            const ha = (a.hora || '').localeCompare(b.hora || '');
            if (ha) return ha;
            return (a.curso || '').localeCompare(b.curso || '');
        });
    }

    function caRenderEmployeeOptions() {
        const sel = document.getElementById('ca-asistentes');
        const count = document.getElementById('ca-selected-count');
        if (!sel) return;
        const sorted = [..._caRows].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        sel.innerHTML = sorted.map(e => `<option value="${caEsc(e.num)}">${caEsc(e.nombre)} (${caEsc(e.num)})</option>`).join('');
        if (!sel.dataset.caMultiBound) {
            sel.addEventListener('mousedown', ev => {
                const opt = ev.target;
                if (!opt || opt.tagName !== 'OPTION') return;
                ev.preventDefault();
                opt.selected = !opt.selected;
                sel.focus();
                caEmpUpdateCount();
            });
            sel.addEventListener('keydown', ev => {
                if ((ev.key !== 'Enter' && ev.key !== ' ') || sel.selectedIndex < 0) return;
                ev.preventDefault();
                const opt = sel.options[sel.selectedIndex];
                opt.selected = !opt.selected;
                caEmpUpdateCount();
            });
            sel.dataset.caMultiBound = '1';
        }
        if (count) count.textContent = '0 seleccionados';
        caRenderSelectedPreview();
    }

    function caGetSelectedEmployees() {
        const sel = document.getElementById('ca-asistentes');
        if (!sel) return [];
        const map = new Map(_caRows.map(r => [r.num, r.nombre]));
        return [...sel.options]
            .filter(o => o.selected)
            .map(o => ({ num: o.value, nombre: map.get(o.value) || o.textContent || o.value }));
    }

    function caRenderSelectedPreview() {
        const wrap = document.getElementById('ca-selected-preview');
        if (!wrap) return;
        const selected = caGetSelectedEmployees();
        if (!selected.length) {
            wrap.innerHTML = '<span class="ca-pill-empty">Sin selección</span>';
            return;
        }
        wrap.innerHTML = selected
            .slice(0, 20)
            .map(e => `<span class="ca-pill" title="${caEsc(e.num)}">${caEsc(e.nombre)}</span>`)
            .join('');
        if (selected.length > 20) {
            wrap.innerHTML += `<span class="ca-pill">+${selected.length - 20} más</span>`;
        }
    }

    function caFindColabFull(num) {
        const n = String(num || '').trim();
        return (window.colabCache || []).find(r => String(r[_caNumCol] ?? '').trim() === n) || null;
    }

    function caBuildAreaLabel(row) {
        if (!row) return '';
        const parts = [gc(row, 'direccion'), gc(row, 'subdireccion'), gc(row, 'gerencia'), gc(row, 'coordinacion')]
            .map(v => String(v || '').trim())
            .filter(Boolean);
        return parts[0] || '';
    }

    function caHideColabTip() {
        const tip = document.getElementById('ca-colab-tip');
        if (!tip) return;
        tip.classList.remove('visible');
        tip.innerHTML = '';
    }

    function caShowColabTip(num, e) {
        const tip = document.getElementById('ca-colab-tip');
        if (!tip) return;
        const full = caFindColabFull(num);
        const nombre = full ? String(gc(full, 'nombre') || num) : String(num || '');
        const puesto = full ? String(gc(full, 'puesto') || '') : '';
        const area = full ? caBuildAreaLabel(full) : '';
        const ext = full ? String(gc(full, 'extension') || '') : '';
        const cel = full ? String(gc(full, 'celular') || '') : '';
        const correo = full ? String(gc(full, 'correo') || gc(full, 'correo_personal') || '') : '';

        tip.innerHTML = `<div class="ca-tip-name">${caEsc(nombre)}</div>
            <div class="ca-tip-num">${caEsc(String(num || ''))}</div>
            ${puesto ? `<div class="ca-tip-row"><i class="fas fa-id-badge"></i>${caEsc(puesto)}</div>` : ''}
            ${area ? `<div class="ca-tip-row"><i class="fas fa-building"></i>${caEsc(area)}</div>` : ''}
            ${ext ? `<div class="ca-tip-row"><i class="fas fa-phone-alt"></i>Ext. ${caEsc(ext)}</div>` : ''}
            ${cel ? `<div class="ca-tip-row"><i class="fas fa-mobile-alt"></i>${caEsc(cel)}</div>` : ''}
            ${correo ? `<div class="ca-tip-row"><i class="fas fa-envelope"></i>${caEsc(correo)}</div>` : ''}
            <div class="ca-tip-hint">Clic para abrir su tarjeta</div>`;

        let tx = e.clientX + 14;
        let ty = e.clientY + 14;
        tip.classList.add('visible');
        const tw = tip.offsetWidth || 260;
        const th = tip.offsetHeight || 120;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (tx + tw > vw - 8) tx = e.clientX - tw - 10;
        if (ty + th > vh - 8) ty = e.clientY - th - 10;
        tip.style.left = `${Math.max(6, tx)}px`;
        tip.style.top = `${Math.max(6, ty)}px`;
    }

    function caInitAttendeeEvents() {
        if (_caAttEventsBound) return;
        const list = document.getElementById('ca-list');
        if (!list) return;

        list.addEventListener('mousemove', e => {
            const pill = e.target.closest('.ca-colab-link[data-num]');
            if (!pill) return caHideColabTip();
            caShowColabTip(pill.dataset.num, e);
        });

        list.addEventListener('mouseleave', () => caHideColabTip());

        list.addEventListener('click', e => {
            const pill = e.target.closest('.ca-colab-link[data-num]');
            if (!pill) return;
            e.preventDefault();
            caHideColabTip();
            cursosAgendaAbrirColab(encodeURIComponent(pill.dataset.num || ''));
        });

        _caAttEventsBound = true;
    }

    function caRenderCalendar() {
        const grid = document.getElementById('ca-grid');
        const monthLabel = document.getElementById('ca-month-label');
        if (!grid) return;
        const mes = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        if (monthLabel) monthLabel.textContent = `${mes[_caMonth]} ${_caYear}`;

        const sessions = caBuildSessions();
        const monthMap = {};
        sessions.forEach(s => {
            const d = new Date(`${s.fecha}T00:00:00`);
            if (Number.isNaN(d.getTime())) return;
            if (d.getFullYear() !== _caYear || d.getMonth() !== _caMonth) return;
            const day = d.getDate();
            monthMap[day] = (monthMap[day] || 0) + 1;
        });

        const dow = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
        const first = new Date(_caYear, _caMonth, 1);
        const last = new Date(_caYear, _caMonth + 1, 0);
        const start = (first.getDay() + 6) % 7;
        const cells = Math.ceil((start + last.getDate()) / 7) * 7;
        const today = new Date();

        let html = dow.map(d => `<div class="ca-dow">${d}</div>`).join('');
        for (let i = 0; i < cells; i++) {
            const day = i - start + 1;
            if (day < 1 || day > last.getDate()) {
                html += '<div class="ca-day other"></div>';
                continue;
            }
            const dateKey = `${_caYear}-${String(_caMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = today.getFullYear() === _caYear && today.getMonth() === _caMonth && today.getDate() === day;
            const isSel = _caDate === dateKey;
            const count = monthMap[day] || 0;
            html += `<div class="ca-day${isToday ? ' today' : ''}${isSel ? ' sel' : ''}" onclick="cursosAgendaSelectDate('${dateKey}')"><div class="ca-day-num">${day}</div>${count ? `<span class="ca-day-count">${count}</span>` : ''}</div>`;
        }
        grid.innerHTML = html;
        caRenderList();
        caRenderAlerts();
    }

    function caRenderList() {
        const list = document.getElementById('ca-list');
        const dateLbl = document.getElementById('ca-list-date');
        if (!list) return;

        const sessions = caBuildSessions().filter(s => s.fecha === _caDate);
        dateLbl.textContent = _caDate || 'Sin fecha seleccionada';
        if (!_caDate) {
            list.innerHTML = '<div class="text-muted small">Selecciona un día del calendario para ver cursos agendados.</div>';
            return;
        }
        if (!sessions.length) {
            list.innerHTML = '<div class="text-muted small">No hay cursos agendados para esta fecha.</div>';
            return;
        }
        list.innerHTML = sessions.map(s => {
            const asistentesHtml = s.asistentes.length
                ? `<div class="ca-item-att-list">${s.asistentes.map(a => `<span class="ca-item-att-pill ca-colab-link" data-num="${caEsc(a.num)}" title="Ver tarjeta de ${caEsc(a.nombre)}">${caEsc(a.nombre)} (${caEsc(a.num)})</span>`).join('')}</div>`
                : '<div class="ca-item-att-empty">Sin asistentes asignados.</div>';
            const canDelete = colabCanEdit() ? `<button type="button" class="ca-item-del" onclick="cursosAgendaEliminar('${caEsc(s.key)}')"><i class="fas fa-trash-alt me-1"></i>Eliminar</button>` : '';
            const recurrenteTag = s.recurrente ? `<span class="ca-item-badge"><i class="fas fa-sync-alt me-1"></i>${caEsc(caRecurrenceLabel(s) || 'Recurrente')}</span>` : '';
            return `<div class="ca-item"><div class="ca-item-top"><div><div class="ca-item-title">${caEsc(s.curso)}</div><div class="ca-item-meta-row"><span class="ca-item-badge"><i class="far fa-clock me-1"></i>${caEsc(s.hora || 'Sin hora')}</span><span class="ca-item-badge">${caEsc(s.modalidad || 'Modalidad no definida')}</span><span class="ca-item-badge">${caEsc(s.lugar || 'Sin sede')}</span>${recurrenteTag}</div></div>${canDelete}</div><div class="ca-item-att"><strong>Asistentes (${s.asistentes.length})</strong>${asistentesHtml}</div>${s.notas ? `<div class="ca-item-meta mt-2">Nota: ${caEsc(s.notas)}</div>` : ''}</div>`;
        }).join('');
    }

    function caBuildAlertSessions() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const limit = new Date(today);
        limit.setDate(limit.getDate() + 30);
        return caBuildSessions().filter(s => {
            if (!s.recurrente) return false;
            const d = new Date(`${s.fecha}T00:00:00`);
            return !Number.isNaN(d.getTime()) && d >= today && d <= limit;
        }).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora) || a.curso.localeCompare(b.curso));
    }

    function caRenderAlerts() {
        const countEl = document.getElementById('ca-alert-count');
        const listEl = document.getElementById('ca-alert-list');
        const wrapEl = document.getElementById('ca-alert-wha-wrap');
        const btnEl = document.getElementById('ca-alert-wha-btn');
        if (!countEl || !listEl) return;

        const alerts = caBuildAlertSessions();
        countEl.textContent = String(alerts.length);
        if (!alerts.length) {
            listEl.innerHTML = '<div class="ca-alert-empty"><i class="fas fa-check-circle text-success me-1"></i>No hay cursos recurrentes por revisar en los próximos 30 días.</div>';
            if (wrapEl) wrapEl.style.display = 'none';
            return;
        }

        const fmt = s => {
            const d = new Date(`${s.fecha}T00:00:00`);
            return Number.isNaN(d.getTime()) ? s.fecha : d.toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' });
        };
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        listEl.innerHTML = alerts.map(s => {
            const d = new Date(`${s.fecha}T00:00:00`);
            const diff = Math.max(0, Math.ceil((d - today) / 86400000));
            const recur = caRecurrenceLabel(s);
            return `<div class="ca-alert-item recurrent"><div class="ca-alert-item-title">${caEsc(s.curso)}</div><div class="ca-alert-item-meta">${fmt(s)} · ${caEsc(s.hora || 'Sin hora')} · ${caEsc(s.modalidad || 'Sin modalidad')} · ${s.asistentes.length} asistentes · ${caEsc(recur)} · revisar en ${diff} día${diff === 1 ? '' : 's'}</div></div>`;
        }).join('');

        const lines = alerts.map(s => {
            const d = new Date(`${s.fecha}T00:00:00`);
            const dt = Number.isNaN(d.getTime()) ? s.fecha : d.toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' });
            return `• ${s.curso} — ${dt}${s.hora ? ` (${s.hora})` : ''} — ${s.asistentes.length} asistente(s)`;
        });
        const msg = `⚠️ *Cursos recurrentes por revisar — AIFA*\n\n${lines.join('\n')}\n\nFavor de checar el seguimiento con el personal indicado.\n\n_AIFA Operaciones — Agenda de Cursos_`;
        if (wrapEl && btnEl) {
            btnEl.href = `https://wa.me/?text=${encodeURIComponent(msg)}`;
            wrapEl.style.display = '';
        }
    }

    function caSetStatus(msg, cls) {
        const el = document.getElementById('ca-status');
        if (!el) return;
        el.className = `small mt-2 ${cls || ''}`;
        el.textContent = msg || '';
    }

    window.cursosAgendaAbrir = async function() {
        const modal = new bootstrap.Modal(document.getElementById('cursosAgendaModal'));
        modal.show();
        _caYear = new Date().getFullYear();
        _caMonth = new Date().getMonth();
        _caDate = new Date().toISOString().slice(0, 10);
        const recurrenteEl = document.getElementById('ca-recurrente');
        if (recurrenteEl) recurrenteEl.checked = false;
        caRecurrenceToggleCustom();
        caSetStatus('Cargando agenda de cursos…', 'text-info');
        try {
            await caLoadRows();
            caRenderEmployeeOptions();
            caRenderCalendar();
            caInitAttendeeEvents();
            caRenderAlerts();
            caSetStatus('Agenda cargada.', 'text-success');
        } catch (err) {
            caSetStatus(err.message || String(err), 'text-danger');
        }
    };

    window.cursosAgendaAbrirColab = function(numEmplEncoded) {
        const numEmpl = decodeURIComponent(numEmplEncoded || '');
        const caModal = bootstrap.Modal.getInstance(document.getElementById('cursosAgendaModal'));
        if (caModal) caModal.hide();
        if (typeof window.showSection === 'function') {
            const link = document.querySelector('[onclick*="colaboradores"]') || null;
            window.showSection('colaboradores', link);
        }
        setTimeout(() => {
            if (typeof window.colabSeleccionarSugerencia === 'function') {
                window.colabSeleccionarSugerencia(numEmpl);
            }
        }, 200);
    };

    document.getElementById('cursosAgendaModal')?.addEventListener('hide.bs.modal', caHideColabTip);

    window.cursosAgendaSelectDate = function(dateKey) {
        _caDate = dateKey;
        caRenderCalendar();
    };

    window.cursosAgendaPrev = function() {
        _caMonth--;
        if (_caMonth < 0) { _caMonth = 11; _caYear--; }
        caRenderCalendar();
    };

    window.cursosAgendaNext = function() {
        _caMonth++;
        if (_caMonth > 11) { _caMonth = 0; _caYear++; }
        caRenderCalendar();
    };

    window.caEmpFilter = function(q) {
        const sel = document.getElementById('ca-asistentes');
        if (!sel) return;
        const query = String(q || '').trim().toLowerCase();
        [...sel.options].forEach(o => {
            o.style.display = !query || o.text.toLowerCase().includes(query) ? '' : 'none';
        });
    };

    window.caEmpSelectAll = function(all) {
        const sel = document.getElementById('ca-asistentes');
        const count = document.getElementById('ca-selected-count');
        if (!sel) return;
        [...sel.options].forEach(o => {
            if (o.style.display !== 'none') o.selected = !!all;
        });
        const n = [...sel.options].filter(o => o.selected).length;
        if (count) count.textContent = `${n} seleccionados`;
        caRenderSelectedPreview();
    };

    window.caEmpUpdateCount = function() {
        const sel = document.getElementById('ca-asistentes');
        const count = document.getElementById('ca-selected-count');
        if (!sel || !count) return;
        const n = [...sel.options].filter(o => o.selected).length;
        count.textContent = `${n} seleccionados`;
        caRenderSelectedPreview();
    };

    async function caSaveForEmployee(num, events) {
        if (!colabRequireEdit()) throw new Error(COLAB_EDIT_DENIED_MSG);
        let sb = window.supabaseClient;
        if (!sb && typeof window.ensureSupabaseClient === 'function') sb = await window.ensureSupabaseClient();
        if (!sb) throw new Error('Supabase no disponible');
        const colNumFilter = caQCol(_caNumCol);
        const { error } = await sb
            .from('agenda_2026')
            .update({ cursos_programados: events })
            .filter(colNumFilter, 'eq', num);
        if (error) throw error;
    }

    window.cursosAgendaGuardar = async function() {
        if (!colabCanEdit()) {
            caSetStatus('No tienes permisos para editar la agenda de cursos.', 'text-warning');
            colabRequireEdit();
            return;
        }

        const curso = String(document.getElementById('ca-curso')?.value || '').trim();
        const fecha = String(document.getElementById('ca-fecha')?.value || '').trim();
        const hora = String(document.getElementById('ca-hora')?.value || '').trim();
        const modalidad = String(document.getElementById('ca-modalidad')?.value || '').trim();
        const lugar = String(document.getElementById('ca-lugar')?.value || '').trim();
        const notas = String(document.getElementById('ca-notas')?.value || '').trim();
        const recurrente = !!document.getElementById('ca-recurrente')?.checked;
        const recurrencia = recurrente ? caGetRecurrence().recurrencia : null;
        const asistentesSel = document.getElementById('ca-asistentes');
        const asistentes = asistentesSel ? [...asistentesSel.options].filter(o => o.selected).map(o => o.value) : [];

        if (!curso) return caSetStatus('Captura el nombre del curso.', 'text-warning');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return caSetStatus('Selecciona una fecha válida.', 'text-warning');
        if (!asistentes.length) return caSetStatus('Selecciona al menos un asistente.', 'text-warning');
        if (recurrente) {
            if (!recurrencia) return caSetStatus('Define la recurrencia del curso.', 'text-warning');
            if (recurrencia.tipo === 'personalizado' && recurrencia.meses === 0 && recurrencia.dias === 0) {
                return caSetStatus('En recurrencia personalizada captura meses y/o días.', 'text-warning');
            }
        }

        const sessionId = `ca-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const user = sessionStorage.getItem('user_name') || sessionStorage.getItem('username') || sessionStorage.getItem('email') || 'usuario';
        const ev = {
            session_id: sessionId,
            curso,
            fecha,
            hora,
            modalidad,
            lugar,
            notas,
            recurrente,
            recurrencia,
            creado_en: new Date().toISOString(),
            creado_por: user
        };

        caSetStatus('Guardando agenda…', 'text-info');
        try {
            for (const num of asistentes) {
                const row = _caRows.find(r => r.num === num);
                if (!row) continue;
                const nextArr = [...(row.cursos_programados || []), ev];
                await caSaveForEmployee(num, nextArr);
                row.cursos_programados = nextArr;
                const cacheEmp = (window.colabCache || []).find(r => String(r[_caNumCol] ?? '').trim() === num);
                if (cacheEmp) cacheEmp.cursos_programados = nextArr;
            }

            _caDate = fecha;
            caRenderCalendar();
            caRenderAlerts();
            caSetStatus(`Curso agendado para ${asistentes.length} colaborador(es).`, 'text-success');
        } catch (err) {
            caSetStatus('Error al guardar: ' + (err.message || String(err)), 'text-danger');
        }
    };

    window.cursosAgendaEliminar = async function(key) {
        if (!colabCanEdit()) {
            caSetStatus('No tienes permisos para editar la agenda de cursos.', 'text-warning');
            colabRequireEdit();
            return;
        }
        if (!confirm('¿Eliminar esta sesión de curso y sus asistentes?')) return;
        caSetStatus('Eliminando sesión…', 'text-info');
        try {
            for (const row of _caRows) {
                const before = row.cursos_programados || [];
                const after = before.filter(ev => {
                    const k = ev.session_id || `${ev.fecha}|${ev.hora}|${ev.curso}|${ev.modalidad}|${ev.lugar}`;
                    return k !== key;
                });
                if (after.length !== before.length) {
                    await caSaveForEmployee(row.num, after);
                    row.cursos_programados = after;
                    const cacheEmp = (window.colabCache || []).find(r => String(r[_caNumCol] ?? '').trim() === row.num);
                    if (cacheEmp) cacheEmp.cursos_programados = after;
                }
            }
            caRenderCalendar();
            caRenderAlerts();
            caSetStatus('Sesión eliminada.', 'text-success');
        } catch (err) {
            caSetStatus('Error al eliminar: ' + (err.message || String(err)), 'text-danger');
        }
    };

    /* -- Menú contextual -- */
    // Cierra el menú al clicar fuera
    document.addEventListener('click', () => colabCursosHideCtxMenu());
    document.addEventListener('keydown', e => { if (e.key === 'Escape') colabCursosHideCtxMenu(); });

    window.colabCursosHideCtxMenu = function() {
        const m = document.getElementById('cc-ctx-menu');
        if (m) m.style.display = 'none';
        _ccCtx = null;
    };

    window.colabCursosShowCtxMenu = function(e, type, data) {
        const m = document.getElementById('cc-ctx-menu');
        const itemsEl = document.getElementById('cc-ctx-items');
        if (!m || !itemsEl) return;
        window._ccCtx = { type, data };

        // Construir Ítems según contexto
        let html = '';
        if (type === 'course') {
            const allCats = [...document.querySelectorAll('.colab-cursos-folder-header[data-cat]')]
                .map(el => el.dataset.cat)
                .filter(c => c && c !== '__none__' && c !== (data.cat || ''));
            html += `<div class="cc-ctx-item" onclick="colabCursosCtxAction('rename-course')">
                <i class="fas fa-pencil-alt"></i>Renombrar</div>`;
            if (allCats.length) {
                html += `<div class="cc-ctx-sep"></div>
                <div class="cc-ctx-sub-title"><i class="fas fa-folder me-1"></i>Mover a carpeta</div>`;
                html += allCats.map(c => {
                    const safe = c.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                    return `<div class="cc-ctx-item cc-ctx-sub-item" data-moveto="${safe}" onclick="colabCursosCtxAction('move',this.dataset.moveto)">
                        <i class="fas fa-folder text-warning"></i>${safe}</div>`;
                }).join('');
                if (data.cat) {
                    html += `<div class="cc-ctx-item cc-ctx-sub-item" onclick="colabCursosCtxAction('move','')">
                        <i class="fas fa-folder text-secondary"></i>Sin carpeta</div>`;
                }
            }
            if (data.pdfUrl) {
                const safePdf = data.pdfUrl.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                html += `<div class="cc-ctx-sep"></div>
                <div class="cc-ctx-item" onclick="window.open('${safePdf}','_blank');colabCursosHideCtxMenu()">
                    <i class="fas fa-file-pdf text-danger"></i>Ver PDF</div>
                <div class="cc-ctx-item" onclick="navigator.clipboard?.writeText('${safePdf}');colabCursosHideCtxMenu()">
                    <i class="fas fa-link"></i>Copiar enlace PDF</div>`;
            }
            html += `<div class="cc-ctx-sep"></div>
            <div class="cc-ctx-item danger" onclick="colabCursosCtxAction('delete-course')">
                <i class="fas fa-trash-alt"></i>Eliminar curso</div>`;
        } else if (type === 'folder') {
            html += `<div class="cc-ctx-item" onclick="colabCursosCtxAction('rename-folder')">
                <i class="fas fa-pencil-alt"></i>Renombrar carpeta</div>
            <div class="cc-ctx-item" onclick="colabCursosCtxAction('new-course-here')">
                <i class="fas fa-plus-circle text-success"></i>Añadir curso aquí</div>
            <div class="cc-ctx-sep"></div>
            <div class="cc-ctx-item danger" onclick="colabCursosCtxAction('delete-folder')">
                <i class="fas fa-folder-minus"></i>Eliminar carpeta</div>`;
        }
        itemsEl.innerHTML = html;

        // Posicionar (mostrar primero para obtener tamaño real)
        m.style.visibility = 'hidden';
        m.style.display = 'block';
        const rect = m.getBoundingClientRect();
        const vw = window.innerWidth, vh = window.innerHeight;
        let x = e.clientX + 4, y = e.clientY + 4;
        if (x + rect.width  > vw) x = e.clientX - rect.width;
        if (y + rect.height > vh) y = e.clientY - rect.height;
        m.style.left = Math.max(0, x) + 'px';
        m.style.top  = Math.max(0, y) + 'px';
        m.style.visibility = '';
    };

    /* -- Despacho de acciones del menú -- */
    window.colabCursosCtxAction = async function(action, moveTarget) {
        const ctx = window._ccCtx;
        colabCursosHideCtxMenu();
        if (!ctx) return;
        if (['rename-course','move','delete-course','rename-folder','new-course-here','delete-folder'].includes(action) && !colabRequireEdit()) return;
        const data = ctx.data;
        const numEmpl = data.numEmpl || val(gc(colabCurrentRow, 'num'));
        const sb = window.supabaseClient;
        if (action === 'rename-course') {
            const nameDiv = document.querySelector(`#cc-item-${data.id} .colab-curso-name`);
            if (nameDiv) colabCursoClickRename(data.id, nameDiv);
        } else if (action === 'move') {
            const newCat = (moveTarget !== undefined ? moveTarget : '').trim() || null;
            const { error } = await sb.from('colab_cursos').update({ categoria: newCat }).eq('id', data.id);
            if (error) { alert('Error: ' + error.message); return; }
            await colabCargarCursos(numEmpl);
        } else if (action === 'delete-course') {
            colabCursosEliminar(data.id);
        } else if (action === 'rename-folder') {
            colabCursosFolderRename(data.cat, numEmpl);
        } else if (action === 'new-course-here') {
            const editBtn = document.querySelector('[data-bs-target="#colabEditModal"]') ||
                           document.getElementById('colab-ficha-edit-btn');
            if (editBtn) editBtn.click();
            setTimeout(() => {
                const tabEl = document.getElementById('cedit-tab-cursos') ||
                             document.querySelector('[href="#cedit-cursos"]');
                if (tabEl) tabEl.click();
                setTimeout(() => {
                    const addBtn = document.getElementById('cedit-cursos-add-btn') ||
                                  document.querySelector('[onclick*="colabCursosShowAddForm"]');
                    if (addBtn) addBtn.click();
                    setTimeout(() => {
                        const catEl = document.getElementById('cn-curso-categoria');
                        if (catEl) { catEl.value = data.cat; catEl.focus(); }
                    }, 150);
                }, 150);
            }, 300);
        } else if (action === 'delete-folder') {
            colabCursosDeleteFolder(data.cat, numEmpl);
        }
    };

    /* -----------------------------------------------------------
       ARRASTRAR CURSOS ENTRE CARPETAS + RENOMBRAR CON click
       ----------------------------------------------------------- */

    let _ccDraggingId = null;

    /* Inicia el arrastre de un curso */
    window.colabCursoDragStart = function(e, id) {
        if (!colabCanEdit()) {
            e.preventDefault();
            return;
        }
        _ccDraggingId = id;
        e.dataTransfer.effectAllowed = 'move';
        const item = document.getElementById('cc-item-' + id);
        if (item) {
            item.classList.add('cc-dragging');
            item.addEventListener('dragend', function onEnd() {
                item.classList.remove('cc-dragging');
                document.querySelectorAll('.cc-drag-over').forEach(el => el.classList.remove('cc-drag-over'));
                _ccDraggingId = null;
                item.removeEventListener('dragend', onEnd);
            });
        }
    };

    /* Resalta carpeta cuando el cursor entra arrastrando */
    window.colabCursoFolderDragOver = function(e) {
        if (!_ccDraggingId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        e.currentTarget.classList.add('cc-drag-over');
    };

    /* Quita el resaltado cuando el cursor sale de la carpeta */
    window.colabCursoFolderDragLeave = function(e) {
        if (!e.currentTarget.contains(e.relatedTarget)) {
            e.currentTarget.classList.remove('cc-drag-over');
        }
    };

    /* Suelta el curso en la carpeta destino ? actualiza categoría */
    window.colabCursoFolderDrop = async function(e, headerEl) {
        e.preventDefault();
        headerEl.classList.remove('cc-drag-over');
        if (!colabRequireEdit()) return;
        const id = _ccDraggingId;
        _ccDraggingId = null;
        if (!id) return;
        const catRaw   = headerEl.dataset.cat;   // valor real (browser decodifica &quot; etc.)
        const numEmpl  = headerEl.dataset.numempl;
        const newCat   = (catRaw === '__none__' || !catRaw) ? null : catRaw;
        const sb = window.supabaseClient;
        if (!sb) return;
        // No hacer nada si el curso ya esté en esa carpeta
        const item = document.getElementById('cc-item-' + id);
        const curFolder = item?.closest('.colab-cursos-folder-body')
                               ?.previousElementSibling?.dataset?.cat;
        if (curFolder === catRaw) return;
        const { error } = await sb.from('colab_cursos').update({ categoria: newCat }).eq('id', id);
        if (error) { alert('Error al mover: ' + error.message); return; }
        await colabCargarCursos(numEmpl);
    };

    /* click en el nombre del curso ? edición inline tipo Explorador Windows */
    window.colabCursoClickRename = function(id, nameDiv) {
        if (!colabRequireEdit()) return;
        if (nameDiv.querySelector('input')) return; // ya editando
        const current = nameDiv.textContent.trim();
        nameDiv.innerHTML = `<input class="colab-curso-name-input"
            value="${current.replace(/"/g,'&quot;').replace(/'/g,'&#39;')}" maxlength="200">`;
        const inp = nameDiv.querySelector('input');
        inp.focus(); inp.select();
        let saved = false;
        const save = async () => {
            if (saved) return; saved = true;
            const newName = inp.value.trim();
            if (!newName || newName === current) { nameDiv.textContent = current; return; }
            const sb = window.supabaseClient;
            const { error } = await sb.from('colab_cursos').update({ nombre: newName }).eq('id', id);
            if (error) { alert('Error al renombrar: ' + error.message); nameDiv.textContent = current; return; }
            nameDiv.textContent = newName;
            nameDiv.title = newName + ' · click para renombrar';
        };
        inp.addEventListener('blur', save);
        inp.addEventListener('keydown', e => {
            if (e.key === 'Enter')  { e.preventDefault(); inp.blur(); }
            if (e.key === 'Escape') { saved = true; inp.removeEventListener('blur', save); nameDiv.textContent = current; }
        });
    };

    /* -----------------------------------------------------------
       CARGA MASIVA DE CARPETA (batch)
       ----------------------------------------------------------- */

    /* Lista de File objects pendientes en el modal batch */
    let _ccBatchFiles = [];

    /* Lee recursivamente todos los PDFs de un DirectoryEntry */
    async function colabCursosReadFolder(dirEntry) {
        return new Promise(resolve => {
            const collected = [];
            const reader = dirEntry.createReader();
            function readChunk() {
                reader.readEntries(async entries => {
                    if (!entries.length) { resolve(collected); return; }
                    for (const en of entries) {
                        if (en.isFile) {
                            await new Promise(r => en.file(f => {
                                if (f.type === 'application/pdf') collected.push(f);
                                r();
                            }));
                        } else if (en.isDirectory) {
                            const sub = await colabCursosReadFolder(en);
                            collected.push(...sub);
                        }
                    }
                    readChunk(); // readEntries devuelve max 100 entradas a la vez
                });
            }
            readChunk();
        });
    }

    /* Convierte FileList/array del <input webkitdirectory> en batch */
    window.colabCursosBatchFromInput = function(fileList) {
        if (!colabRequireEdit()) {
            const inp = document.getElementById('colab-cursos-folder-input');
            if (inp) inp.value = '';
            return;
        }
        const files = Array.from(fileList).filter(f => f.type === 'application/pdf');
        if (!files.length) { alert('No se encontraron PDFs en la carpeta seleccionada.'); return; }
        colabCursosBatchShow(files);
        // Limpiar el input para permitir volver a seleccionar la misma carpeta
        const inp = document.getElementById('colab-cursos-folder-input');
        if (inp) inp.value = '';
    };

    /* Muestra el modal batch con la lista de archivos */
    function colabCursosBatchShow(files) {
        _ccBatchFiles = files;
        const today = new Date().toISOString().slice(0, 10);

        // Fecha global
        const fechaGlobal = document.getElementById('cbm-fecha-global');
        if (fechaGlobal) fechaGlobal.value = today;

        // Contador
        const countEl = document.getElementById('cbm-count');
        if (countEl) countEl.textContent = `${files.length} PDF${files.length !== 1 ? 's' : ''} encontrado${files.length !== 1 ? 's' : ''}`;

        // Construir filas
        const freqOptsB = (sel='365') => ['365','180','730','90','custom'].map(v => {
            const lbl = v==='365'?'Anual (1 año)':v==='180'?'Semestral (6 m)':v==='730'?'Bianual (2 años)':v==='90'?'Trimestral (3 m)':'Personalizado…';
            return `<option value="${v}"${sel===v?' selected':''}>${lbl}</option>`;
        }).join('');
        const listEl = document.getElementById('cbm-list');
        if (listEl) {
            listEl.innerHTML = files.map((f, i) => {
                const rawName = f.name.replace(/\.pdf$/i, '').replace(/[_\-]+/g, ' ').trim();
                const sizeKb  = (f.size / 1024).toFixed(0);
                const tooBig  = f.size > 15 * 1024 * 1024;
                return `<div class="cbm-file-row${tooBig ? ' cbm-err' : ''}" id="cbm-row-${i}">
                    <div>
                        <div class="cbm-fname" title="${f.name}"><i class="fas fa-file-pdf text-danger me-1"></i>${f.name}</div>
                        <div style="font-size:.7rem;color:#94a3b8">${sizeKb} KB${tooBig ? ' · <span class="text-danger">supera 15 MB</span>' : ''}</div>
                        <input type="date" class="form-control form-control-sm mt-1" id="cbm-date-${i}" value="${today}" style="max-width:150px;font-size:.78rem">
                    </div>
                    <div>
                        <input type="text" class="form-control form-control-sm" id="cbm-name-${i}"
                               value="${rawName.replace(/"/g, '&quot;')}" placeholder="Nombre del curso"
                               ${tooBig ? 'disabled' : ''}>
                        <input type="text" class="form-control form-control-sm mt-1" id="cbm-cat-${i}"
                               list="colab-cursos-cat-list" placeholder="Carpeta (opcional)"
                               style="font-size:.76rem" ${tooBig ? 'disabled' : ''}>
                        <div class="cbm-rec-row">
                            <div class="form-check form-check-inline mb-0">
                                <input class="form-check-input" type="checkbox" id="cbm-rec-${i}"
                                       onchange="colabBatchToggleFreq(${i},this)" ${tooBig ? 'disabled' : ''}>
                                <label class="form-check-label" for="cbm-rec-${i}">¿Recurrente?</label>
                            </div>
                            <select class="form-select form-select-sm" id="cbm-freq-${i}"
                                    style="display:none;max-width:160px;font-size:.76rem"
                                    onchange="colabBatchToggleCustomFreq(${i},this)">${freqOptsB()}</select>
                            <input type="number" min="1" id="cbm-freq-custom-${i}"
                                   class="form-control form-control-sm" placeholder="días"
                                   style="display:none;max-width:80px;font-size:.76rem">
                        </div>
                    </div>
                    <div class="cbm-status-icon" id="cbm-icon-${i}">
                        ${tooBig ? '<i class="fas fa-times-circle text-danger" title="Archivo muy grande"></i>' : ''}
                    </div>
                </div>`;
            }).join('');
        }

        // Reset barra y estado
        const pw = document.getElementById('cbm-progress-wrap');
        const pb = document.getElementById('cbm-progress-bar');
        const st = document.getElementById('cbm-status');
        const btn = document.getElementById('cbm-btn-save');
        if (pw)  pw.classList.add('d-none');
        if (pb)  pb.style.width = '0%';
        if (st)  st.innerHTML = '';
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-upload me-1"></i>Subir todos'; }

        new bootstrap.Modal(document.getElementById('colabBatchCursosModal')).show();
    }

    /* Toggle frecuencia en filas del batch */
    window.colabBatchToggleFreq = function(i, chk) {
        const sel = document.getElementById('cbm-freq-' + i);
        const cw  = document.getElementById('cbm-freq-custom-' + i);
        if (sel) sel.style.display = chk?.checked ? '' : 'none';
        if (cw && !chk?.checked) cw.style.display = 'none';
    };
    window.colabBatchToggleCustomFreq = function(i, sel) {
        const cw = document.getElementById('cbm-freq-custom-' + i);
        if (cw) cw.style.display = sel?.value === 'custom' ? '' : 'none';
    };

    /* Aplica la carpeta global a todas las filas */
    window.colabBatchApplyCat = function() {
        const v = (document.getElementById('cbm-cat-global')?.value || '').trim();
        _ccBatchFiles.forEach((_, i) => {
            const inp = document.getElementById(`cbm-cat-${i}`);
            if (inp && !inp.disabled) inp.value = v;
        });
    };

    /* Aplica la fecha global a todas las filas */
    window.colabBatchApplyDate = function() {
        const val = document.getElementById('cbm-fecha-global')?.value;
        if (!val) return;
        _ccBatchFiles.forEach((_, i) => {
            const d = document.getElementById(`cbm-date-${i}`);
            if (d && !d.disabled) d.value = val;
        });
    };

    /* Limpia al cancelar */
    window.colabBatchCancel = function() { _ccBatchFiles = []; };

    /* Sube todos los archivos secuencialmente */
    window.colabBatchSubir = async function() {
        if (!_ccBatchFiles.length) return;
        if (!colabRequireEdit()) return;

        const numEmpl = val(gc(colabCurrentRow, 'num'));
        if (!numEmpl) { alert('No se detectó el colaborador activo.'); return; }

        const sb = window.supabaseClient;
        if (!sb) { alert('Supabase no disponible.'); return; }

        const userObj  = JSON.parse(sessionStorage.getItem('user') || '{}');
        const userName = userObj.user_metadata?.full_name || userObj.email || 'Sistema';

        const btn  = document.getElementById('cbm-btn-save');
        const pw   = document.getElementById('cbm-progress-wrap');
        const pb   = document.getElementById('cbm-progress-bar');
        const st   = document.getElementById('cbm-status');
        if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Subiendo…'; }
        if (pw)  pw.classList.remove('d-none');

        // Filtrar archivos válidos (no demasiado grandes, con nombre)
        const valid = _ccBatchFiles.map((f, i) => {
            const nombre  = (document.getElementById(`cbm-name-${i}`)?.value || '').trim();
            const fecha   = document.getElementById(`cbm-date-${i}`)?.value || null;
            const esRec   = !!document.getElementById(`cbm-rec-${i}`)?.checked;
            const freqSel = document.getElementById(`cbm-freq-${i}`)?.value || '365';
            let frecDias  = null;
            if (esRec) {
                if (freqSel === 'custom') {
                    const cv = parseInt(document.getElementById(`cbm-freq-custom-${i}`)?.value || '0', 10);
                    frecDias = cv > 0 ? cv : 365;
                } else {
                    frecDias = parseInt(freqSel, 10);
                }
            }
            return { file: f, nombre, fecha, esRec, frecDias,
                categoria: (document.getElementById(`cbm-cat-${i}`)?.value || document.getElementById('cbm-cat-global')?.value || '').trim() || null,
                idx: i, skip: f.size > 15*1024*1024 || !nombre };
        });

        let ok = 0, fail = 0;
        const total = valid.filter(v => !v.skip).length;

        for (const item of valid) {
            const iconEl = document.getElementById(`cbm-icon-${item.idx}`);
            const rowEl  = document.getElementById(`cbm-row-${item.idx}`);
            if (item.skip) { continue; }

            if (iconEl) iconEl.innerHTML = '<span class="spinner-border spinner-border-sm text-primary"></span>';

            try {
                // 1. INSERT
                const { data: ins, error: insErr } = await sb.from('colab_cursos').insert({
                    num_empleado:      String(numEmpl),
                    nombre:            item.nombre,
                    fecha_realizacion: item.fecha || null,
                    es_recurrente:     item.esRec,
                    frecuencia_dias:   item.frecDias,
                    categoria:         item.categoria,
                    creado_por:        userName,
                }).select('id').single();
                if (insErr) throw insErr;

                // 2. UPLOAD
                const path = `${numEmpl}/${ins.id}.pdf`;
                const { error: upErr } = await sb.storage
                    .from(COLAB_CURSOS_BUCKET)
                    .upload(path, item.file, { upsert: true, contentType: 'application/pdf' });
                if (upErr) throw upErr;

                // 3. UPDATE url
                const pdfUrl = COLAB_CURSOS_BUCKET_URL + path;
                await sb.from('colab_cursos').update({ pdf_url: pdfUrl }).eq('id', ins.id);

                ok++;
                if (iconEl) iconEl.innerHTML = '<i class="fas fa-check-circle text-success"></i>';
                if (rowEl)  rowEl.classList.add('cbm-ok');
            } catch (err) {
                fail++;
                if (iconEl) iconEl.innerHTML = `<i class="fas fa-times-circle text-danger" title="${err.message}"></i>`;
                if (rowEl)  rowEl.classList.add('cbm-err');
                console.error('[Batch cursos] Error en', item.file.name, err);
            }

            // Actualizar barra
            const done = ok + fail;
            if (pb) pb.style.width = `${Math.round((done / total) * 100)}%`;
        }

        // Resultado final
        if (st) {
            st.innerHTML = fail === 0
                ? `<span class="text-success"><i class="fas fa-check-circle me-1"></i>${ok} curso${ok !== 1 ? 's' : ''} subido${ok !== 1 ? 's' : ''} correctamente.</span>`
                : `<span class="text-warning"><i class="fas fa-exclamation-triangle me-1"></i>${ok} correcto${ok !== 1 ? 's' : ''}, ${fail} con error.</span>`;
        }
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check me-1"></i>Listo'; }

        // Refrescar lista de cursos
        await colabCargarCursos(numEmpl);

        // Cerrar el modal tras 1.5 s si todo fue bien
        if (fail === 0) {
            setTimeout(() => {
                bootstrap.Modal.getInstance(document.getElementById('colabBatchCursosModal'))?.hide();
                _ccBatchFiles = [];
            }, 1500);
        }
    };

    /* ================================================================
       ASIGNACIÓN MASIVA DE CURSOS — multi-empleado
       Flujo: 1) Abrir modal  2) Arrastrar/seleccionar carpeta de PDFs
              3) Parsear nombres → emparejar con colabCache por num
              4) Editar nombre/fecha/recurrencia por fila
              5) Confirmar → insert+upload para cada archivo
       Formato de nombre de archivo:
         {num_empleado}_{Nombre}_{Apellidos...}.pdf
         Ej: 31_David_Jesus_Pacheco_Angel.pdf
    ================================================================ */
    let _ccMasivaFiles = [];
    let _ccMasivaItems = [];

    window.colabMasivaAbrirModal = function() {
        if (!colabRequireEdit()) return;
        _ccMasivaFiles = [];
        _ccMasivaItems = [];
        const panel  = document.getElementById('cmm-preview-panel');
        const footer = document.getElementById('cmm-footer');
        const status = document.getElementById('cmm-status');
        const pw     = document.getElementById('cmm-progress-wrap');
        const pb     = document.getElementById('cmm-progress-bar');
        const list   = document.getElementById('cmm-list');
        const btn    = document.getElementById('cmm-btn-save');
        const dropzone = document.getElementById('cmm-dropzone');
        if (panel)  panel.classList.add('d-none');
        if (footer) footer.classList.add('d-none');
        if (status) status.innerHTML = '';
        if (pw)     pw.classList.add('d-none');
        if (pb)     pb.style.width = '0%';
        if (list)   list.innerHTML = '';
        if (btn)    { btn.disabled = false; btn.innerHTML = '<i class="fas fa-upload me-1"></i>Subir todos'; }
        if (dropzone) dropzone.classList.remove('drag-over');
        const fi  = document.getElementById('cmm-folder-input');
        const fi2 = document.getElementById('cmm-files-input');
        if (fi)  fi.value  = '';
        if (fi2) fi2.value = '';
        const fechaG = document.getElementById('cmm-fecha-global');
        if (fechaG) fechaG.value = new Date().toISOString().slice(0, 10);
        colabMasivaInitDropzone();
        new bootstrap.Modal(document.getElementById('colabMasivaCursosModal')).show();
    };

    function colabMasivaInitDropzone() {
        const dz = document.getElementById('cmm-dropzone');
        if (!dz || dz.dataset.dzInit) return;
        dz.dataset.dzInit = '1';
        dz.addEventListener('dragenter', e => { e.preventDefault(); dz.classList.add('drag-over'); });
        dz.addEventListener('dragover',  e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; dz.classList.add('drag-over'); });
        dz.addEventListener('dragleave', e => { if (!dz.contains(e.relatedTarget)) dz.classList.remove('drag-over'); });
        dz.addEventListener('drop', async e => {
            e.preventDefault();
            dz.classList.remove('drag-over');
            if (!colabRequireEdit()) return;
            const items = e.dataTransfer.items;
            if (items && items.length) {
                const entries = Array.from(items).map(i => i.webkitGetAsEntry?.()).filter(Boolean);
                const hasDir  = entries.some(en => en.isDirectory);
                if (hasDir) {
                    let allFiles = [];
                    for (const entry of entries) {
                        if (entry.isDirectory) {
                            const sub = await colabCursosReadFolder(entry);
                            allFiles.push(...sub);
                        } else if (entry.isFile) {
                            await new Promise(res => entry.file(f => {
                                if (f.type === 'application/pdf') allFiles.push(f);
                                res();
                            }));
                        }
                    }
                    if (!allFiles.length) { alert('No se encontraron PDFs en la carpeta.'); return; }
                    colabMasivaParsearArchivos(allFiles);
                    return;
                }
            }
            const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
            if (!files.length) { alert('Solo se aceptan archivos PDF.'); return; }
            colabMasivaParsearArchivos(files);
        });
    }

    window.colabMasivaParsearArchivos = function(fileList) {
        if (!colabRequireEdit()) {
            const fi  = document.getElementById('cmm-folder-input');
            const fi2 = document.getElementById('cmm-files-input');
            if (fi)  fi.value  = '';
            if (fi2) fi2.value = '';
            return;
        }
        const files = Array.from(fileList).filter(f => f.type === 'application/pdf');
        if (!files.length) { alert('No se encontraron PDFs.'); return; }
        const fi  = document.getElementById('cmm-folder-input');
        const fi2 = document.getElementById('cmm-files-input');
        if (fi)  fi.value  = '';
        if (fi2) fi2.value = '';
        _ccMasivaFiles = files;

        // Construir mapa num_empleado → fila
        const byNum = {};
        if (colabCache && colabCache.length) {
            for (const row of colabCache) {
                const numV = String(gc(row, 'num') || '').trim();
                if (numV) byNum[numV] = row;
            }
        }

        const freqOpts = (sel = '365') => ['365','180','730','90','custom'].map(v => {
            const lbl = { 365:'Anual (1 año)', 180:'Semestral (6 m)', 730:'Bianual (2 años)', 90:'Trimestral (3 m)', custom:'Personalizado' }[v];
            return `<option value="${v}"${sel === v ? ' selected' : ''}>${lbl}</option>`;
        }).join('');

        const today = new Date().toISOString().slice(0, 10);
        _ccMasivaItems = files.map((f, i) => {
            const baseName  = f.name.replace(/\.pdf$/i, '');
            const parts     = baseName.split('_');
            const numEmpl   = parts[0].trim(); // preservar formato "1468-2"
            const nameRest  = parts.slice(1).join(' ').trim() || baseName;
            const matched   = numEmpl ? (byNum[numEmpl] || null) : null;
            const matchName = matched ? (String(gc(matched, 'nombre') || '').trim() || `#${numEmpl}`) : null;
            const tooBig    = f.size > 15 * 1024 * 1024;
            return { file: f, numEmpl, nameRest, matched, matchName, tooBig, idx: i };
        });

        const listEl = document.getElementById('cmm-list');
        if (listEl) {
            listEl.innerHTML = _ccMasivaItems.map((item, i) => {
                const sizeKb = (item.file.size / 1024).toFixed(0);
                const matchBadge = item.matched
                    ? `<span class="cmm-matched-badge"><i class="fas fa-check me-1"></i>${item.matchName}</span>`
                    : item.numEmpl
                        ? `<span class="cmm-unmatched-badge"><i class="fas fa-question me-1"></i>No encontrado (#${item.numEmpl})</span>`
                        : `<span class="cmm-unmatched-badge"><i class="fas fa-times me-1"></i>Sin número</span>`;
                const dis = (item.tooBig || !item.matched) ? 'disabled' : '';
                return `<div class="cmm-file-row${item.tooBig ? ' cmm-err' : !item.matched ? ' cmm-skipped' : ''}" id="cmm-row-${i}">
                    <div style="padding-top:.15rem">
                        <input type="checkbox" class="form-check-input" id="cmm-chk-${i}"
                               ${item.matched && !item.tooBig ? 'checked' : ''} ${dis}>
                    </div>
                    <div>
                        <div class="cbm-fname" title="${item.file.name}"><i class="fas fa-file-pdf text-danger me-1"></i>${item.file.name}</div>
                        <div style="font-size:.68rem;color:#94a3b8">${sizeKb} KB${item.tooBig ? ' · <span class="text-danger fw-bold">supera 15 MB</span>' : ''}</div>
                    </div>
                    <div>${matchBadge}</div>
                    <div>
                        <input type="text" class="form-control form-control-sm" id="cmm-nombre-${i}"
                               value="${item.nameRest.replace(/"/g, '&quot;')}" placeholder="Nombre del curso" ${dis}>
                        <input type="text" class="form-control form-control-sm mt-1" id="cmm-cat-${i}"
                               list="colab-cursos-cat-list" placeholder="Carpeta (opcional)"
                               style="font-size:.74rem" ${dis}>
                    </div>
                    <div>
                        <input type="date" class="form-control form-control-sm" id="cmm-date-${i}"
                               value="${today}" style="max-width:145px;font-size:.76rem" ${dis}>
                        <div class="cmm-rec-row">
                            <div class="form-check form-check-inline mb-0">
                                <input class="form-check-input" type="checkbox" id="cmm-rec-${i}"
                                       onchange="colabMasivaToggleFreq(${i},this)" ${dis}>
                                <label class="form-check-label" for="cmm-rec-${i}" style="font-size:.75rem">¿Recurrente?</label>
                            </div>
                            <select class="form-select form-select-sm" id="cmm-freq-${i}"
                                    style="display:none;max-width:155px;font-size:.74rem"
                                    onchange="colabMasivaToggleCustomFreq(${i},this)">${freqOpts()}</select>
                            <input type="number" min="1" id="cmm-freq-custom-${i}"
                                   class="form-control form-control-sm" placeholder="días"
                                   style="display:none;max-width:75px;font-size:.74rem">
                        </div>
                    </div>
                    <div class="cmm-status-icon" id="cmm-icon-${i}">
                        ${item.tooBig ? '<i class="fas fa-times-circle text-danger" title="Archivo muy grande"></i>' : ''}
                    </div>
                </div>`;
            }).join('');
        }

        const matched = _ccMasivaItems.filter(it => it.matched && !it.tooBig).length;
        const countEl = document.getElementById('cmm-count');
        if (countEl) countEl.textContent = `${files.length} PDF${files.length !== 1 ? 's' : ''} · ${matched} coincidencia${matched !== 1 ? 's' : ''}`;

        document.getElementById('cmm-preview-panel')?.classList.remove('d-none');
        document.getElementById('cmm-footer')?.classList.remove('d-none');

        const btn = document.getElementById('cmm-btn-save');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-upload me-1"></i>Subir todos'; }
        document.getElementById('cmm-progress-wrap')?.classList.add('d-none');
        const pb = document.getElementById('cmm-progress-bar');
        if (pb) pb.style.width = '0%';
        const st = document.getElementById('cmm-status');
        if (st) st.innerHTML = '';
    };

    window.colabMasivaToggleFreq = function(i, chk) {
        const sel = document.getElementById('cmm-freq-' + i);
        const cw  = document.getElementById('cmm-freq-custom-' + i);
        if (sel) sel.style.display = chk?.checked ? '' : 'none';
        if (cw && !chk?.checked) cw.style.display = 'none';
    };
    window.colabMasivaToggleCustomFreq = function(i, sel) {
        const cw = document.getElementById('cmm-freq-custom-' + i);
        if (cw) cw.style.display = sel?.value === 'custom' ? '' : 'none';
    };
    window.colabMasivaApplyNombre = function() {
        const v = (document.getElementById('cmm-nombre-global')?.value || '').trim();
        _ccMasivaItems.forEach((_, i) => {
            const inp = document.getElementById(`cmm-nombre-${i}`);
            if (inp && !inp.disabled) inp.value = v;
        });
    };
    window.colabMasivaApplyDate = function() {
        const v = document.getElementById('cmm-fecha-global')?.value;
        if (!v) return;
        _ccMasivaItems.forEach((_, i) => {
            const d = document.getElementById(`cmm-date-${i}`);
            if (d && !d.disabled) d.value = v;
        });
    };
    window.colabMasivaApplyCat = function() {
        const v = (document.getElementById('cmm-cat-global')?.value || '').trim();
        _ccMasivaItems.forEach((_, i) => {
            const inp = document.getElementById(`cmm-cat-${i}`);
            if (inp && !inp.disabled) inp.value = v;
        });
    };
    window.colabMasivaCancel = function() { _ccMasivaFiles = []; _ccMasivaItems = []; };

    window.colabMasivaSubirTodos = async function() {
        if (!_ccMasivaItems.length) return;
        if (!colabRequireEdit()) return;
        const sb = window.supabaseClient;
        if (!sb) { alert('Supabase no disponible.'); return; }
        const userObj  = JSON.parse(sessionStorage.getItem('user') || '{}');
        const userName = userObj.user_metadata?.full_name || userObj.email || 'Sistema';

        const btn = document.getElementById('cmm-btn-save');
        const pw  = document.getElementById('cmm-progress-wrap');
        const pb  = document.getElementById('cmm-progress-bar');
        const st  = document.getElementById('cmm-status');
        if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Subiendo…'; }
        if (pw)  pw.classList.remove('d-none');

        const valid = _ccMasivaItems.map((item, i) => {
            const checked  = !!document.getElementById(`cmm-chk-${i}`)?.checked;
            const nombre   = (document.getElementById(`cmm-nombre-${i}`)?.value || '').trim();
            const fecha    = document.getElementById(`cmm-date-${i}`)?.value || null;
            const esRec    = !!document.getElementById(`cmm-rec-${i}`)?.checked;
            const freqSel  = document.getElementById(`cmm-freq-${i}`)?.value || '365';
            const cat      = (document.getElementById(`cmm-cat-${i}`)?.value || document.getElementById('cmm-cat-global')?.value || '').trim() || null;
            let frecDias   = null;
            if (esRec) {
                if (freqSel === 'custom') {
                    const cv = parseInt(document.getElementById(`cmm-freq-custom-${i}`)?.value || '0', 10);
                    frecDias = cv > 0 ? cv : 365;
                } else {
                    frecDias = parseInt(freqSel, 10);
                }
            }
            const skip = !checked || item.tooBig || !item.matched || !nombre;
            return { ...item, nombre, fecha, esRec, frecDias, cat, skip };
        });

        const toProcess = valid.filter(v => !v.skip);
        if (!toProcess.length) {
            if (st) st.innerHTML = '<span class="text-warning"><i class="fas fa-exclamation-triangle me-1"></i>Ningún archivo listo para subir. Revisa que cada fila tenga nombre de curso y colaborador identificado.</span>';
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-upload me-1"></i>Subir todos'; }
            if (pw) pw.classList.add('d-none');
            return;
        }

        let ok = 0, fail = 0;
        const total = toProcess.length;
        for (const item of valid) {
            const iconEl = document.getElementById(`cmm-icon-${item.idx}`);
            const rowEl  = document.getElementById(`cmm-row-${item.idx}`);
            if (item.skip) continue;
            if (iconEl) iconEl.innerHTML = '<span class="spinner-border spinner-border-sm text-primary"></span>';
            try {
                const numEmpl = String(item.numEmpl);
                const { data: ins, error: insErr } = await sb.from('colab_cursos').insert({
                    num_empleado:      numEmpl,
                    nombre:            item.nombre,
                    fecha_realizacion: item.fecha || null,
                    es_recurrente:     item.esRec,
                    frecuencia_dias:   item.frecDias,
                    categoria:         item.cat,
                    creado_por:        userName,
                }).select('id').single();
                if (insErr) throw insErr;
                const path = `${numEmpl}/${ins.id}.pdf`;
                const { error: upErr } = await sb.storage
                    .from(COLAB_CURSOS_BUCKET)
                    .upload(path, item.file, { upsert: true, contentType: 'application/pdf' });
                if (upErr) throw upErr;
                const pdfUrl = COLAB_CURSOS_BUCKET_URL + path;
                await sb.from('colab_cursos').update({ pdf_url: pdfUrl }).eq('id', ins.id);
                ok++;
                if (iconEl) iconEl.innerHTML = '<i class="fas fa-check-circle text-success"></i>';
                if (rowEl)  rowEl.classList.add('cmm-ok');
            } catch (err) {
                fail++;
                if (iconEl) iconEl.innerHTML = `<i class="fas fa-times-circle text-danger" title="${(err.message || '').replace(/"/g, '')}"></i>`;
                if (rowEl)  rowEl.classList.add('cmm-err');
                console.error('[Masiva cursos] Error en', item.file.name, err);
            }
            const done = ok + fail;
            if (pb) pb.style.width = `${Math.round((done / total) * 100)}%`;
        }

        if (st) {
            st.innerHTML = fail === 0
                ? `<span class="text-success"><i class="fas fa-check-circle me-1"></i>${ok} curso${ok !== 1 ? 's' : ''} asignado${ok !== 1 ? 's' : ''} correctamente.</span>`
                : `<span class="text-warning"><i class="fas fa-exclamation-triangle me-1"></i>${ok} correcto${ok !== 1 ? 's' : ''}, ${fail} con error.</span>`;
        }
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check me-1"></i>Listo'; }
        if (fail === 0) {
            setTimeout(() => {
                bootstrap.Modal.getInstance(document.getElementById('colabMasivaCursosModal'))?.hide();
                _ccMasivaFiles = [];
                _ccMasivaItems = [];
            }, 1800);
        }
    };
    /* ---- /ASIGNACIÓN MASIVA DE CURSOS ---- */

    /* -- Mostrar/ocultar drop zone según permisos -- */
    function colabCursosToggleDropzone() {
        const dz = document.getElementById('colab-cursos-dropzone');
        if (!dz) return;
        dz.classList.toggle('d-none', !colabCanEdit());
    }

    /* -- Inicializar eventos drag & drop en la zona -- */
    function colabCursosInitDropzone() {
        const dz = document.getElementById('colab-cursos-dropzone');
        if (!dz || dz.dataset.dzInit) return;
        dz.dataset.dzInit = '1';

        // Teclado: Enter/Space activa el click
        dz.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (!colabRequireEdit()) return;
                document.getElementById('colab-cursos-file-input')?.click();
            }
        });

        // Drag events
        dz.addEventListener('dragenter', e => { e.preventDefault(); dz.classList.add('drag-over'); });
        dz.addEventListener('dragover',  e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; dz.classList.add('drag-over'); });
        dz.addEventListener('dragleave', e => { if (!dz.contains(e.relatedTarget)) dz.classList.remove('drag-over'); });
        dz.addEventListener('drop', async e => {
            e.preventDefault();
            dz.classList.remove('drag-over');
            if (!colabRequireEdit()) return;

            // Detectar si hay carpeta entre los items
            const items = e.dataTransfer.items;
            if (items && items.length) {
                const entries = Array.from(items).map(i => i.webkitGetAsEntry?.()).filter(Boolean);
                const hasDir  = entries.some(en => en.isDirectory);
                if (hasDir) {
                    // Modo carpeta: recolectar todos los PDFs recursivamente
                    let allFiles = [];
                    for (const entry of entries) {
                        if (entry.isDirectory) {
                            const sub = await colabCursosReadFolder(entry);
                            allFiles.push(...sub);
                        } else if (entry.isFile) {
                            await new Promise(res => entry.file(f => {
                                if (f.type === 'application/pdf') allFiles.push(f);
                                res();
                            }));
                        }
                    }
                    if (!allFiles.length) { alert('No se encontraron PDFs en la carpeta.'); return; }
                    colabCursosBatchShow(allFiles);
                    return;
                }
            }
            // Modo archivo(s) suelto(s): si hay más de uno, usar batch; si es uno, modal individual
            const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
            if (!files.length) { alert('Solo se aceptan archivos PDF.'); return; }
            if (files.length === 1) {
                colabCursosDropHandleFiles(e.dataTransfer.files);
            } else {
                colabCursosBatchShow(files);
            }
        });
    }

    /* -- Procesar archivos recibidos (drag o click) -- */
    window.colabCursosDropHandleFiles = function(files) {
        if (!colabRequireEdit()) {
            const fi = document.getElementById('colab-cursos-file-input');
            if (fi) fi.value = '';
            return;
        }
        if (!files || !files.length) return;
        const file = files[0];
        if (file.type !== 'application/pdf') {
            alert('Solo se aceptan archivos PDF.');
            return;
        }
        if (file.size > 15 * 1024 * 1024) {
            alert('El archivo no puede superar 15 MB.');
            return;
        }
        _ccDropFile = file;
        // Pre-llenar nombre desde el nombre del archivo (sin extensión, limpiar guiones/guiones bajos)
        const rawName = file.name.replace(/\.pdf$/i, '').replace(/[_\-]+/g, ' ').trim();
        const nameInput = document.getElementById('cdm-nombre');
        const pdfName   = document.getElementById('cdm-pdf-name');
        const fechaInp  = document.getElementById('cdm-fecha');
        const recChk    = document.getElementById('cdm-recurrente');
        const statusEl  = document.getElementById('cdm-status');
        const descInp   = document.getElementById('cdm-desc');
        const freqWrap  = document.getElementById('cdm-freq-wrap');
        const freqSel   = document.getElementById('cdm-freq');
        const custWrap  = document.getElementById('cdm-freq-custom-wrap');
        if (pdfName)   pdfName.textContent = file.name;
        if (nameInput) nameInput.value     = rawName;
        if (descInp)   descInp.value       = '';
        const catInp = document.getElementById('cdm-categoria');
        if (catInp)    catInp.value        = '';
        if (fechaInp)  fechaInp.value      = new Date().toISOString().slice(0, 10);
        if (recChk)    recChk.checked      = false;
        if (freqWrap)  freqWrap.style.display = 'none';
        if (freqSel)   freqSel.value       = '365';
        if (custWrap)  custWrap.style.display = 'none';
        if (statusEl)  statusEl.innerHTML  = '';
        const btn = document.getElementById('cdm-btn-save');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save me-1"></i>Guardar curso'; }
        // Abrir modal
        const modal = new bootstrap.Modal(document.getElementById('colabDropCursoModal'));
        modal.show();
        // Enfocar el nombre para editarlo fácilmente
        setTimeout(() => nameInput?.select(), 350);
    };

    /* -- Toggles frecuencia en el modal quick-fill -- */
    window.colabDropCursoToggleFreq = function(chk) {
        const w = document.getElementById('cdm-freq-wrap');
        if (w) w.style.display = chk?.checked ? '' : 'none';
        if (!chk?.checked) {
            const cw = document.getElementById('cdm-freq-custom-wrap');
            if (cw) cw.style.display = 'none';
        }
    };
    window.colabDropCursoToggleCustom = function(sel) {
        const cw = document.getElementById('cdm-freq-custom-wrap');
        if (cw) cw.style.display = sel?.value === 'custom' ? '' : 'none';
    };

    /* -- Cancelar: limpiar archivo pendiente -- */
    window.colabDropCursoCancel = function() {
        _ccDropFile = null;
        const fi = document.getElementById('colab-cursos-file-input');
        if (fi) fi.value = '';
    };

    /* -- Guardar: subir PDF + insertar registro -- */
    window.colabDropCursoGuardar = async function() {
        if (!_ccDropFile) { alert('No hay archivo seleccionado.'); return; }
        if (!colabRequireEdit()) return;

        const nombre = (document.getElementById('cdm-nombre')?.value || '').trim();
        if (!nombre) {
            document.getElementById('cdm-status').innerHTML = '<span class="text-danger">El nombre del curso es obligatorio.</span>';
            document.getElementById('cdm-nombre')?.focus();
            return;
        }
        const numEmpl = val(gc(colabCurrentRow, 'num'));
        if (!numEmpl) {
            document.getElementById('cdm-status').innerHTML = '<span class="text-danger">No se detectó el colaborador activo.</span>';
            return;
        }

        const desc        = (document.getElementById('cdm-desc')?.value || '').trim() || null;
        const fecha       = document.getElementById('cdm-fecha')?.value || null;
        const esRec       = !!document.getElementById('cdm-recurrente')?.checked;
        let frecDias = null;
        if (esRec) {
            const sel = document.getElementById('cdm-freq');
            if (sel?.value === 'custom') {
                const cv = parseInt(document.getElementById('cdm-freq-custom')?.value || '0', 10);
                if (!cv || cv < 1) {
                    document.getElementById('cdm-status').innerHTML = '<span class="text-danger">Ingresa un número válido de días.</span>';
                    return;
                }
                frecDias = cv;
            } else {
                frecDias = parseInt(sel?.value || '365', 10);
            }
        }

        const btn      = document.getElementById('cdm-btn-save');
        const statusEl = document.getElementById('cdm-status');
        if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Guardando…'; }
        if (statusEl) statusEl.innerHTML = '';

        try {
            const sb = window.supabaseClient;
            if (!sb) throw new Error('Supabase no disponible');

            const userObj  = JSON.parse(sessionStorage.getItem('user') || '{}');
            const userName = userObj.user_metadata?.full_name || userObj.email || 'Sistema';

            // 1. Insertar el registro (obtenemos el id generado)
            const { data: inserted, error: insErr } = await sb.from('colab_cursos').insert({
                num_empleado:     String(numEmpl),
                nombre:           nombre,
                descripcion:      desc,
                fecha_realizacion:fecha || null,
                es_recurrente:    esRec,
                frecuencia_dias:  frecDias,
                creado_por:       userName,
            }).select('id').single();
            if (insErr) throw insErr;

            // 2. Subir el PDF al bucket con path: numEmpl/id.pdf
            const path   = `${numEmpl}/${inserted.id}.pdf`;
            if (statusEl) statusEl.innerHTML = '<span class="text-primary"><span class="spinner-border spinner-border-sm me-1"></span>Subiendo PDF)</span>';
            const { error: upErr } = await sb.storage
                .from(COLAB_CURSOS_BUCKET)
                .upload(path, _ccDropFile, { upsert: true, contentType: 'application/pdf' });
            if (upErr) throw upErr;

            // 3. Actualizar el registro con la URL pública del PDF
            const pdfUrl = COLAB_CURSOS_BUCKET_URL + path;
            const { error: updErr } = await sb.from('colab_cursos').update({ pdf_url: pdfUrl }).eq('id', inserted.id);
            if (updErr) throw updErr;

            if (statusEl) statusEl.innerHTML = '<span class="text-success"><i class="fas fa-check me-1"></i> Guardado correctamente!</span>';

            // Cerrar modal y refrescar lista
            setTimeout(async () => {
                bootstrap.Modal.getInstance(document.getElementById('colabDropCursoModal'))?.hide();
                _ccDropFile = null;
                const fi = document.getElementById('colab-cursos-file-input');
                if (fi) fi.value = '';
                await colabCargarCursos(numEmpl);
            }, 800);

        } catch (err) {
            console.error('[Cursos drop] Error:', err);
            if (statusEl) statusEl.innerHTML = `<span class="text-danger"><i class="fas fa-exclamation-circle me-1"></i>${err.message || 'Error al guardar.'}</span>`;
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save me-1"></i>Guardar curso'; }
        }
    };

    /* ============================================================
     *  Contrato de ciclo de vida del módulo.
     *
     *  Antes esto se encendía solo al cargar la página. Si la sección no
     *  estaba visible —lo normal— programaba una "precarga silenciosa" a los
     *  1500 ms que se traía la plantilla entera de la base, la abriera o no
     *  alguien. Ese trabajo ya no se hace a ciegas: se hace al abrir.
     * ========================================================== */
    var _cableado = false;

    window.initColaboradores = function () {
        if (!_cableado) {
            _cableado = true;
            initColabEvents();
            // El rol llega de forma asíncrona: hay que reevaluar los botones
            // cuando el login termine.
            window.addEventListener('aifa:login', () => colabActualizarBotonesAdmin());
        }
        colabActualizarBotonesAdmin();
        colabRenderDashboard();
    };

    // Al salir se sueltan las cuatro gráficas del panel. Los datos ya
    // cargados (colabCache) se conservan a propósito: volver a entrar no debe
    // reconsultar la base, y para forzarlo está el botón de refrescar.
    window.destroyColaboradores = function () {
        ['cd-chart-dir', 'cd-chart-subdir', 'cd-chart-ger', 'cd-chart-nivel'].forEach(function (id) {
            try {
                var el = document.getElementById(id);
                if (!el || typeof Chart === 'undefined' || !Chart.getChart) return;
                var c = Chart.getChart(el);
                if (c) c.destroy();
            } catch (_) {}
        });
    };

})();
