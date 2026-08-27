/**
 * Núcleo compartido: sesión y permisos.
 *
 * Un solo sitio donde se pregunta "¿quién es?" y "¿qué puede hacer aquí?". Los
 * módulos NO vuelven a implementar autenticación ni a leer sessionStorage o
 * window.dataManager por su cuenta: preguntan aquí.
 *
 * IMPORTANTE — esto NO es una barrera de seguridad.
 *
 * Todo lo que vive en el navegador es sugerible por quien controla el
 * navegador. La protección real de los datos son las políticas RLS de Supabase
 * (user_can_access_section(), ggen_can_write(), ...), que se aplican del lado
 * del servidor y no dependen de nada de este archivo. Lo de aquí sirve para no
 * pedir datos que van a ser rechazados, no mostrar botones que no funcionarían
 * y no abrir un módulo al que no se tiene acceso.
 *
 * Dicho de otro modo: si alguien saltara estas comprobaciones, la base seguiría
 * negándole la información. Por eso nunca se debe relajar la RLS apoyándose en
 * las comprobaciones de este archivo.
 */
(function () {
    'use strict';

    function rol() {
        try { return String(sessionStorage.getItem('user_role') || '').trim(); }
        catch (_) { return ''; }
    }

    function haySesion() {
        try { return !!sessionStorage.getItem('user_role'); }
        catch (_) { return false; }
    }

    // Override explícito por módulo, administrado desde Gestión de Datos.
    // 'none' | 'read' | 'capture' | 'edit' | 'admin'
    function nivelDeSeccion(clave) {
        try {
            const niveles = (window.dataManager && window.dataManager.sectionLevels) || {};
            return niveles[clave] || '';
        } catch (_) { return ''; }
    }

    function esAdmin() {
        const r = rol();
        return r === 'admin' || r === 'superadmin';
    }

    // ¿Puede siquiera ABRIR la sección? Un 'none' explícito cierra la puerta
    // incluso a quien por rol entraría; un admin pasa igual, porque el override
    // describe módulos, no revoca la administración del sistema.
    function puedeVer(clave) {
        if (!haySesion()) return false;
        if (esAdmin()) return true;
        return nivelDeSeccion(clave) !== 'none';
    }

    // ¿Puede escribir en la sección? Misma regla que ya aplicaban los módulos
    // de Gestión Energética, movida aquí para que exista en un solo sitio.
    function puedeEditar(clave) {
        if (!haySesion()) return false;
        if (esAdmin()) return true;
        const nivel = nivelDeSeccion(clave);
        if (nivel === 'read' || nivel === 'none') return false;
        if (nivel === 'capture' || nivel === 'edit' || nivel === 'admin') return true;
        return rol() === 'editor';
    }

    // Permiso de captura de una seccion concreta.
    //
    // El monolito ya tenia window.canCaptureSection()/canCapture() y varios
    // modulos los consultaban directamente. Se exponen desde aqui para que los
    // modulos extraidos dependan del nucleo y no de una global del monolito:
    // asi un modulo suelto sigue funcionando y hay un unico sitio que cambiar
    // el dia que esa logica se mueva del todo.
    function puedeCapturar(clave) {
        try {
            if (typeof window.canCaptureSection === 'function') return !!window.canCaptureSection(clave);
            if (typeof window.canCapture === 'function') return !!window.canCapture();
        } catch (_) {}
        return puedeEditar(clave);
    }

    window.appPermisos = { rol, haySesion, esAdmin, nivelDeSeccion, puedeVer, puedeEditar, puedeCapturar };
})();
