/**
 * Núcleo compartido: carga perezosa de módulos y su ciclo de vida.
 *
 * Antes, cada módulo de Gestión Energética llegaba en dos piezas que el
 * navegador pagaba SIEMPRE: su HTML dentro de index.html y su <script> en el
 * pie. Se descargaban, analizaban y ejecutaban aunque nadie abriera la
 * categoría en todo el día.
 *
 * Aquí la vista y el código se traen la primera vez que se abre el módulo, y a
 * partir de ahí quedan en memoria. Al salir se llama a destroy(), que libera lo
 * que el módulo abrió.
 *
 * Aislamiento: un fallo dentro de un módulo se queda dentro. Si la vista no
 * baja, si el script revienta al evaluarse o si init() lanza, se pinta un aviso
 * con botón de reintento DENTRO del contenedor del módulo. El menú, la sesión y
 * las demás categorías siguen funcionando.
 */
(function () {
    'use strict';

    // Cada entrada describe un módulo: dónde vive y cómo se enciende y se apaga.
    // Las claves son las mismas data-section de siempre, así que las URL, los
    // hashes y los favoritos existentes siguen valiendo.
    const REGISTRO = {
        'ggen-energia': {
            base: 'modules/gestion-energetica/generacion/energia-generacion',
            init: 'initGgenEnergia',
            destroy: 'destroyGgenEnergia',
            nombre: 'Energía y Generación',
        },
        'gtrans-energia': {
            base: 'modules/gestion-energetica/transformacion/mantenimientos-bt',
            init: 'initGtransEnergia',
            destroy: 'destroyGtransEnergia',
            nombre: 'Mantenimientos B.T.',
        },
        'gtrans-preventivos': {
            base: 'modules/gestion-energetica/transformacion/preventivos-programados',
            init: 'initGtransPreventivos',
            destroy: 'destroyGtransPreventivos',
            nombre: 'Preventivos Programados',
        },

        // Ingenieria. Hidraulicas trae DOS archivos: la pestana de
        // Aprovechamiento del Agua y la de Residuos comparten una sola seccion
        // con pestanas, tal como estan en el menu.
        'hidraulicas': {
            base: 'modules/ingenieria/hidraulicas',
            extras: ['residuos.js'],
            init: 'initHidraulicas',
            destroy: 'destroyHidraulicas',
            destroyExtras: ['destroyResiduosHidraulicas'],
            nombre: 'Op. y Mtto. Instl. Hidraulicas',
        },
        'hvac-reportes': {
            base: 'modules/ingenieria/electromecanica/reportes-hvac',
            init: 'initHvac',
            destroy: 'destroyHvac',
            nombre: 'Reportes HVAC',
        },
        'ingenieria-civil': {
            base: 'modules/ingenieria/civil/etp-vidrios-filtraciones',
            init: 'initIngenieriaCivil',
            destroy: 'destroyIngenieriaCivil',
            nombre: 'ETP - Vidrios y Filtraciones',
        },

        // Servicios Conexos.
        //
        // Combustibles es el unico de los tres que consulta datos; los otros
        // dos son vistas institucionales de contenido fijo. Aun asi pesaban en
        // cada arranque: FBO traia 280 lineas de <style> y un <script> con dos
        // IntersectionObserver, y Combustibles pedia su propia hoja de estilos.
        'aviacion-general-fbo': {
            base: 'modules/servicios-conexos/aviacion-general/terminal-fbo',
            init: 'initAviacionGeneralFbo',
            destroy: 'destroyAviacionGeneralFbo',
            nombre: 'Terminal de Aviacion General - FBO',
        },
        'capacidad-carga': {
            base: 'modules/servicios-conexos/carga/terminal-capacidad',
            init: 'initCapacidadCarga',
            destroy: 'destroyCapacidadCarga',
            nombre: 'Terminal de Carga - Capacidad',
        },
        'combustibles': {
            base: 'modules/servicios-conexos/combustibles/combustible-aviacion',
            init: 'initCombustibles',
            destroy: 'destroyCombustibles',
            nombre: 'Combustible de Aviacion',
        },

        // Seguridad Operacional · GSO.
        //
        // Los seis comparten forma: su propio archivo, un wireUi() guardado por
        // _initOnce y un destroyCharts() que ya existia para reconstruir las
        // graficas. Fauna es la excepcion: son DOS tableros en un archivo y
        // arrancaba en DOMContentLoaded, evento que ya no llega cuando el loader
        // inyecta el script; su initFauna() lo sustituye.
        'fauna': {
            base: 'modules/seguridad-operacional/sgd-operacional/fauna',
            init: 'initFauna',
            destroy: 'destroyFauna',
            nombre: 'Fauna',
        },
        'ssei-emergencias': {
            base: 'modules/seguridad-operacional/sgd-operacional/ssei-emergencias',
            init: 'initSseiEmergencias',
            destroy: 'destroySseiEmergencias',
            nombre: 'SSEI - Emergencias en Pista',
        },
        'ssei-derrames': {
            base: 'modules/seguridad-operacional/sgd-operacional/ssei-derrames',
            init: 'initSseiDerrames',
            destroy: 'destroySseiDerrames',
            nombre: 'SSEI - Atencion a Derrames',
        },
        'personal-capacitado-prestadores': {
            base: 'modules/seguridad-operacional/sgd-operacional/personal-capacitado',
            init: 'initPersonalCapacitadoPrestadores',
            destroy: 'destroyPersonalCapacitadoPrestadores',
            nombre: 'Personal Capacitado Prestadores',
        },
        'valoraciones-medicas': {
            base: 'modules/seguridad-operacional/sgd-operacional/valoraciones-medicas',
            init: 'initValoracionesMedicas',
            destroy: 'destroyValoracionesMedicas',
            nombre: 'Valoraciones Medicas del Personal',
        },
        'catalogo-vehiculos': {
            base: 'modules/seguridad-operacional/sgd-operacional/catalogo-vehiculos',
            init: 'initCatalogoVehiculos',
            destroy: 'destroyCatalogoVehiculos',
            nombre: 'Catalogo de Vehiculos',
        },

        // Seguridad Operacional · GOPA, GOET y GSM.
        //
        // Estos siete no venian de un archivo suelto: se encendian solos al
        // cargar la pagina y adivinaban por su cuenta cuando se abria su
        // seccion -- con DOMContentLoaded, con un clic sobre document, con un
        // MutationObserver, o envolviendo window.showSection. BHS - Manejo de
        // Maletas era ademas un <script> de 1193 lineas dentro de index.html.
        'analisis-operaciones': {
            base: 'modules/seguridad-operacional/parte-aeronautica/analisis-operaciones',
            extras: ['filtros.js'],
            init: 'initAnalisisOperaciones',
            destroy: 'destroyAnalisisOperaciones',
            nombre: 'Analisis de Operaciones',
        },
        'portal-digitalizacion': {
            base: 'modules/seguridad-operacional/parte-aeronautica/portal-digital',
            init: 'initPortalDigital',
            destroy: 'destroyPortalDigital',
            nombre: 'Portal Digital',
        },
        'abordadores-mecanicos': {
            base: 'modules/seguridad-operacional/parte-aeronautica/abordadores-mecanicos',
            init: 'initAbordadoresMecanicos',
            destroy: 'destroyAbordadoresMecanicos',
            nombre: 'Abordadores Mecanicos',
        },
        'biblioteca': {
            base: 'modules/seguridad-operacional/parte-aeronautica/biblioteca',
            init: 'initBiblioteca',
            destroy: 'destroyBiblioteca',
            nombre: 'Biblioteca',
        },
        'bhs': {
            base: 'modules/seguridad-operacional/ed-terminal/bhs-maletas',
            init: 'initBhsMaletas',
            destroy: 'destroyBhsMaletas',
            nombre: 'BHS - Manejo de Maletas',
        },
        'bhs-estadisticas-equipaje': {
            base: 'modules/seguridad-operacional/ed-terminal/bhs-estadisticas',
            init: 'initBhsBaggageStats',
            destroy: 'destroyBhsBaggageStats',
            nombre: 'Estadisticas de Equipaje del BHS',
        },
        'medicas': {
            base: 'modules/seguridad-operacional/servicios-medicos/servicio-medico',
            init: 'initMedicas',
            destroy: 'destroyMedicas',
            nombre: 'Servicio Medico',
        },

        // Direccion de Operacion.
        //
        // Colaboradores era la seccion mas grande de la aplicacion: 964 K y
        // 13782 lineas dentro de index.html, con un <style> de casi 2900
        // lineas, cuatro <script src> metidos DENTRO de la seccion y un
        // <script> incrustado de 8566. Ademas envolvia window.showSection y
        // hacia una precarga a los 1500 ms que se traia la plantilla entera
        // aunque nadie fuera a abrirla.
        //
        // Agenda es el primer caso en el que se saca codigo de DENTRO de
        // script.js y no un archivo entero: su gestion de permisos era un
        // IIFE cerrado al final del monolito, y esta ahora en permisos.js.
        'colaboradores': {
            base: 'modules/operacion/coord-auditoria/colaboradores',
            extras: ['directory-policy.js', 'foto-upload.js', 'documento-upload.js', 'visor-imagenes.js'],
            init: 'initColaboradores',
            destroy: 'destroyColaboradores',
            nombre: 'Colaboradores',
        },
        'coord-auditoria': {
            base: 'modules/operacion/coord-auditoria/vehiculos',
            init: 'initVehiculos',
            destroy: 'destroyVehiculos',
            nombre: 'Vehiculos',
        },
        'muebles-bienes': {
            base: 'modules/operacion/coord-auditoria/muebles-bienes',
            init: 'initMueblesBienes',
            destroy: 'destroyMueblesBienes',
            nombre: 'Muebles y Bienes',
        },
        'agenda': {
            base: 'modules/operacion/gpyc/agenda-comites',
            extras: ['permisos.js', 'asistente.js'],
            init: 'initAgendaComites',
            destroy: 'destroyAgendaComites',
            nombre: 'Agenda de Comites',
        },
    };

    const VERSION = 'v=1';           // cache-busting, igual que el resto del proyecto
    const cargados = new Map();      // clave -> Promise de "vista + script listos"
    let activo = '';                 // módulo abierto ahora mismo

    const contenedor = (clave) => document.getElementById(clave + '-section');

    function registrado(clave) {
        return Object.prototype.hasOwnProperty.call(REGISTRO, clave);
    }

    // Errores útiles sin filtrar nada: se registra el módulo y el mensaje, nunca
    // tokens, cabeceras ni datos del usuario.
    function registrarFallo(clave, fase, error) {
        console.error('[modulo:' + clave + '] ' + fase + ':', (error && error.message) ? error.message : error);
    }

    function pintarAviso(clave, titulo, detalle, conReintento) {
        const cont = contenedor(clave);
        if (!cont) return;
        cont.innerHTML = '';
        const caja = document.createElement('div');
        caja.className = 'alert alert-warning m-4';
        const t = document.createElement('h6');
        t.className = 'fw-semibold mb-1';
        t.textContent = titulo;
        const p = document.createElement('p');
        p.className = 'mb-0 small';
        p.textContent = detalle;                       // textContent: nada se interpreta como HTML
        caja.append(t, p);
        if (conReintento) {
            p.className = 'mb-3 small';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-sm btn-outline-secondary';
            btn.textContent = 'Reintentar';
            btn.addEventListener('click', function () {
                cargados.delete(clave);                // que vuelva a intentar la descarga
                cont.innerHTML = '';
                abrir(clave);
            });
            caja.appendChild(btn);
        }
        cont.appendChild(caja);
    }

    function cargarVista(clave, base) {
        return fetch(base + '/view.html?' + VERSION, { credentials: 'same-origin' })
            .then(function (r) {
                if (!r.ok) throw new Error('La vista respondió ' + r.status);
                return r.text();
            })
            .then(function (html) {
                const cont = contenedor(clave);
                if (!cont) throw new Error('No existe el contenedor de la sección');
                cont.innerHTML = html;
            });
    }

    function cargarScript(ruta) {
        return new Promise(function (resolve, reject) {
            const src = ruta + '?' + VERSION;
            if (document.querySelector('script[data-modulo-src="' + src + '"]')) return resolve();
            const s = document.createElement('script');
            s.src = src;
            s.async = false;
            s.dataset.moduloSrc = src;
            s.onload = function () { resolve(); };
            s.onerror = function () { reject(new Error('No se pudo cargar el código del módulo')); };
            document.body.appendChild(s);
        });
    }

    function preparar(clave) {
        if (cargados.has(clave)) return cargados.get(clave);
        const base = REGISTRO[clave].base;
        // La vista primero: el script espera encontrar sus nodos en el DOM.
        const extras = REGISTRO[clave].extras || [];
        // La vista primero y el codigo despues, en orden: el archivo principal
        // antes que sus extras, porque el extra puede apoyarse en el.
        const p = cargarVista(clave, base)
            .then(function () { return cargarScript(base + '/index.js'); })
            .then(function () {
                return extras.reduce(function (cadena, archivo) {
                    return cadena.then(function () { return cargarScript(base + '/' + archivo); });
                }, Promise.resolve());
            });
        cargados.set(clave, p);
        p.catch(function () { cargados.delete(clave); });   // un fallo no se queda cacheado
        return p;
    }

    /**
     * Abre un módulo. Devuelve true si esta clave le pertenece al loader
     * (aunque la carga acabe fallando), y false si no está registrada — así el
     * router sabe que debe seguir con su camino de siempre.
     */
    function abrir(clave) {
        if (!registrado(clave)) return false;

        // El permiso se comprueba ANTES de traer nada: sin acceso no se descarga
        // la vista, no se evalúa el código y no se consulta un solo dato.
        const permisos = window.appPermisos;
        if (permisos && !permisos.puedeVer(clave)) {
            pintarAviso(
                clave,
                'Acceso no autorizado',
                'Tu usuario no tiene permiso para ver este módulo. Si crees que es un error, pídelo a un administrador.',
                false
            );
            return true;
        }

        if (activo && activo !== clave) cerrar(activo);
        activo = clave;

        preparar(clave)
            .then(function () {
                const fn = window[REGISTRO[clave].init];
                if (typeof fn !== 'function') throw new Error('El módulo no expone su init()');
                return fn();
            })
            .catch(function (error) {
                registrarFallo(clave, 'apertura', error);
                pintarAviso(
                    clave,
                    'No se pudo abrir ' + REGISTRO[clave].nombre,
                    (error && error.message) || 'Error desconocido al cargar el módulo.',
                    true
                );
            });
        return true;
    }

    /** Cierra un módulo y libera lo que abrió. Nunca deja escapar un error. */
    function cerrar(clave) {
        if (!registrado(clave)) return false;
        // El principal y sus extras: cada uno suelta lo suyo. Un fallo en uno no
        // impide apagar los demas.
        const apagar = [REGISTRO[clave].destroy].concat(REGISTRO[clave].destroyExtras || []);
        apagar.forEach(function (nombre) {
            const fn = window[nombre];
            if (typeof fn !== 'function') return;
            try { fn(); } catch (error) { registrarFallo(clave, 'cierre', error); }
        });
        if (activo === clave) activo = '';
        return true;
    }

    /**
     * Punto unico que usa el router en CADA navegacion, sea a donde sea.
     *
     * Si el destino es un modulo, se abre. Si no lo es, se cierra el que
     * estuviera abierto: sin esto, salir de Gestion Energetica hacia una
     * seccion del monolito dejaba el modulo vivo -- sus Chart en memoria y sus
     * listeners colgados -- porque nadie le decia que ya no estaba en pantalla.
     */
    function navegar(clave) {
        if (abrir(clave)) return true;
        if (activo) cerrar(activo);
        return false;
    }

    window.moduleLoader = {
        navegar: navegar,
        abrir: abrir,
        cerrar: cerrar,
        registrado: registrado,
        activo: function () { return activo; },
        claves: function () { return Object.keys(REGISTRO); },
    };
})();
