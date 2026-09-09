/**
 * Reconstruye el index.html "completo": el shell con las vistas de los módulos
 * ya inyectadas en su contenedor.
 *
 * Desde la modularización, el marcado de un módulo extraído no vive en
 * index.html sino en su propio view.html, y solo llega al DOM cuando alguien
 * abre el módulo. Una prueba que lea index.html a secas ve un contenedor vacío
 * y concluye —mal— que el botón, la pestaña o el KPI "no existen".
 *
 * Esto no relaja la comprobación: la reconstruye. Lo que se verifica sigue
 * siendo que cada entrada del menú apunta a algo real y que ese algo está
 * dentro de su sección; solo que ahora se busca donde de verdad está.
 *
 * Si un módulo declara un contenedor pero le falta la vista, esto lanza: es un
 * fallo de la extracción y debe verse, no taparse.
 */

const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');

/** Mapa clave-de-sección -> carpeta base, leído del registro real del loader. */
function registroDeModulos() {
    const loader = fs.readFileSync(path.join(raiz, 'core', 'module-loader.js'), 'utf8');
    const mapa = new Map();
    // Cada entrada del REGISTRO es "'clave': { base: 'ruta', ... }".
    const re = /'([a-z0-9-]+)':\s*\{\s*base:\s*'([^']+)'/g;
    let m;
    while ((m = re.exec(loader)) !== null) mapa.set(m[1], m[2]);
    return mapa;
}

/** index.html con cada <div data-modulo="..."> relleno con su view.html. */
function htmlCompleto() {
    const shell = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
    const registro = registroDeModulos();

    return shell.replace(
        /<div id="([a-z0-9-]+)-section" class="content-section" data-modulo="([a-z0-9-]+)"><\/div>/g,
        (completo, idSeccion, clave) => {
            const base = registro.get(clave);
            if (!base) {
                throw new Error(`El contenedor de "${clave}" no tiene entrada en el registro del loader`);
            }
            const vista = path.join(raiz, base, 'view.html');
            if (!fs.existsSync(vista)) {
                throw new Error(`Falta la vista del modulo "${clave}": ${base}/view.html`);
            }
            const contenido = fs.readFileSync(vista, 'utf8');
            return `<div id="${idSeccion}-section" class="content-section" data-modulo="${clave}">${contenido}</div>`;
        }
    );
}

/** Claves de las secciones que hoy se cargan de forma perezosa. */
function clavesModulares() {
    return [...registroDeModulos().keys()];
}

/**
 * Ruta absoluta de un archivo dentro de un módulo, preguntando al registro.
 *
 * Las pruebas que leen el código de un módulo no deben fijar su ruta: si el
 * módulo se mueve —y en la modularización se han movido todos— lo que falla es
 * la prueba, no el código, y el mensaje no dice por qué.
 *
 *   archivoDeModulo('colaboradores', 'directory-policy.js')
 */
function archivoDeModulo(clave, archivo) {
    const base = registroDeModulos().get(clave);
    if (!base) throw new Error(`No hay módulo registrado con la clave "${clave}"`);
    const ruta = path.join(raiz, base, archivo || 'index.js');
    if (!fs.existsSync(ruta)) throw new Error(`El módulo "${clave}" no tiene ${archivo || 'index.js'}`);
    return ruta;
}

module.exports = { htmlCompleto, registroDeModulos, clavesModulares, archivoDeModulo };
