/* ============================================================
 *  SSC · Aviación General · Terminal de Aviación General y FBO
 *
 *  Vista institucional: video de recorrido, plano, contadores y
 *  clips de la terminal. No consulta datos: todo lo que muestra
 *  es contenido fijo del documento de la Gerencia de Aviación
 *  General (GAG).
 *
 *  Antes esto era un <script> dentro de index.html que corría al
 *  cargar la página, aunque nadie abriera la sección: registraba
 *  dos IntersectionObserver y ponía a reproducir videos. Ahora se
 *  enciende en initAviacionGeneralFbo() y se apaga en destroy.
 * ========================================================== */
(function () {
    'use strict';

    var _cableado = false;    // los listeners se ponen una sola vez
    var _io = null;           // reproduce/pausa los videos según entren en pantalla
    var _co = null;           // dispara la animación de los contadores
    var _inicioPendiente = 0; // segundo en el que debe arrancar el modal

    function seccion() { return document.getElementById('aviacion-general-fbo-section'); }

    function videos(sec) {
        return sec.querySelectorAll('.agf-hero-video, .agf-showcase-video, .agf-clip video');
    }

    // ─── Modal del video completo ──────────────────────────────
    function cablearModal(sec) {
        var modal = document.getElementById('agfVideoModal');
        var full  = document.getElementById('agfFullVideo');
        if (!modal || !full) return;

        modal.addEventListener('shown.bs.modal', function () {
            var startAt = _inicioPendiente > 0 ? _inicioPendiente : 0;
            var kick = function () { try { full.play(); } catch (_) {} };
            try {
                if (Math.abs(full.currentTime - startAt) > 0.3) {
                    full.addEventListener('seeked', kick, { once: true });
                    full.currentTime = startAt;
                } else {
                    kick();
                }
            } catch (_) { kick(); }
        });
        modal.addEventListener('hidden.bs.modal', function () {
            try { full.pause(); full.currentTime = 0; } catch (_) {}
            _inicioPendiente = 0;
        });

        // Al pulsar un clip con inicio definido, el modal arranca en ese punto
        sec.querySelectorAll('[data-modal-start]').forEach(function (clip) {
            clip.addEventListener('click', function () {
                _inicioPendiente = parseFloat(clip.getAttribute('data-modal-start')) || 0;
            });
        });
    }

    // ─── Clips que muestran sólo un tramo del video ────────────
    function cablearSegmentos(sec) {
        sec.querySelectorAll('.agf-clip-seg').forEach(function (v) {
            var start = parseFloat(v.getAttribute('data-start')) || 0;
            var end   = parseFloat(v.getAttribute('data-end'))   || 0;
            var looping = false;
            v.addEventListener('loadedmetadata', function () { try { v.currentTime = start; } catch (_) {} });
            v.addEventListener('timeupdate', function () {
                if (looping) return;
                if (end && v.currentTime >= end - 0.05) {
                    looping = true;
                    try {
                        v.currentTime = start;
                        v.addEventListener('seeked', function () { looping = false; try { v.play(); } catch (_) {} }, { once: true });
                    } catch (_) { looping = false; }
                }
            });
        });
    }

    // ─── Contadores animados ───────────────────────────────────
    function animarConteo(el) {
        var to  = parseFloat(el.getAttribute('data-to')) || 0;
        var dec = parseInt(el.getAttribute('data-dec') || '0', 10);
        var unit = el.querySelector('small');
        var unitHtml = unit ? ' <small>' + unit.textContent + '</small>' : '';
        var start = null, dur = 1200;
        function fmt(n) { return n.toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
        function step(ts) {
            if (!start) start = ts;
            var p = Math.min((ts - start) / dur, 1);
            var eased = 1 - Math.pow(1 - p, 3);
            el.innerHTML = fmt(to * eased) + unitHtml;
            if (p < 1) requestAnimationFrame(step);
            else el.innerHTML = fmt(to) + unitHtml;
        }
        requestAnimationFrame(step);
    }

    // ─── Observadores ──────────────────────────────────────────
    // Se crean al abrir y se desconectan al salir: son el recurso que de
    // verdad quedaba vivo cuando la sección ya no estaba en pantalla.
    function observar(sec) {
        if (!('IntersectionObserver' in window)) return;

        _io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                var v = e.target;
                if (e.isIntersecting) {
                    if (v.classList.contains('agf-clip-seg')) {
                        var s = parseFloat(v.getAttribute('data-start')) || 0;
                        if (v.currentTime < s || (v.dataset.end && v.currentTime >= parseFloat(v.dataset.end))) {
                            try { v.currentTime = s; } catch (_) {}
                        }
                    }
                    try { v.play(); } catch (_) {}
                }
                else { try { v.pause(); } catch (_) {} }
            });
        }, { threshold: 0.25 });
        videos(sec).forEach(function (v) { _io.observe(v); });

        _co = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting && !e.target.dataset.done) {
                    e.target.dataset.done = '1';
                    animarConteo(e.target);
                }
            });
        }, { threshold: 0.6 });
        sec.querySelectorAll('.agf-count').forEach(function (el) { _co.observe(el); });
    }

    function desobservar() {
        try { if (_io) _io.disconnect(); } catch (_) {}
        try { if (_co) _co.disconnect(); } catch (_) {}
        _io = null;
        _co = null;
    }

    window.initAviacionGeneralFbo = function () {
        var sec = seccion();
        if (!sec) return;
        if (!_cableado) {
            cablearModal(sec);
            cablearSegmentos(sec);
            _cableado = true;
        }
        desobservar();   // por si se abriera dos veces sin pasar por destroy
        observar(sec);
    };

    // Contrato de ciclo de vida del módulo.
    //
    // Aquí no hay gráficas que soltar; lo que quedaba trabajando eran los dos
    // IntersectionObserver y los videos. Al salir se desconectan los
    // observadores y se pausa todo: sin esto, la sección oculta seguía
    // decodificando video y tirando de red.
    //
    // Los listeners del modal y de los clips NO se retiran: se ponen una sola
    // vez sobre nodos que viven dentro de la vista, y la vista se queda
    // cacheada en el DOM. Retirarlos obligaría a volver a cablearlos sin ganar
    // nada, y _cableado impide que se dupliquen.
    window.destroyAviacionGeneralFbo = function () {
        desobservar();
        var sec = seccion();
        if (!sec) return;
        try {
            videos(sec).forEach(function (v) { try { v.pause(); } catch (_) {} });
        } catch (_) {}
        var full = document.getElementById('agfFullVideo');
        if (full) { try { full.pause(); } catch (_) {} }
    };
})();
