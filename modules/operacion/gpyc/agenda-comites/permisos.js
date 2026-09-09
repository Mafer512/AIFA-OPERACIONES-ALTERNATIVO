/* ============================================================
 *  Agenda de Comites · sesion, permisos y cableado de la vista.
 *
 *  Esto vivia dentro de script.js, al final del archivo, y se evaluaba en
 *  cada carga de la pagina. Es un IIFE cerrado: expone window.agInitSection
 *  y nada de fuera depende de sus variables internas, asi que sale entero.
 *
 *  Lee el rol de sessionStorage para decidir que botones se ven. Eso NO es
 *  una barrera de seguridad -- la proteccion real son las politicas RLS de
 *  Supabase, del lado del servidor. Aqui solo se evita ofrecer acciones que
 *  la base va a rechazar.
 * ========================================================== */
(function () {
    'use strict';

    // ── Estado del módulo ──
    let _initialized = false;
    let _currentArea = 'all';   // filtro activo
    let _userRole = null;
    let _editableAreas = [];    // áreas que el usuario puede editar

    // Mapa área → etiqueta legible
    const AREA_LABELS = {
        DO:   'Dir. de Operación',
        DA:   'Dir. de Administración',
        DPE:  'Dir. Planeación',
        DCS:  'Dir. Comercial',
        GSO:  'Seg. Operacional',
        UT:   'Transparencia',
        GC:   'Calidad',
        AFAC: 'AFAC',
    };

    // Iconos por área
    const AREA_ICONS = {
        DO:   'fa-plane',
        DA:   'fa-briefcase',
        DPE:  'fa-chart-line',
        DCS:  'fa-store',
        GSO:  'fa-shield-alt',
        UT:   'fa-eye',
        GC:   'fa-medal',
        AFAC: 'fa-id-card',
    };

    // Colores por área (badge background / text)
    const AREA_COLORS = {
        DO:   { bg:'#dbeafe', text:'#1e40af' },
        DA:   { bg:'#fee2e2', text:'#991b1b' },
        DPE:  { bg:'#ede9fe', text:'#5b21b6' },
        DCS:  { bg:'#fef3c7', text:'#92400e' },
        GSO:  { bg:'#dcfce7', text:'#166534' },
        UT:   { bg:'#e0f2fe', text:'#0c4a6e' },
        GC:   { bg:'#fdf4ff', text:'#7e22ce' },
        AFAC: { bg:'#f1f5f9', text:'#334155' },
    };

    // Determina qué áreas puede editar según el rol del usuario
    // Prioridad: admin/superadmin → todo | user_area en sessionStorage → solo esa área
    //            roles legacy → mapa fijo | role=clave directa → esa clave
    //            editor/viewer/colab sin área → solo lectura
    const _AG_GLOBAL_ROLES_SJS = ['admin','superadmin','editor','viewer','colab_viewer','colab_editor'];
    const _AG_LEGACY_MAP_SJS   = { operacion:'DO', administracion:'DA', planeacion:'DPE', comercial:'DCS', seguridad_op:'GSO', transparencia:'UT', calidad:'GC' };
    function resolveEditableAreas(role) {
        if (['admin', 'superadmin'].includes(role)) {
            return Object.keys(AREA_LABELS);
        }
        // Área asignada explícitamente (permissions.area → sessionStorage.user_area)
        const userArea = sessionStorage.getItem('user_area');
        if (userArea) return [userArea];
        // Mapa legacy de roles descriptivos
        if (_AG_LEGACY_MAP_SJS[role]) return [_AG_LEGACY_MAP_SJS[role]];
        // Role IS la clave directamente (esquema v2: role='DO', 'GSO', etc.)
        if (!_AG_GLOBAL_ROLES_SJS.includes(role) && role) return [role];
        return [];  // editor/viewer/colab sin área asignada → solo lectura
    }

    // ── Inicialización ──
    window.agInitSection = function () {
        _userRole = sessionStorage.getItem('user_role') || 'viewer';
        _editableAreas = resolveEditableAreas(_userRole);

        // Mostrar botón "Nuevo Comité" solo si puede editar
        const btnNuevoComite = document.getElementById('ag-btn-nuevo-comite');
        const btnNuevaReunion = document.getElementById('ag-btn-nueva-reunion-tab');
        if (btnNuevoComite)  btnNuevoComite.style.display  = _editableAreas.length ? '' : 'none';
        if (btnNuevaReunion) btnNuevaReunion.style.display = _editableAreas.length ? '' : 'none';

        // Mostrar/ocultar filtro de área según la pestaña activa
        const TABS_WITH_FILTER = ['#ag-pane-comites', '#ag-pane-reuniones', '#ag-pane-acuerdos'];
        function _toggleAreaFilter(targetPane) {
            const fil = document.getElementById('ag-area-filters');
            if (fil) fil.style.display = TABS_WITH_FILTER.includes(targetPane) ? '' : 'none';
        }
        document.querySelectorAll('#ag-main-tabs .nav-link').forEach(btn => {
            btn.addEventListener('shown.bs.tab', function () {
                _toggleAreaFilter(btn.getAttribute('data-bs-target'));
            });
        });
        // Estado inicial (Calendario, empieza oculto)
        _toggleAreaFilter('#ag-pane-calendario');

        if (!_initialized) {
            _initialized = true;
        }
        agLoadCalendario();
    };

    // ── Utilidades ──
    function sb() { return window.supabaseClient; }

    function agAreaBadge(area) {
        const label  = AREA_LABELS[area]  || area;
        const icon   = AREA_ICONS[area]   || 'fa-tag';
        const colors = AREA_COLORS[area]  || { bg:'#e5e7eb', text:'#374151' };
        return `<span class="ag-area-badge" style="background:${colors.bg};color:${colors.text}"><i class="fas ${icon}"></i>${label}</span>`;
    }

    function agStatusBadge(status) {
        return `<span class="ag-status-badge ag-status-${status}">${status}</span>`;
    }

    function agEsc(str) {
        if (str == null) return '';
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ── Filtro de área ──
    window.agFilterArea = function (area, btn) {
        _currentArea = area;
        document.querySelectorAll('.ag-filter-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        // Sincronizar select
        const sel = document.getElementById('ag-area-select');
        if (sel && sel.value !== area) sel.value = area;

        // Refrescar la pestaña activa
        const activeTab = document.querySelector('#ag-main-tabs .nav-link.active');
        if (activeTab) {
            const target = activeTab.getAttribute('data-bs-target');
            if (target === '#ag-pane-comites')    agLoadComites();
            if (target === '#ag-pane-reuniones')  agLoadReuniones();
            if (target === '#ag-pane-acuerdos')   agLoadAcuerdos();
            if (target === '#ag-pane-calendario') agLoadCalendario();
        }
    };

    // ── COMITÉS ──
    window.agLoadComites = async function () {
        // Re-evaluar áreas editables con sessionStorage fresco (por si user_area
        // fue seteado después de la inicialización por el re-fetch async)
        _userRole      = sessionStorage.getItem('user_role') || 'viewer';
        _editableAreas = resolveEditableAreas(_userRole);

        const loading = document.getElementById('ag-comites-loading');
        const grid    = document.getElementById('ag-comites-grid');
        const empty   = document.getElementById('ag-comites-empty');
        if (!loading || !grid) return;

        loading.style.display = '';
        grid.style.display    = 'none';
        empty.classList.add('d-none');

        try {
            let query = sb().from('agenda_comites').select('*').eq('activo', true).order('area').order('nombre');
            if (_currentArea !== 'all') query = query.eq('area', _currentArea);

            const { data, error } = await query;
            loading.style.display = 'none';

            if (error) { console.error('[Agenda] Error comités:', error); return; }
            if (!data || data.length === 0) {
                empty.classList.remove('d-none'); return;
            }

            grid.innerHTML = data.map(c => agComiteCard(c)).join('');
            grid.style.display = '';

            // Mostrar botón solo si hay áreas editables
            const btnNuevoComite = document.getElementById('ag-btn-nuevo-comite');
            if (btnNuevoComite) btnNuevoComite.style.display = _editableAreas.length ? '' : 'none';
        } catch (err) {
            loading.style.display = 'none';
            console.error('[Agenda] Error cargando comités:', err);
        }
    };

    function agComiteCard(c) {
        const canEdit = _editableAreas.includes(c.area);
        const participantes = Array.isArray(c.participantes) ? c.participantes.join(', ') : (c.participantes || '—');
        const clockBtn = canEdit ? `<button
            data-clock-id="${agEsc(c.id)}"
            onclick="event.stopPropagation();agToggleHorarioFijo('${agEsc(c.id)}')"
            title="${c.horario_fijo ? 'Quitar horario preestablecido' : 'Marcar como horario preestablecido (mismas fechas cada año)'}"
            style="border:1.5px solid ${c.horario_fijo ? '#fbbf24' : '#d1d5db'};
                   background:${c.horario_fijo ? '#fffbeb' : '#f9fafb'};
                   color:${c.horario_fijo ? '#d97706' : '#9ca3af'};
                   border-radius:6px;padding:2px 8px;font-size:.78rem;cursor:pointer"
            class="btn btn-sm py-0 px-2">
            <i class="fas fa-clock"></i>
          </button>` : '';
        return `
        <div class="col-md-6 col-xl-4">
            <div class="ag-card-comite p-3 h-100 d-flex flex-column" onclick="agOpenDetalleComite('${agEsc(c.id)}')">
                <div class="d-flex justify-content-between align-items-start mb-2 flex-wrap gap-1">
                    <div class="d-flex align-items-center gap-1">
                      ${agAreaBadge(c.area)}
                      ${c.horario_fijo ? `<span title="Horario preestablecido" style="font-size:.72rem;color:#d97706;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:1px 5px"><i class="fas fa-clock"></i></span>` : ''}
                    </div>
                    <div class="d-flex gap-1">
                      ${clockBtn}
                      ${canEdit ? `<button class="btn btn-outline-secondary btn-sm py-0 px-2" onclick="event.stopPropagation();agOpenEditComite('${agEsc(c.id)}')" title="Editar"><i class="fas fa-pen"></i></button>` : ''}
                    </div>
                </div>
                <h6 class="fw-bold mb-1 flex-grow-1">${agEsc(c.nombre)}</h6>
                <p class="small text-muted mb-2">${agEsc(c.descripcion || '')}</p>
                <div class="small d-flex flex-wrap gap-2">
                    <span><i class="fas fa-sync-alt text-muted me-1"></i>${agEsc(c.frecuencia || '—')}</span>
                    <span><i class="fas fa-user-tie text-muted me-1"></i>${agEsc(c.presidente || '—')}</span>
                </div>
                ${participantes ? `<p class="small text-muted mt-1 mb-0"><i class="fas fa-users me-1"></i>${agEsc(participantes)}</p>` : ''}
            </div>
        </div>`;
    }

    window.agToggleHorarioFijo = async function (comiteId) {
        const btn = document.querySelector(`[data-clock-id="${comiteId}"]`);
        if (btn) { btn.disabled = true; btn.style.opacity = '.5'; }
        try {
            const { data: cur } = await sb().from('agenda_comites').select('horario_fijo').eq('id', comiteId).single();
            const newVal = !(cur?.horario_fijo ?? false);
            const { error } = await sb().from('agenda_comites').update({ horario_fijo: newVal }).eq('id', comiteId);
            if (error) throw error;
            agLoadComites();
        } catch (err) {
            if (btn) { btn.disabled = false; btn.style.opacity = ''; }
            alert('Error: ' + (err.message || err));
        }
    };

    // ── REUNIONES ──
    window.agLoadReuniones = async function () {
        // Re-evaluar con sessionStorage fresco
        _userRole      = sessionStorage.getItem('user_role') || 'viewer';
        _editableAreas = resolveEditableAreas(_userRole);

        const loading = document.getElementById('ag-reuniones-loading');
        const list    = document.getElementById('ag-reuniones-list');
        const empty   = document.getElementById('ag-reuniones-empty');
        if (!loading || !list) return;

        loading.style.display = '';
        list.style.display    = 'none';
        empty.classList.add('d-none');

        const filtroEstatus = document.getElementById('ag-reuniones-filtro-estatus')?.value || '';
        const filtroMes     = document.getElementById('ag-reuniones-filtro-mes')?.value   || '';

        try {
            let query = sb()
                .from('agenda_reuniones')
                .select(`*, agenda_comites(nombre, area)`)
                .order('fecha_sesion', { ascending: false });

            if (_currentArea !== 'all') query = query.eq('area', _currentArea);
            if (filtroEstatus)          query = query.eq('estatus', filtroEstatus);
            if (filtroMes) {
                const [y, m] = filtroMes.split('-');
                const desde = `${y}-${m}-01`;
                const hasta = new Date(Number(y), Number(m), 0).toISOString().slice(0,10);
                query = query.gte('fecha_sesion', desde).lte('fecha_sesion', hasta);
            }

            const { data, error } = await query;
            loading.style.display = 'none';

            if (error) { console.error('[Agenda] Error reuniones:', error); return; }
            if (!data || data.length === 0) { empty.classList.remove('d-none'); return; }

            list.innerHTML = data.map(r => agReunionRow(r)).join('');
            list.style.display = '';
        } catch (err) {
            loading.style.display = 'none';
            console.error('[Agenda] Error cargando reuniones:', err);
        }
    };

    function agReunionRow(r) {
        const comiteNombre = r.agenda_comites?.nombre || '—';
        const canEdit = _editableAreas.includes(r.area);
        const fecha = r.fecha_sesion ? new Date(r.fecha_sesion + 'T12:00:00').toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' }) : '—';
        return `
        <div class="card border-0 shadow-sm mb-2">
            <div class="card-body py-2 px-3 d-flex flex-wrap align-items-center justify-content-between gap-2">
                <div>
                    <div class="fw-semibold small">${agEsc(r.numero_sesion || comiteNombre)}</div>
                    <div class="text-muted small">${agEsc(comiteNombre)} &mdash; ${fecha}</div>
                    <div class="small mt-1">${agAreaBadge(r.area)} ${agStatusBadge(r.estatus)}</div>
                </div>
                <div class="d-flex gap-2 align-items-center">
                    <span class="small text-muted"><i class="fas fa-map-marker-alt me-1"></i>${agEsc(r.lugar || '—')}</span>
                    <button class="btn btn-outline-secondary btn-sm py-0" onclick="agOpenDetalleReunion('${agEsc(r.id)}')"><i class="fas fa-eye"></i></button>
                    ${canEdit ? `<button class="btn btn-outline-primary btn-sm py-0" onclick="agOpenEditReunion('${agEsc(r.id)}')"><i class="fas fa-pen"></i></button>` : ''}
                </div>
            </div>
        </div>`;
    }

    // ── ACUERDOS ──
    window.agLoadAcuerdos = async function () {
        // Re-evaluar con sessionStorage fresco
        _userRole      = sessionStorage.getItem('user_role') || 'viewer';
        _editableAreas = resolveEditableAreas(_userRole);

        const loading = document.getElementById('ag-acuerdos-loading');
        const list    = document.getElementById('ag-acuerdos-list');
        const empty   = document.getElementById('ag-acuerdos-empty');
        if (!loading || !list) return;

        loading.style.display = '';
        list.style.display    = 'none';
        empty.classList.add('d-none');

        const filtroEstatus = document.getElementById('ag-acuerdos-filtro-estatus')?.value || '';

        try {
            let query = sb()
                .from('agenda_acuerdos')
                .select(`*, agenda_reuniones(fecha_sesion, numero_sesion, agenda_comites(nombre))`)
                .order('created_at', { ascending: false })
                .limit(150);

            if (_currentArea !== 'all') query = query.eq('area', _currentArea);
            if (filtroEstatus)          query = query.eq('estatus', filtroEstatus);

            const { data, error } = await query;
            loading.style.display = 'none';

            if (error) { console.error('[Agenda] Error acuerdos:', error); return; }
            if (!data || data.length === 0) { empty.classList.remove('d-none'); return; }

            list.innerHTML = data.map(a => agAcuerdoRow(a)).join('');
            list.style.display = '';
        } catch (err) {
            loading.style.display = 'none';
            console.error('[Agenda] Error cargando acuerdos:', err);
        }
    };

    function agAcuerdoRow(a) {
        const canEdit = _editableAreas.includes(a.area);
        const sesion  = a.agenda_reuniones?.numero_sesion || a.agenda_reuniones?.agenda_comites?.nombre || '—';
        const fecha   = a.fecha_limite
            ? new Date(a.fecha_limite + 'T12:00:00').toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' })
            : '—';
        return `
        <div class="card border-0 shadow-sm mb-2">
            <div class="card-body py-2 px-3">
                <div class="d-flex flex-wrap justify-content-between align-items-start gap-2">
                    <div>
                        <div class="fw-semibold small">${agEsc(a.numero_acuerdo || a.id.slice(0,8).toUpperCase())} — ${agEsc(a.descripcion)}</div>
                        <div class="text-muted small mt-1">${agEsc(sesion)} &mdash; <i class="fas fa-user me-1"></i>${agEsc(a.responsable || '—')} &mdash; <i class="fas fa-calendar-day me-1"></i>${fecha}</div>
                        <div class="mt-1">${agAreaBadge(a.area)} ${agStatusBadge(a.estatus)}</div>
                    </div>
                    ${canEdit ? `
                    <div>
                        <button class="btn btn-sm btn-outline-primary py-0" onclick="agOpenEditAcuerdo('${agEsc(a.id)}')"><i class="fas fa-pen"></i></button>
                    </div>` : ''}
                </div>
            </div>
        </div>`;
    }

    // ── MODAL: NUEVA REUNIÓN ──
    window.agOpenNuevaReunion = async function () {
        // Obtener comités según área del usuario
        let comitesDisp = [];
        try {
            let q = sb().from('agenda_comites').select('id,nombre,area').eq('activo', true).order('nombre');
            if (_editableAreas.length && !['admin','editor','superadmin'].includes(_userRole)) {
                q = q.in('area', _editableAreas);
            }
            const { data } = await q;
            comitesDisp = data || [];
        } catch (_) {}

        const optionsHtml = comitesDisp.map(c =>
            `<option value="${agEsc(c.id)}" data-area="${agEsc(c.area)}">${agEsc(c.nombre)}</option>`
        ).join('');

        const modalHtml = `
        <div class="modal fade" id="ag-modal-reunion" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title"><i class="fas fa-calendar-plus me-2"></i>Nueva Reunión</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row g-3">
                            <div class="col-md-8">
                                <label class="form-label fw-semibold">Comité <span class="text-danger">*</span></label>
                                <select class="form-select" id="ag-nr-comite" required>${optionsHtml}</select>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label fw-semibold">Número de Sesión</label>
                                <input class="form-control" id="ag-nr-numero" placeholder="Ej: Sesión Ord. 03/2026">
                            </div>
                            <div class="col-md-4">
                                <label class="form-label fw-semibold">Fecha <span class="text-danger">*</span></label>
                                <input type="date" class="form-control" id="ag-nr-fecha" required>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label fw-semibold">Hora inicio</label>
                                <input type="time" class="form-control" id="ag-nr-hora-ini">
                            </div>
                            <div class="col-md-4">
                                <label class="form-label fw-semibold">Hora fin</label>
                                <input type="time" class="form-control" id="ag-nr-hora-fin">
                            </div>
                            <div class="col-md-8">
                                <label class="form-label fw-semibold">Lugar</label>
                                <input class="form-control" id="ag-nr-lugar" value="Sala de Juntas AIFA">
                            </div>
                            <div class="col-md-4">
                                <label class="form-label fw-semibold">Modalidad</label>
                                <select class="form-select" id="ag-nr-modalidad">
                                    <option>Presencial</option><option>Virtual</option><option>Mixta</option>
                                </select>
                            </div>
                            <div class="col-12">
                                <label class="form-label fw-semibold">Orden del Día (convocatoria)</label>
                                <textarea class="form-control" id="ag-nr-convocatoria" rows="4" placeholder="Puntos del orden del día..."></textarea>
                            </div>
                            <div class="col-12">
                                <label class="form-label fw-semibold">Observaciones</label>
                                <textarea class="form-control" id="ag-nr-obs" rows="2"></textarea>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button class="btn btn-primary" id="ag-nr-save" onclick="agSaveNuevaReunion()">
                            <i class="fas fa-save me-1"></i>Guardar
                        </button>
                    </div>
                </div>
            </div>
        </div>`;

        // Eliminar modal previo si existe
        const prev = document.getElementById('ag-modal-reunion');
        if (prev) prev.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = new bootstrap.Modal(document.getElementById('ag-modal-reunion'));
        modal.show();
    };

    window.agSaveNuevaReunion = async function () {
        const comiteEl = document.getElementById('ag-nr-comite');
        const comiteId = comiteEl?.value;
        const area     = comiteEl?.selectedOptions[0]?.dataset.area;
        const fecha    = document.getElementById('ag-nr-fecha')?.value;

        if (!comiteId || !fecha) {
            alert('Por favor completa los campos obligatorios (Comité y Fecha).');
            return;
        }

        const payload = {
            comite_id:     comiteId,
            area:          area,
            numero_sesion: document.getElementById('ag-nr-numero')?.value?.trim() || null,
            fecha_sesion:  fecha,
            hora_inicio:   document.getElementById('ag-nr-hora-ini')?.value   || null,
            hora_fin:      document.getElementById('ag-nr-hora-fin')?.value   || null,
            lugar:         document.getElementById('ag-nr-lugar')?.value?.trim() || 'Sala de Juntas AIFA',
            modalidad:     document.getElementById('ag-nr-modalidad')?.value  || 'Presencial',
            convocatoria:  document.getElementById('ag-nr-convocatoria')?.value?.trim() || null,
            observaciones: document.getElementById('ag-nr-obs')?.value?.trim() || null,
            estatus:       'Programada',
        };

        const btn = document.getElementById('ag-nr-save');
        const prevHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Guardando…';

        try {
            const { error } = await sb().from('agenda_reuniones').insert([payload]);
            if (error) throw error;
            bootstrap.Modal.getInstance(document.getElementById('ag-modal-reunion'))?.hide();
            agLoadReuniones();
        } catch (err) {
            alert('Error al guardar: ' + (err.message || err));
            btn.disabled = false;
            btn.innerHTML = prevHtml;
        }
    };

    // ── MODAL: DETALLE REUNIÓN ──
    window.agOpenDetalleReunion = async function (reunionId) {
        try {
            const { data, error } = await sb()
                .from('agenda_reuniones')
                .select('*, agenda_comites(nombre, area), agenda_temas(*), agenda_acuerdos(*)')
                .eq('id', reunionId)
                .single();

            if (error || !data) { alert('No se pudo cargar la reunión.'); return; }

            const canEdit = _editableAreas.includes(data.area);
            const fecha = data.fecha_sesion
                ? new Date(data.fecha_sesion + 'T12:00:00').toLocaleDateString('es-MX', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })
                : '—';

            const temasHtml = (data.agenda_temas || []).sort((a,b)=>a.numero_punto-b.numero_punto).map(t => `
                <tr>
                    <td>${t.numero_punto}</td>
                    <td>${agEsc(t.titulo)}</td>
                    <td>${agEsc(t.responsable || '—')}</td>
                    <td>${agStatusBadge(t.estatus)}</td>
                    ${canEdit ? `<td><button class="btn btn-xs btn-outline-danger py-0 px-1" onclick="agDeleteTema('${agEsc(t.id)}','${agEsc(reunionId)}')" title="Eliminar"><i class="fas fa-trash"></i></button></td>` : '<td></td>'}
                </tr>`).join('') || '<tr><td colspan="5" class="text-center text-muted">Sin puntos registrados</td></tr>';

            const acuerdosHtml = (data.agenda_acuerdos || []).map(a => `
                <tr>
                    <td>${agEsc(a.numero_acuerdo || '—')}</td>
                    <td>${agEsc(a.descripcion)}</td>
                    <td>${agEsc(a.responsable || '—')}</td>
                    <td>${a.fecha_limite || '—'}</td>
                    <td>${agStatusBadge(a.estatus)}</td>
                </tr>`).join('') || '<tr><td colspan="5" class="text-center text-muted">Sin acuerdos registrados</td></tr>';

            const modalHtml = `
            <div class="modal fade" id="ag-modal-detalle" tabindex="-1">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header" style="background:#1e1b4b;color:#fff">
                            <h5 class="modal-title"><i class="fas fa-calendar-check me-2"></i>${agEsc(data.numero_sesion || data.agenda_comites?.nombre || 'Reunión')}</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row g-2 mb-3 small">
                                <div class="col-auto">${agAreaBadge(data.area)}</div>
                                <div class="col-auto">${agStatusBadge(data.estatus)}</div>
                                <div class="col-auto text-muted"><i class="fas fa-calendar-day me-1"></i>${fecha}</div>
                                <div class="col-auto text-muted"><i class="fas fa-map-marker-alt me-1"></i>${agEsc(data.lugar || '—')}</div>
                                <div class="col-auto text-muted"><i class="fas fa-video me-1"></i>${agEsc(data.modalidad || '—')}</div>
                            </div>
                            ${data.convocatoria ? `<div class="mb-3 p-3 rounded bg-light small"><strong>Orden del día:</strong><br>${agEsc(data.convocatoria).replace(/\n/g,'<br>')}</div>` : ''}

                            <!-- Temas -->
                            <h6 class="fw-bold mt-3"><i class="fas fa-list-ol me-1 text-primary"></i>Puntos del Orden del Día</h6>
                            ${canEdit ? `
                            <div class="d-flex gap-2 mb-2">
                                <input class="form-control form-control-sm" id="ag-nt-titulo" placeholder="Punto a tratar…">
                                <input class="form-control form-control-sm" id="ag-nt-responsable" placeholder="Responsable" style="max-width:180px">
                                <button class="btn btn-sm btn-primary" onclick="agAddTema('${agEsc(reunionId)}','${agEsc(data.area)}')"><i class="fas fa-plus"></i></button>
                            </div>` : ''}
                            <div class="table-responsive">
                                <table class="table table-sm table-hover small" id="ag-temas-table">
                                    <thead class="table-light"><tr><th>#</th><th>Tema</th><th>Responsable</th><th>Estatus</th><th></th></tr></thead>
                                    <tbody>${temasHtml}</tbody>
                                </table>
                            </div>

                            <!-- Acuerdos -->
                            <h6 class="fw-bold mt-3"><i class="fas fa-handshake me-1 text-success"></i>Acuerdos</h6>
                            ${canEdit ? `
                            <div class="row g-2 mb-2">
                                <div class="col-md-1"><input class="form-control form-control-sm" id="ag-na-numero" placeholder="ACU-01"></div>
                                <div class="col-md-4"><input class="form-control form-control-sm" id="ag-na-desc" placeholder="Descripción del acuerdo…"></div>
                                <div class="col-md-3"><input class="form-control form-control-sm" id="ag-na-resp" placeholder="Responsable"></div>
                                <div class="col-md-2"><input type="date" class="form-control form-control-sm" id="ag-na-fecha"></div>
                                <div class="col-md-2"><button class="btn btn-sm btn-success w-100" onclick="agAddAcuerdo('${agEsc(reunionId)}','${agEsc(data.area)}')"><i class="fas fa-plus me-1"></i>Agregar</button></div>
                            </div>` : ''}
                            <div class="table-responsive">
                                <table class="table table-sm table-hover small">
                                    <thead class="table-light"><tr><th>N°</th><th>Acuerdo</th><th>Responsable</th><th>Fecha límite</th><th>Estatus</th></tr></thead>
                                    <tbody id="ag-acuerdos-tbody">${acuerdosHtml}</tbody>
                                </table>
                            </div>
                        </div>
                        <div class="modal-footer">
                            ${canEdit ? `<button class="btn btn-warning btn-sm" onclick="agOpenEditReunion('${agEsc(reunionId)}')"><i class="fas fa-pen me-1"></i>Editar reunión</button>` : ''}
                            <button class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
                        </div>
                    </div>
                </div>
            </div>`;

            const prev = document.getElementById('ag-modal-detalle');
            if (prev) prev.remove();
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            new bootstrap.Modal(document.getElementById('ag-modal-detalle')).show();
        } catch (err) {
            console.error('[Agenda] Error detalle reunión:', err);
        }
    };

    // ── AGREGAR TEMA ──
    window.agAddTema = async function (reunionId, area) {
        const titulo = document.getElementById('ag-nt-titulo')?.value?.trim();
        if (!titulo) { alert('El título del punto es obligatorio.'); return; }
        const resp  = document.getElementById('ag-nt-responsable')?.value?.trim() || null;

        // Calcular numero_punto
        const tbody = document.querySelector('#ag-temas-table tbody');
        const numPunto = (tbody?.querySelectorAll('tr').length || 0) + 1;

        const { error } = await sb().from('agenda_temas').insert([{
            reunion_id: reunionId, area, titulo, responsable: resp,
            numero_punto: numPunto, estatus: 'Pendiente'
        }]);

        if (error) { alert('Error: ' + error.message); return; }
        agOpenDetalleReunion(reunionId);  // refrescar
    };

    // ── ELIMINAR TEMA ──
    window.agDeleteTema = async function (temaId, reunionId) {
        if (!confirm('¿Eliminar este punto del orden del día?')) return;
        const { error } = await sb().from('agenda_temas').delete().eq('id', temaId);
        if (error) { alert('Error: ' + error.message); return; }
        agOpenDetalleReunion(reunionId);
    };

    // ── AGREGAR ACUERDO ──
    window.agAddAcuerdo = async function (reunionId, area) {
        const desc = document.getElementById('ag-na-desc')?.value?.trim();
        if (!desc) { alert('La descripción del acuerdo es obligatoria.'); return; }
        const numero = document.getElementById('ag-na-numero')?.value?.trim() || null;
        const resp   = document.getElementById('ag-na-resp')?.value?.trim()   || null;
        const fecha  = document.getElementById('ag-na-fecha')?.value          || null;

        const { error } = await sb().from('agenda_acuerdos').insert([{
            reunion_id: reunionId, area, descripcion: desc,
            numero_acuerdo: numero, responsable: resp, fecha_limite: fecha, estatus: 'Pendiente'
        }]);

        if (error) { alert('Error: ' + error.message); return; }
        agOpenDetalleReunion(reunionId);
    };

    // ── MODAL: DETALLE COMITÉ ──
    window.agOpenDetalleComite = async function (comiteId) {
        try {
            const { data: c, error } = await sb()
                .from('agenda_comites').select('*').eq('id', comiteId).single();
            if (error || !c) return;

            // Últimas 5 reuniones
            const { data: reuniones } = await sb()
                .from('agenda_reuniones')
                .select('id, numero_sesion, fecha_sesion, estatus')
                .eq('comite_id', comiteId)
                .order('fecha_sesion', { ascending: false })
                .limit(5);

            const canEdit = _editableAreas.includes(c.area);
            const participantes = Array.isArray(c.participantes)
                ? c.participantes.map(p => `<li>${agEsc(p)}</li>`).join('')
                : (c.participantes ? `<li>${agEsc(c.participantes)}</li>` : '<li class="text-muted">—</li>');

            const reunionesHtml = (reuniones || []).map(r => {
                const fecha = r.fecha_sesion
                    ? new Date(r.fecha_sesion+'T12:00:00').toLocaleDateString('es-MX', {day:'2-digit',month:'short',year:'numeric'})
                    : '—';
                return `<tr>
                    <td>${agEsc(r.numero_sesion || '—')}</td>
                    <td>${fecha}</td>
                    <td>${agStatusBadge(r.estatus)}</td>
                    <td><button class="btn btn-xs btn-outline-primary py-0 px-1" onclick="agOpenDetalleReunion('${agEsc(r.id)}')"><i class="fas fa-eye"></i></button></td>
                </tr>`;
            }).join('') || '<tr><td colspan="4" class="text-center text-muted">Sin reuniones registradas</td></tr>';

            const modalHtml = `
            <div class="modal fade" id="ag-modal-comite" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header" style="background:#312e81;color:#fff">
                            <h5 class="modal-title"><i class="fas fa-users-cog me-2"></i>${agEsc(c.nombre)}</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-2">${agAreaBadge(c.area)}</div>
                            <p class="small">${agEsc(c.descripcion || '—')}</p>
                            <div class="row g-3 small">
                                <div class="col-md-6">
                                    <strong><i class="fas fa-sync-alt me-1"></i>Frecuencia:</strong> ${agEsc(c.frecuencia || '—')}<br>
                                    <strong><i class="fas fa-user-tie me-1"></i>Preside:</strong> ${agEsc(c.presidente || '—')}
                                </div>
                                <div class="col-md-6">
                                    <strong><i class="fas fa-users me-1"></i>Participantes:</strong>
                                    <ul class="mb-0 mt-1 ps-3">${participantes}</ul>
                                </div>
                            </div>
                            <h6 class="fw-bold mt-3"><i class="fas fa-calendar-alt me-1 text-primary"></i>Últimas Reuniones</h6>
                            <div class="table-responsive">
                                <table class="table table-sm table-hover small">
                                    <thead class="table-light"><tr><th>Sesión</th><th>Fecha</th><th>Estatus</th><th></th></tr></thead>
                                    <tbody>${reunionesHtml}</tbody>
                                </table>
                            </div>
                        </div>
                        <div class="modal-footer">
                            ${canEdit ? `<button class="btn btn-warning btn-sm" onclick="agOpenEditComite('${agEsc(c.id)}')"><i class="fas fa-pen me-1"></i>Editar</button>` : ''}
                            <button class="btn btn-primary btn-sm" onclick="bootstrap.Modal.getInstance(document.getElementById('ag-modal-comite'))?.hide();agOpenNuevaReunion()">
                                <i class="fas fa-plus me-1"></i>Nueva Reunión
                            </button>
                            <button class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
                        </div>
                    </div>
                </div>
            </div>`;

            const prev = document.getElementById('ag-modal-comite');
            if (prev) prev.remove();
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            new bootstrap.Modal(document.getElementById('ag-modal-comite')).show();
        } catch (err) {
            console.error('[Agenda] Error detalle comité:', err);
        }
    };

    // ── MODAL: EDITAR COMITÉ ──
    window.agOpenEditComite = async function (comiteId) {
        const { data: c, error } = await sb()
            .from('agenda_comites').select('*').eq('id', comiteId).single();
        if (error || !c) { alert('No se pudo cargar el comité.'); return; }
        if (!_editableAreas.includes(c.area)) { alert('No tienes permiso para editar este comité.'); return; }

        const areaOpts = Object.entries(AREA_LABELS).filter(([a]) => _editableAreas.includes(a))
            .map(([a, l]) => `<option value="${a}" ${a===c.area?'selected':''}>${l}</option>`).join('');
        const participantesStr = Array.isArray(c.participantes) ? c.participantes.join('\n') : (c.participantes || '');

        const modalHtml = `
        <div class="modal fade" id="ag-modal-edit-comite" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-warning">
                        <h5 class="modal-title"><i class="fas fa-pen me-2"></i>Editar Comité</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row g-3">
                            <div class="col-md-8">
                                <label class="form-label fw-semibold">Nombre <span class="text-danger">*</span></label>
                                <input class="form-control" id="ag-ec-nombre" value="${agEsc(c.nombre)}" required>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label fw-semibold">Área</label>
                                <select class="form-select" id="ag-ec-area">${areaOpts}</select>
                            </div>
                            <div class="col-12">
                                <label class="form-label fw-semibold">Descripción</label>
                                <textarea class="form-control" id="ag-ec-desc" rows="3">${agEsc(c.descripcion || '')}</textarea>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label fw-semibold">Frecuencia</label>
                                <input class="form-control" id="ag-ec-frecuencia" value="${agEsc(c.frecuencia || '')}">
                            </div>
                            <div class="col-md-8">
                                <label class="form-label fw-semibold">Presidente</label>
                                <input class="form-control" id="ag-ec-presidente" value="${agEsc(c.presidente || '')}">
                            </div>
                            <div class="col-12">
                                <label class="form-label fw-semibold">Participantes (uno por línea)</label>
                                <textarea class="form-control" id="ag-ec-participantes" rows="4">${agEsc(participantesStr)}</textarea>
                            </div>
                            <div class="col-auto">
                                <div class="form-check form-switch mt-2">
                                    <input class="form-check-input" type="checkbox" id="ag-ec-activo" ${c.activo ? 'checked' : ''}>
                                    <label class="form-check-label" for="ag-ec-activo">Comité activo</label>
                                </div>
                            </div>
                            <div class="col-12">
                                <div class="d-flex align-items-center gap-2 p-2 rounded-3"
                                     style="background:#fffbeb;border:1.5px solid #fde68a;cursor:pointer"
                                     onclick="document.getElementById('ag-ec-horario-fijo').click()">
                                    <input class="form-check-input flex-shrink-0 mt-0" type="checkbox" id="ag-ec-horario-fijo"
                                           onclick="event.stopPropagation()" ${c.horario_fijo ? 'checked' : ''}>
                                    <label class="mb-0" for="ag-ec-horario-fijo" style="cursor:pointer;user-select:none">
                                        <i class="fas fa-clock text-warning me-1"></i>
                                        <strong style="font-size:.85rem">Horario preestablecido</strong>
                                        <span class="text-muted d-block" style="font-size:.72rem">
                                            El comité siempre sesiona en las mismas fechas cada año.
                                            Se mostrará un ícono <i class="fas fa-clock text-warning"></i> en el calendario.
                                        </span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button class="btn btn-warning fw-semibold" id="ag-ec-save" onclick="agSaveEditComite('${agEsc(comiteId)}')">
                            <i class="fas fa-save me-1"></i>Guardar cambios
                        </button>
                    </div>
                </div>
            </div>
        </div>`;

        const prev = document.getElementById('ag-modal-edit-comite');
        if (prev) prev.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        new bootstrap.Modal(document.getElementById('ag-modal-edit-comite')).show();
    };

    window.agSaveEditComite = async function (comiteId) {
        const nombre       = document.getElementById('ag-ec-nombre')?.value?.trim();
        const area         = document.getElementById('ag-ec-area')?.value;
        const desc         = document.getElementById('ag-ec-desc')?.value?.trim() || null;
        const frecuencia   = document.getElementById('ag-ec-frecuencia')?.value?.trim() || null;
        const presidente   = document.getElementById('ag-ec-presidente')?.value?.trim() || null;
        const participantesRaw = document.getElementById('ag-ec-participantes')?.value || '';
        const participantes    = participantesRaw.split('\n').map(s=>s.trim()).filter(Boolean);
        const activo       = document.getElementById('ag-ec-activo')?.checked ?? true;

        if (!nombre) { alert('El nombre es obligatorio.'); return; }
        if (!_editableAreas.includes(area)) { alert('No tienes permiso para editar esta área.'); return; }

        const btn = document.getElementById('ag-ec-save');
        const prevHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Guardando…';

        try {
            // Leer estado anterior para diff en historial
            const { data: prev } = await sb().from('agenda_comites').select('*').eq('id', comiteId).maybeSingle();
            const horario_fijo = document.getElementById('ag-ec-horario-fijo')?.checked ?? false;
            const { error } = await sb().from('agenda_comites').update({
                nombre, area, descripcion: desc, frecuencia, presidente, participantes, activo, horario_fijo
            }).eq('id', comiteId);
            if (error) throw error;
            window.logHistory?.('EDITAR', 'agenda_comites', comiteId, {
                old: prev || {},
                new: { nombre, area, descripcion: desc, frecuencia, presidente, activo },
                summary: `Comité: ${nombre}`
            });
            bootstrap.Modal.getInstance(document.getElementById('ag-modal-edit-comite'))?.hide();
            agLoadComites();
        } catch (err) {
            alert('Error al guardar: ' + (err.message || err));
            btn.disabled = false;
            btn.innerHTML = prevHtml;
        }
    };

    // ── MODAL: EDITAR REUNIÓN (estatus) ──
    window.agOpenEditReunion = async function (reunionId) {
        const { data: r, error } = await sb()
            .from('agenda_reuniones').select('*').eq('id', reunionId).single();
        if (error || !r) { alert('No se pudo cargar la reunión.'); return; }
        if (!_editableAreas.includes(r.area)) { alert('No tienes permiso para editar esta reunión.'); return; }

        const estatusOpts = ['Programada','Celebrada','Cancelada','Pospuesta']
            .map(e => `<option ${e===r.estatus?'selected':''}>${e}</option>`).join('');

        const modalHtml = `
        <div class="modal fade" id="ag-modal-edit-reunion" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-warning">
                        <h5 class="modal-title"><i class="fas fa-pen me-2"></i>Editar Reunión</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row g-3">
                            <div class="col-12">
                                <label class="form-label fw-semibold">Estatus</label>
                                <select class="form-select" id="ag-er-estatus">${estatusOpts}</select>
                            </div>
                            <div class="col-12">
                                <label class="form-label fw-semibold">Observaciones</label>
                                <textarea class="form-control" id="ag-er-obs" rows="3">${agEsc(r.observaciones || '')}</textarea>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button class="btn btn-warning fw-semibold" id="ag-er-save" onclick="agSaveEditReunion('${agEsc(reunionId)}')">
                            <i class="fas fa-save me-1"></i>Guardar
                        </button>
                    </div>
                </div>
            </div>
        </div>`;

        const prev = document.getElementById('ag-modal-edit-reunion');
        if (prev) prev.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        new bootstrap.Modal(document.getElementById('ag-modal-edit-reunion')).show();
    };

    window.agSaveEditReunion = async function (reunionId) {
        const estatus = document.getElementById('ag-er-estatus')?.value;
        const obs     = document.getElementById('ag-er-obs')?.value?.trim() || null;

        const btn = document.getElementById('ag-er-save');
        const prevHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Guardando…';

        try {
            const { data: prev } = await sb().from('agenda_reuniones').select('*').eq('id', reunionId).maybeSingle();
            const { error } = await sb().from('agenda_reuniones').update({ estatus, observaciones: obs }).eq('id', reunionId);
            if (error) throw error;
            window.logHistory?.('EDITAR', 'agenda_reuniones', reunionId, {
                old: prev || {},
                new: { estatus, observaciones: obs },
                summary: `Reunión ${prev?.numero_sesion || reunionId} — estatus: ${prev?.estatus} → ${estatus}`
            });
            bootstrap.Modal.getInstance(document.getElementById('ag-modal-edit-reunion'))?.hide();
            agLoadReuniones();
        } catch (err) {
            alert('Error al guardar: ' + (err.message || err));
            btn.disabled = false;
            btn.innerHTML = prevHtml;
        }
    };

    // ── MODAL: EDITAR ACUERDO (estatus) ──
    window.agOpenEditAcuerdo = async function (acuerdoId) {
        const { data: a, error } = await sb()
            .from('agenda_acuerdos').select('*').eq('id', acuerdoId).single();
        if (error || !a) { alert('No se pudo cargar el acuerdo.'); return; }
        if (!_editableAreas.includes(a.area)) { alert('No tienes permiso para editar este acuerdo.'); return; }

        const estatusOpts = ['Pendiente','En proceso','Cumplido','Cancelado']
            .map(e => `<option ${e===a.estatus?'selected':''}>${e}</option>`).join('');

        const modalHtml = `
        <div class="modal fade" id="ag-modal-edit-acuerdo" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-success text-white">
                        <h5 class="modal-title"><i class="fas fa-handshake me-2"></i>Actualizar Acuerdo</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p class="fw-semibold small mb-3">${agEsc(a.descripcion)}</p>
                        <div class="row g-3">
                            <div class="col-12">
                                <label class="form-label fw-semibold">Estatus</label>
                                <select class="form-select" id="ag-ea-estatus">${estatusOpts}</select>
                            </div>
                            <div class="col-12">
                                <label class="form-label fw-semibold">URL Evidencia (opcional)</label>
                                <input class="form-control" id="ag-ea-evidencia" value="${agEsc(a.evidencia_url || '')}" placeholder="https://…">
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button class="btn btn-success fw-semibold" id="ag-ea-save" onclick="agSaveEditAcuerdo('${agEsc(acuerdoId)}')">
                            <i class="fas fa-save me-1"></i>Guardar
                        </button>
                    </div>
                </div>
            </div>
        </div>`;

        const prev = document.getElementById('ag-modal-edit-acuerdo');
        if (prev) prev.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        new bootstrap.Modal(document.getElementById('ag-modal-edit-acuerdo')).show();
    };

    window.agSaveEditAcuerdo = async function (acuerdoId) {
        const estatus      = document.getElementById('ag-ea-estatus')?.value;
        const evidencia    = document.getElementById('ag-ea-evidencia')?.value?.trim() || null;
        const btn = document.getElementById('ag-ea-save');
        const prevHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Guardando…';

        try {
            const { data: prev } = await sb().from('agenda_acuerdos').select('*').eq('id', acuerdoId).maybeSingle();
            const { error } = await sb().from('agenda_acuerdos')
                .update({ estatus, evidencia_url: evidencia }).eq('id', acuerdoId);
            if (error) throw error;
            window.logHistory?.('EDITAR', 'agenda_acuerdos', acuerdoId, {
                old: prev || {},
                new: { estatus, evidencia_url: evidencia },
                summary: `Acuerdo: ${(prev?.descripcion || '').slice(0, 80)} — ${prev?.estatus} → ${estatus}`
            });
            bootstrap.Modal.getInstance(document.getElementById('ag-modal-edit-acuerdo'))?.hide();
            agLoadAcuerdos();
        } catch (err) {
            alert('Error al guardar: ' + (err.message || err));
            btn.disabled = false;
            btn.innerHTML = prevHtml;
        }
    };

    // ── MODAL: NUEVO COMITÉ ──
    window.agOpenNuevoComite = function () {
        if (!_editableAreas.length) { alert('No tienes permiso para crear comités.'); return; }
        const areaOpts = Object.entries(AREA_LABELS)
            .filter(([a]) => _editableAreas.includes(a))
            .map(([a, l]) => `<option value="${a}">${l}</option>`).join('');

        const modalHtml = `
        <div class="modal fade" id="ag-modal-nuevo-comite" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title"><i class="fas fa-plus-circle me-2"></i>Nuevo Comité</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row g-3">
                            <div class="col-md-8">
                                <label class="form-label fw-semibold">Nombre <span class="text-danger">*</span></label>
                                <input class="form-control" id="ag-nc-nombre" required placeholder="Nombre del comité…">
                            </div>
                            <div class="col-md-4">
                                <label class="form-label fw-semibold">Área <span class="text-danger">*</span></label>
                                <select class="form-select" id="ag-nc-area">${areaOpts}</select>
                            </div>
                            <div class="col-12">
                                <label class="form-label fw-semibold">Descripción</label>
                                <textarea class="form-control" id="ag-nc-desc" rows="3" placeholder="Propósito y alcance del comité…"></textarea>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label fw-semibold">Frecuencia</label>
                                <input class="form-control" id="ag-nc-frecuencia" placeholder="Ej: Mensual">
                            </div>
                            <div class="col-md-8">
                                <label class="form-label fw-semibold">Presidente</label>
                                <input class="form-control" id="ag-nc-presidente" placeholder="Cargo o nombre">
                            </div>
                            <div class="col-12">
                                <label class="form-label fw-semibold">Participantes (uno por línea)</label>
                                <textarea class="form-control" id="ag-nc-participantes" rows="4" placeholder="Área 1\nÁrea 2\n…"></textarea>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button class="btn btn-primary fw-semibold" id="ag-nc-save" onclick="agSaveNuevoComite()">
                            <i class="fas fa-save me-1"></i>Guardar
                        </button>
                    </div>
                </div>
            </div>
        </div>`;

        const prev = document.getElementById('ag-modal-nuevo-comite');
        if (prev) prev.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        new bootstrap.Modal(document.getElementById('ag-modal-nuevo-comite')).show();
    };

    window.agSaveNuevoComite = async function () {
        const nombre = document.getElementById('ag-nc-nombre')?.value?.trim();
        const area   = document.getElementById('ag-nc-area')?.value;
        if (!nombre || !area) { alert('Nombre y Área son obligatorios.'); return; }
        if (!_editableAreas.includes(area)) { alert('No tienes permiso para crear comités en esta área.'); return; }

        const participantesRaw = document.getElementById('ag-nc-participantes')?.value || '';
        const participantes    = participantesRaw.split('\n').map(s=>s.trim()).filter(Boolean);

        const payload = {
            nombre, area,
            descripcion:  document.getElementById('ag-nc-desc')?.value?.trim() || null,
            frecuencia:   document.getElementById('ag-nc-frecuencia')?.value?.trim() || null,
            presidente:   document.getElementById('ag-nc-presidente')?.value?.trim() || null,
            participantes: participantes.length ? participantes : null,
            activo: true,
        };

        const btn = document.getElementById('ag-nc-save');
        const prevHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Guardando…';

        try {
            const { data: inserted, error } = await sb().from('agenda_comites').insert([payload]).select('id').single();
            if (error) throw error;
            window.logHistory?.('CREAR', 'agenda_comites', inserted?.id || null, {
                nombre: payload.nombre,
                area: payload.area,
                frecuencia: payload.frecuencia
            });
            bootstrap.Modal.getInstance(document.getElementById('ag-modal-nuevo-comite'))?.hide();
            agLoadComites();
        } catch (err) {
            alert('Error al guardar: ' + (err.message || err));
            btn.disabled = false;
            btn.innerHTML = prevHtml;
        }
    };

    // agLoadCalendario delegated to js/agenda.js

})(); // end Agenda module
