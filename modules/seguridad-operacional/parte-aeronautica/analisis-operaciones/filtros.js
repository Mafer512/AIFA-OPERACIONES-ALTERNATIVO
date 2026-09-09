/* ============================================================
 *  Analisis de Operaciones · cableado de los botones de filtro.
 *
 *  Estaba incrustado en index.html y corria en cada carga. Lo llama
 *  initAnalisisOperaciones() a traves del registro del loader.
 * ========================================================== */
(function() {
    function setupToggleGroup(groupId, selectId, activeClass, outlineClass) {
        const group = document.getElementById(groupId);
        const sel   = document.getElementById(selectId);
        if (!group || !sel) return;
        group.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', function() {
                group.querySelectorAll('button').forEach(b => {
                    b.className = b.className.replace(activeClass, outlineClass);
                });
                this.className = this.className.replace(outlineClass, activeClass);
                sel.value = this.dataset.val;
                updateActiveFilterCount();
            });
        });
    }
    function updateActiveFilterCount() {
        const ids = ['mdb-filter-year','mdb-filter-month','mdb-filter-direction','mdb-filter-optype','mdb-filter-airline'];
        let count = 0;
        ids.forEach(id => { const el = document.getElementById(id); if (el && el.value) count++; });
        const badge = document.getElementById('mdb-active-filter-count');
        if (!badge) return;
        if (count > 0) { badge.textContent = count; badge.classList.remove('d-none'); }
        else { badge.classList.add('d-none'); }
    }
    function syncToggleGroup(groupId, selectId, activeClass, outlineClass) {
        const group = document.getElementById(groupId);
        const sel   = document.getElementById(selectId);
        if (!group || !sel) return;
        group.querySelectorAll('button').forEach(b => {
            const isActive = b.dataset.val === sel.value;
            if (isActive) { b.className = b.className.replace(outlineClass, activeClass); }
            else          { b.className = b.className.replace(activeClass, outlineClass); }
        });
    }
    // Antes esto colgaba de DOMContentLoaded; ahora lo enciende el modulo.
    var _cableado = false;
    window.initAnalisisOperacionesFiltros = function () {
        if (_cableado) return;
        _cableado = true;
        setupToggleGroup('mdb-dir-btngroup',    'mdb-filter-direction', 'btn-primary',   'btn-outline-primary');
        setupToggleGroup('mdb-optype-btngroup', 'mdb-filter-optype',    'btn-success',   'btn-outline-success');

        // Sincronizar badge al cambiar selects de año/mes/aerolínea
        ['mdb-filter-year','mdb-filter-month','mdb-filter-airline'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', updateActiveFilterCount);
        });

        // Sincronizar al limpiar filtros (después de que el JS principal limpie los selects)
        const clearBtn = document.getElementById('mdb-btn-clear-filters');
        if (clearBtn) {
            clearBtn.addEventListener('click', function() {
                setTimeout(function() {
                    syncToggleGroup('mdb-dir-btngroup',    'mdb-filter-direction', 'btn-primary',  'btn-outline-primary');
                    syncToggleGroup('mdb-optype-btngroup', 'mdb-filter-optype',   'btn-success',  'btn-outline-success');
                    updateActiveFilterCount();
                }, 50);
            }, true);
        }
    };
})();
