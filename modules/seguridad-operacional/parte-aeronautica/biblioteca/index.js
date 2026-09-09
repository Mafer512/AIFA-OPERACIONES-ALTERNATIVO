/* ============================================================
 *  SSO · Ops. Parte Aeronautica · Biblioteca
 *
 *  Vista de documentos con pestanas. Todo su codigo era este <script>
 *  dentro de index.html, que corria en cada carga de la pagina para
 *  cablear el desplazamiento de las pestanas.
 * ========================================================== */
(function () {
    function _initBibTabs() {
        var tabsEl = document.getElementById('biblioteca-tabs');
        if (!tabsEl || tabsEl._bibScrollWired) return;
        tabsEl._bibScrollWired = true;
        tabsEl.addEventListener('shown.bs.tab', function() {
            var content = document.getElementById('biblioteca-tabs-content');
            if (content) content.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
    }
    // El loader inyecta este archivo despues de DOMContentLoaded: ese evento
    // ya no llega. El cableado pasa por init(), y _bibScrollWired impide que
    // se repita al volver a entrar.
    window.initBiblioteca = function () {
        _initBibTabs();
    };

    // No hay nada que soltar: la vista no abre graficas, ni temporizadores,
    // ni conexiones. El unico listener vive dentro de la vista cacheada.
    window.destroyBiblioteca = function () {};
})();
