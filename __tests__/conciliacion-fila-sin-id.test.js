/**
 * @jest-environment jsdom
 *
 * Dos huecos por los que todavía podía nacer una fila que nadie pidió.
 *
 * 1) La guarda que impide crear una fila sin captura miraba la marca conciNew.
 *    Esa marca dice cómo NACIÓ la fila en pantalla, no si existe en la base: se
 *    pone al crearla y se quita cuando el insert responde con un id. Una fila
 *    que se quedara sin la marca pero sin id —un alta que respondió sin id, un
 *    repintado que no la copió, una vía nueva que no se acuerde de ponerla—
 *    dejaba de estar protegida, y guardarla significa CREARLA. La condición
 *    real siempre fue no tener id.
 *
 * 2) _conciAddBlankRow aprende a reutilizar una fila que siga en blanco en vez
 *    de apilar otra. Cuando lo hace no añade nada al final del tbody, pero
 *    _conciRestaurarFilasNuevas seguía leyendo tbody.lastElementChild para
 *    saber "su" fila: escribía la captura recuperada del borrador encima de una
 *    fila que no era la suya.
 */

const fs = require('fs');
const path = require('path');

const source = fs
  .readFileSync(path.resolve(__dirname, '..', 'script.js'), 'utf8')
  .replace(/\r\n/g, '\n');

function extraer(nombre) {
  const marca = `function ${nombre}(`;
  const inicio = source.indexOf(marca);
  if (inicio === -1) throw new Error(`No se encontró ${nombre} en script.js`);
  return source.slice(inicio, source.indexOf('\n}\n', inicio) + 2);
}

const api = new Function(`
  ${extraer('_conciFilaNuevaListaParaGuardar')}
  return { _conciFilaNuevaListaParaGuardar };
`)();

/** Fila mínima: sólo lo que mira la guarda. */
function fila({ rowId = '', nueva = false, fuente = '' } = {}) {
  return { dataset: { rowId, conciNew: nueva ? '1' : undefined, rowFuente: fuente } };
}

const listaParaGuardar = (tr, hayCaptura) => api._conciFilaNuevaListaParaGuardar(tr, hayCaptura);

describe('sin id, guardar significa crear', () => {
  test('una fila sin id y sin captura no se crea', () => {
    expect(listaParaGuardar(fila({ nueva: true }), false)).toBe(false);
  });

  test('en cuanto hay captura del usuario, sí se crea', () => {
    expect(listaParaGuardar(fila({ nueva: true }), true)).toBe(true);
  });

  // El hueco: la marca conciNew podía faltar y la fila seguía sin existir.
  test('una fila sin id tampoco se crea aunque haya perdido la marca conciNew', () => {
    expect(listaParaGuardar(fila({ nueva: false }), false)).toBe(false);
  });

  test('una fila que ya existe en la base se guarda siempre', () => {
    expect(listaParaGuardar(fila({ rowId: '77' }), false)).toBe(true);
  });

  test('una fila nueva que ya recibió su id se trata como existente', () => {
    expect(listaParaGuardar(fila({ rowId: '77', nueva: true }), false)).toBe(true);
  });

  test('un id con espacios no cuenta como id', () => {
    expect(listaParaGuardar(fila({ rowId: '   ' }), false)).toBe(false);
  });
});

describe('las filas espejo del itinerario siguen su propio camino', () => {
  test('"Solo Vuelos" no se ve afectada por esta guarda', () => {
    expect(listaParaGuardar(fila({ fuente: 'Solo Vuelos' }), false)).toBe(true);
  });
});

describe('quién es "mi" fila al recuperar un borrador', () => {
  test('_conciAddBlankRow devuelve la fila, creada o reutilizada', () => {
    const cuerpo = extraer('_conciAddBlankRow');
    // Reutilizada.
    expect(cuerpo).toContain('return enBlanco;');
    // Recién creada.
    expect(cuerpo).toContain('return tr;');
    // Y los cortes por permiso o por falta de columnas no devuelven undefined
    // por accidente: dicen que no hay fila.
    expect(cuerpo).toContain('return null;');
  });

  test('la recuperación usa esa fila y no el último <tr> del tbody', () => {
    const cuerpo = extraer('_conciRestaurarFilasNuevas');
    expect(cuerpo).toContain('const tr = _conciAddBlankRow();');
    // Ésta era la lectura que escribía sobre una fila ajena.
    expect(cuerpo).not.toContain('tbody.lastElementChild');
  });
});
