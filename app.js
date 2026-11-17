// El ecuador del curso: experiencia de los alumnos por voz.
// Clon de la herramienta del RACE (24/10/2026) con la estética del curso. Los textos viven en
// contenido.json; el estado de cada alumno, en la API (servidor.py en local, Supabase al
// desplegar). El código del enlace (?c=) es la identificación.
const SVG_MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
  'stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/>' +
  '<path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const SVG_PAUSA = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="5" width="3.5" ' +
  'height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/></svg>';
const SVG_OK = '<svg viewBox="0 0 48 48" width="44" height="44" fill="none" stroke="#e0af68" ' +
  'stroke-width="1.5"><circle cx="24" cy="24" r="22"/><path d="M15 24.5l6 6 12-13" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>';

const API = window.API_URL || '/api';
const codigo = new URLSearchParams(location.search).get('c') || '';
const V = document.getElementById('vista');
let T = null, C = null, actual = 0;
let rec = null, trozos = [], flujo = null, ctxAudio = null, analizador = null, rafId = null;
let segundos = 0, reloj = null, blob = null, modoTexto = false, alParar = null;
let camara = null, fotoBlob = null, fotoOrigen = null;

const esc = s => String(s ?? '').replace(/[&<>"]/g,
  c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const $ = id => document.getElementById(id);
const rellena = s => esc(s).replaceAll('{nombre}', esc(C.nombre));
const url = (accion, extra = '') =>
  `${API}?accion=${accion}&c=${encodeURIComponent(codigo)}${extra}`;
const est = i => C.estado[String(i + 1)] || {fragmentos: [], saltada: false};
const contestada = i => est(i).fragmentos.length > 0;
const resuelta = i => contestada(i) || est(i).saltada;
const fotoHecha = () => (C.foto.fragmentos || []).length > 0;
const fotoResuelta = () => fotoHecha() || C.foto.saltada;
const principales = () => T.preguntas.filter(p => !p.abierta).length;
const fecha = f => new Date(f).toLocaleString('es-ES',
  {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});

// ── Arranque ────────────────────────────────────────────────────────────────────────────
async function cargar() {
  try {
    const [rt, rc] = await Promise.all([
      fetch('contenido.json', {cache: 'no-store'}),
      fetch(url('estado'), {cache: 'no-store'})]);
    if (!rt.ok || !rc.ok) throw 0;
    T = await rt.json();
    C = await rc.json();
  } catch (e) {
    V.innerHTML = '<h2>Enlace no válido</h2><p class="sec" style="margin-top:12px">Revisa que ' +
      'has abierto el enlace completo que te enviamos. Si el problema sigue, escríbenos.</p>';
    return;
  }
  document.title = T.titulo;
  $('etqDer').innerHTML = `<b>${esc(T.marca.derecha)}</b>`;
  $('etqIzq').textContent = T.titulo;
  $('etqPie').textContent = T.marca.izquierda;
  const empezado = T.preguntas.some((_, i) => resuelta(i)) || fotoResuelta() || C.permiso;
  if (!empezado) return bienvenida();
  const sig = siguientePaso();
  sig ? sig(true) : deVuelta();
}

// Devuelve la función de la siguiente pantalla pendiente, o null si está todo hecho.
function siguientePaso(desde = -1) {
  let i = T.preguntas.findIndex((_, k) => k > desde && !resuelta(k));
  if (i === -1) i = T.preguntas.findIndex((_, k) => !resuelta(k));
  if (i !== -1) return retoma => pregunta(i, retoma);
  if (!fotoResuelta()) return () => foto();
  if (!C.permiso) return () => permiso();
  return null;
}
function avanzar(desde) { const sig = siguientePaso(desde); sig ? sig(false) : fin(); }

function aguja() {   // la etiqueta de cada pantalla va en su barra
  const total = T.preguntas.length + 2;
  const hechos = T.preguntas.filter((_, k) => resuelta(k)).length +
    (fotoResuelta() ? 1 : 0) + (C.permiso ? 1 : 0);
  const pct = Math.min(100, hechos / total * 100);
  $('aguja').style.left = `calc(${pct}% - 1px)`;
  $('tramo').style.width = pct + '%';
  $('etqPaso').textContent = Math.round(pct) + ' %';
}

// ── Pantallas de entrada ────────────────────────────────────────────────────────────────
function bienvenida() {
  limpiar(); aguja('Inicio');
  const B = T.bienvenida;
  V.innerHTML = `
    <div class="kicker">${esc(T.titulo)}</div>
    <h1>${rellena(B.titulo)}</h1>
    <p style="margin-top:22px">${rellena(B.texto)}</p>
    <p class="sec">${rellena(B.dispositivos)}</p>
    ${B.sorteo ? `<p class="sorteo">${rellena(B.sorteo)}</p>` : ''}
    <p class="nota">${rellena(B.privacidad)}</p>
    <p class="firma">${esc(B.firma)}</p>
    <div class="acciones"><button class="btn btn-pri" id="seguir">Empezar</button></div>`;
  $('seguir').onclick = () => instrucciones(() => pruebaMic(() => pregunta(0)));
}

function instrucciones(volver) {
  limpiar(); aguja('Cómo funciona');
  const I = T.instrucciones;
  V.innerHTML = `
    <div class="kicker">Antes de empezar</div>
    <h2>${esc(I.titulo)}</h2>
    <ol class="pasos">${I.pasos.map((p, k) => `<li><span class="n">0${k + 1}</span><div>
      <b>${rellena(p.titulo)}</b><p>${rellena(p.texto)}</p></div></li>`).join('')}</ol>
    <p class="nota">${rellena(I.nota)}</p>
    <div class="acciones"><button class="btn btn-pri" id="ok">Entendido</button></div>`;
  $('ok').onclick = volver;
}

function pruebaMic(despues, mensaje) {
  limpiar(); aguja('Prueba de micrófono');
  V.innerHTML = `
    <div class="kicker">Prueba de micrófono</div>
    <h2>Primero, probemos el micrófono</h2>
    <p style="margin-top:14px">Pulsa el micrófono, di tu nombre y desde dónde contestas, y vuelve
      a pulsarlo. Después escúchate.</p>
    <div class="grabador">
      <button class="mic" id="pmic" aria-label="Probar el micrófono">${SVG_MIC}</button>
      <div class="ondas" id="ondas">${'<i></i>'.repeat(24)}</div>
      <div class="estado-txt" id="pest">Pulsa el micrófono para empezar la prueba.</div>
      <audio id="preprod" class="oculto" controls></audio>
    </div>
    <div id="aviso"></div>
    <div class="acciones oculto" id="pacc">
      <button class="btn btn-pri" id="psi">Me oigo bien, empezamos</button>
      <button class="btn btn-sec" id="pno">No me oigo</button>
    </div>
    <div class="enlaces"><button class="btn-link" id="pescribir">Prefiero contestar por escrito</button></div>`;
  let maximo = 0;
  if (mensaje) aviso(mensaje);
  $('pescribir').onclick = () => { limpiar(); despues(); };
  $('psi').onclick = () => { limpiar(); despues(); };
  $('pno').onclick = () => pruebaMic(despues, 'Comprueba que el navegador tiene permiso para ' +
    'usar el micrófono (el icono del candado o del micrófono junto a la dirección), que no está ' +
    'silenciado y, si usas auriculares, que están conectados. Luego vuelve a probar. Si sigue ' +
    'sin funcionar, prueba desde el móvil o contesta por escrito.');
  $('pmic').onclick = async () => {
    const mic = $('pmic');
    if (rec && rec.state === 'recording') { rec.stop(); return; }
    try { flujo = await navigator.mediaDevices.getUserMedia({audio: true}); }
    catch (e) {
      return aviso('El navegador no nos deja usar el micrófono. Pulsa el icono del candado o ' +
        'del micrófono junto a la dirección, permite el micrófono y recarga la página. También ' +
        'puedes contestar por escrito.');
    }
    const tipo = tipoSoportado();
    rec = new MediaRecorder(flujo, tipo ? {mimeType: tipo} : undefined); trozos = [];
    rec.ondataavailable = e => { if (e.data.size) trozos.push(e.data); };
    rec.onstop = () => {
      const b = new Blob(trozos, {type: (rec.mimeType || 'audio/webm').split(';')[0]});
      pararMedidor();
      mic.classList.remove('grabando'); mic.innerHTML = SVG_MIC;
      if (maximo < 25) {
        aviso('No hemos captado tu voz: parece que el micrófono no recoge sonido. Revisa que ' +
          'no esté silenciado o que el navegador use el micrófono correcto, y vuelve a probar.');
        rec = null; $('pest').textContent = 'Pulsa el micrófono para repetir la prueba.'; return;
      }
      const a = $('preprod'); a.src = URL.createObjectURL(b); a.classList.remove('oculto');
      $('pest').textContent = 'Escúchate. ¿Se te oye bien?';
      $('pacc').classList.remove('oculto'); rec = null;
    };
    rec.start(500); maximo = 0; aviso('');
    medidor(v => { if (v > maximo) maximo = v; });
    mic.classList.add('grabando'); mic.innerHTML = SVG_PAUSA;
    $('pest').textContent = 'Grabando… Di tu nombre y pulsa de nuevo para terminar.';
  };
}

function deVuelta() {
  limpiar(); aguja('Hola de nuevo');
  V.innerHTML = `
    <div class="kicker">${esc(T.titulo)}</div>
    <h1>Hola de nuevo, ${esc(C.nombre)}</h1>
    <p style="margin-top:18px">Ya lo contestaste todo. Si te has acordado de algo, cuéntalo: se
      sumará a lo que ya nos dijiste, sin borrar nada.</p>
    <div class="acciones">
      <button class="btn btn-pri" id="nuevo">Contar algo nuevo</button>
      <button class="btn btn-sec" id="concreta">Añadir a una pregunta concreta</button>
    </div>`;
  $('nuevo').onclick = () => pregunta(T.preguntas.length - 1);
  $('concreta').onclick = indice;
}

// ── Índice ──────────────────────────────────────────────────────────────────────────────
function barra(etiqueta) {
  return `<div class="barra"><span class="etq">${esc(etiqueta)}</span>
    <button class="mini" id="verIndice">Índice</button>
    <button class="mini redondo" id="ayuda" aria-label="Instrucciones">?</button></div>`;
}
function enlazarBarra(volver) {
  $('verIndice').onclick = indice;
  $('ayuda').onclick = () => instrucciones(volver);
}

function indice() {
  limpiar(); aguja('Índice');
  let n = 0;
  const filas = T.preguntas.map((p, i) => {
    const e = est(i);
    const chip = e.fragmentos.length
      ? `<span class="chip ok">Contestada${e.fragmentos.length > 1 ? ' · ' + e.fragmentos.length : ''}</span>`
      : e.saltada ? '<span class="chip">Saltada</span>' : '<span class="chip">Pendiente</span>';
    const num = p.abierta ? '+' : String(++n);
    return `<li data-i="${i}"><span class="num">${num}</span><span class="txt">${esc(p.texto)}</span>${chip}</li>`;
  }).join('');
  const chipFoto = fotoHecha() ? '<span class="chip ok">Enviada</span>'
    : C.foto.saltada ? '<span class="chip">Saltada</span>' : '<span class="chip">Pendiente</span>';
  const chipPermiso = C.permiso ? '<span class="chip ok">Respondida</span>'
    : '<span class="chip">Pendiente</span>';
  V.innerHTML = barra('Índice') + `<h2>Todo lo que te preguntamos</h2>
    <p class="sec" style="margin-top:10px">Toca cualquiera para contestarla o para añadir algo.</p>
    <ul class="indice">${filas}
      <li data-x="foto"><span class="num">·</span><span class="txt">${esc(T.foto.titulo)}</span>${chipFoto}</li>
      <li data-x="permiso"><span class="num">·</span><span class="txt">${esc(T.permiso.titulo)}</span>${chipPermiso}</li>
    </ul>
    <div class="acciones"><button class="btn btn-sec" id="volver">Volver</button></div>`;
  enlazarBarra(indice);
  $('verIndice').classList.add('oculto');
  V.querySelectorAll('.indice li').forEach(li => li.onclick = () =>
    li.dataset.x === 'foto' ? foto() : li.dataset.x === 'permiso' ? permiso()
      : pregunta(+li.dataset.i));
  $('volver').onclick = () => { const s = siguientePaso(); s ? s(false) : fin(); };
}

// ── Preguntas ───────────────────────────────────────────────────────────────────────────
function fragmentosHTML(i) {
  const fr = est(i).fragmentos; if (!fr.length) return '';
  return `<div class="previas"><div class="etq" style="margin-bottom:10px">Lo que ya has contado</div>
    ${fr.map((f, k) => `<div class="frag"><div class="meta etq">${k + 1}.º · ${f.tipo === 'audio'
      ? 'audio' : 'texto'} · ${fecha(f.fecha)}</div>${f.tipo === 'audio'
      ? `<audio controls preload="none" src="${url('audio', '&f=' + encodeURIComponent(f.fichero))}"></audio>`
      : `<div class="tx">${esc(f.texto)}</div>`}</div>`).join('')}</div>`;
}

function etiquetaPregunta(i) {
  if (T.preguntas[i].abierta) return 'Para terminar · opcional';
  const k = T.preguntas.slice(0, i + 1).filter(p => !p.abierta).length;
  return `Pregunta ${k} de ${principales()}`;
}

function pregunta(i, retoma = false) {
  actual = i; blob = null; segundos = 0; modoTexto = false; limpiar();
  const P = T.preguntas[i], ya = contestada(i), etq = etiquetaPregunta(i);
  aguja(etq);
  V.innerHTML = barra(etq) + `
    ${retoma ? '<p class="sec" style="margin-bottom:14px;font-style:italic">Seguimos por donde lo dejaste.</p>' : ''}
    <h2>${rellena(P.texto)}</h2>
    ${P.abierta && !ya ? '<p class="pista">Si no tienes nada que añadir, pulsa «Saltar».</p>' : ''}
    ${fragmentosHTML(i)}
    <div id="zonaVoz">
      <div class="grabador">
        <button class="mic" id="mic" aria-label="Grabar">${SVG_MIC}</button>
        <div class="ondas" id="ondas">${'<i></i>'.repeat(24)}</div>
        <div class="tiempo" id="tiempo">0:00</div>
        <div class="estado-txt" id="estadoTxt">${ya ? 'Pulsa el micrófono para añadir algo más.'
          : 'Pulsa el micrófono y habla.'}</div>
        <button class="btn-link oculto" id="terminar">Parar y escucharlo antes de enviar</button>
        <audio id="reprod" class="oculto" controls></audio>
      </div>
    </div>
    <div id="zonaTexto" class="oculto"><textarea id="texto" placeholder="Escribe aquí…"></textarea></div>
    <div id="aviso"></div>
    <div class="acciones">
      <button class="btn btn-pri" id="enviar" disabled>${ya ? 'Añadir y seguir' : 'Enviar y seguir'}</button>
      <button class="btn btn-sec oculto" id="regrabar">Volver a grabar</button>
      ${ya ? '<button class="btn btn-sec" id="siguiente">Siguiente →</button>' : ''}
      ${i > 0 ? '<button class="btn btn-sec" id="anterior">← Anterior</button>' : ''}
    </div>
    <div class="enlaces">
      <button class="btn-link" id="alternar">Prefiero escribir</button>
      ${ya ? '' : '<button class="btn-link" id="saltar">Saltar esta pregunta</button>'}
    </div>`;
  enlazarBarra(() => pregunta(i));
  $('mic').onclick = pulsarMic;
  $('terminar').onclick = terminar;
  $('regrabar').onclick = () => pregunta(i);
  $('enviar').onclick = enviar;
  if ($('anterior')) $('anterior').onclick = () => pregunta(i - 1);
  if ($('siguiente')) $('siguiente').onclick = () => avanzar(i);
  if ($('saltar')) $('saltar').onclick = saltar;
  $('alternar').onclick = () => {
    modoTexto = !modoTexto;
    if (modoTexto && rec && rec.state !== 'inactive') terminar();
    $('zonaVoz').classList.toggle('oculto', modoTexto);
    $('zonaTexto').classList.toggle('oculto', !modoTexto);
    $('regrabar').classList.add('oculto');
    $('alternar').textContent = modoTexto ? 'Prefiero hablar' : 'Prefiero escribir';
    $('enviar').disabled = modoTexto ? !$('texto').value.trim() : !blob;
    if (modoTexto) $('texto').focus();
  };
  $('texto').oninput = e => { if (modoTexto) $('enviar').disabled = !e.target.value.trim(); };
}

function tipoSoportado() {
  for (const t of ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'])
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
  return '';
}

async function pulsarMic() {
  const mic = $('mic'), txt = $('estadoTxt');
  if (!rec) {
    try { flujo = await navigator.mediaDevices.getUserMedia({audio: true}); }
    catch (e) {
      return aviso('No hemos podido usar el micrófono. Revisa el permiso del navegador o pulsa ' +
        '«Prefiero escribir».');
    }
    const tipo = tipoSoportado();
    rec = new MediaRecorder(flujo, Object.assign({audioBitsPerSecond: 48000},
      tipo ? {mimeType: tipo} : {}));
    trozos = [];
    rec.ondataavailable = e => { if (e.data.size) trozos.push(e.data); };
    rec.onstop = () => {
      blob = new Blob(trozos, {type: (rec.mimeType || 'audio/webm').split(';')[0]});
      if (alParar) { const f = alParar; alParar = null; pararMedidor(); return f(); }
      const a = $('reprod'); a.src = URL.createObjectURL(blob); a.classList.remove('oculto');
      $('enviar').disabled = false;
      $('regrabar').classList.remove('oculto');
      $('terminar').classList.add('oculto');
      mic.classList.remove('grabando', 'pausado'); mic.innerHTML = SVG_MIC; mic.disabled = true;
      txt.textContent = 'Escúchalo si quieres. Si te vale, pulsa «Enviar y seguir»; si no, ' +
        '«Volver a grabar».';
      pararMedidor();
    };
    rec.start(1000);
    medidor(); arrancarReloj();
    mic.classList.add('grabando'); mic.innerHTML = SVG_PAUSA; mic.setAttribute('aria-label', 'Pausar');
    $('terminar').classList.remove('oculto');
    $('enviar').disabled = false;
    txt.textContent = 'Grabando. Cuando acabes, pulsa «Enviar y seguir».';
  } else if (rec.state === 'recording') {
    rec.pause(); pararReloj();
    mic.classList.replace('grabando', 'pausado'); mic.innerHTML = SVG_MIC;
    mic.setAttribute('aria-label', 'Continuar');
    txt.textContent = 'En pausa. Pulsa el micrófono para seguir hablando, o «Enviar y seguir» ' +
      'si ya has terminado.';
  } else if (rec.state === 'paused') {
    rec.resume(); arrancarReloj();
    mic.classList.replace('pausado', 'grabando'); mic.innerHTML = SVG_PAUSA;
    mic.setAttribute('aria-label', 'Pausar');
    txt.textContent = 'Grabando. Cuando acabes, pulsa «Enviar y seguir».';
  }
}
function terminar() { if (rec && rec.state !== 'inactive') { rec.stop(); pararReloj(); } }

const MAX_SEG = 30 * 60;
function arrancarReloj() {
  pararReloj();
  reloj = setInterval(() => {
    segundos++;
    if (segundos >= MAX_SEG && rec && rec.state === 'recording') {
      terminar();
      aviso('Llevas media hora grabando en esta pregunta. Envíala y, si quieres seguir, vuelve ' +
        'a ella desde el índice para añadir algo más.');
    }
    const el = $('tiempo');
    if (el) el.textContent = Math.floor(segundos / 60) + ':' + String(segundos % 60).padStart(2, '0');
  }, 1000);
}
function pararReloj() { clearInterval(reloj); reloj = null; }

function medidor(alNivel) {
  try {
    ctxAudio = new (window.AudioContext || window.webkitAudioContext)();
    analizador = ctxAudio.createAnalyser(); analizador.fftSize = 64;
    ctxAudio.createMediaStreamSource(flujo).connect(analizador);
    const datos = new Uint8Array(analizador.frequencyBinCount);
    const barras = [...document.querySelectorAll('#ondas i')];
    const pinta = () => {
      analizador.getByteFrequencyData(datos);
      const activo = rec && rec.state === 'recording';
      if (activo && alNivel) alNivel(Math.max(...datos));
      barras.forEach((b, k) => {
        const v = activo ? datos[(k + 2) % datos.length] / 255 : 0;
        b.style.height = (3 + v * 30) + 'px';
      });
      rafId = requestAnimationFrame(pinta);
    };
    pinta();
  } catch (e) {}
}
function pararMedidor() {
  cancelAnimationFrame(rafId);
  document.querySelectorAll('#ondas i').forEach(b => b.style.height = '3px');
  if (flujo) flujo.getTracks().forEach(t => t.stop());
  if (ctxAudio) ctxAudio.close().catch(() => {});
}
function limpiar() {
  if (rec && rec.state !== 'inactive') { rec.onstop = null; rec.stop(); }
  pararReloj(); cancelAnimationFrame(rafId);
  if (flujo) flujo.getTracks().forEach(t => t.stop());
  if (ctxAudio) ctxAudio.close().catch(() => {});
  if (camara) camara.getTracks().forEach(t => t.stop());
  rec = null; flujo = null; ctxAudio = null; camara = null;
}

function aviso(m) { const a = $('aviso'); if (a) a.innerHTML = m ? `<div class="aviso">${esc(m)}</div>` : ''; }

async function enviar() {
  const b = $('enviar'), rotulo = b.textContent; b.disabled = true; b.textContent = 'Enviando…'; aviso('');
  if (!modoTexto && rec && rec.state !== 'inactive') {
    await new Promise(r => { alParar = r; rec.stop(); pararReloj(); });
  }
  const cuerpo = modoTexto ? $('texto').value.trim() : blob;
  const tipo = modoTexto ? 'text/plain; charset=utf-8' : (blob.type || 'audio/webm');
  try {
    const r = await fetch(url('respuesta', '&n=' + actual),
      {method: 'POST', headers: {'Content-Type': tipo}, body: cuerpo});
    if (!r.ok) throw 0;
    C.estado = (await r.json()).estado;
    avanzar(actual);
  } catch (e) {
    b.disabled = false; b.textContent = rotulo;
    aviso('No se ha podido enviar. Comprueba la conexión y vuelve a intentarlo: tu grabación ' +
      'sigue aquí.');
  }
}
async function saltar() {
  limpiar();
  try {
    const r = await fetch(url('saltar', '&n=' + actual), {method: 'POST'});
    if (r.ok) C.estado = (await r.json()).estado;
  } catch (e) {}
  avanzar(actual);
}

// ── Foto (opcional) ─────────────────────────────────────────────────────────────────────
function foto() {
  limpiar(); fotoBlob = null; fotoOrigen = null; aguja('Foto · opcional');
  const F = T.foto, ya = fotoHecha();
  V.innerHTML = barra('Foto · opcional') + `
    <h2>${rellena(F.titulo)}</h2>
    <p style="margin-top:14px">${rellena(F.texto)}</p>
    ${ya ? `<div class="lienzo"><img src="${url('foto', '&t=' + Date.now())}" alt="Tu foto"></div>
      <p class="sec" style="margin-top:12px;font-style:italic">Esta es la foto que nos enviaste. Si
      quieres, puedes cambiarla.</p>` : ''}
    <div id="zonaFoto"></div>
    <div id="aviso"></div>
    <div class="caminos" id="caminos">
      <button class="btn btn-pri" id="fCamara">${esc(F.camara)}</button>
      <button class="btn btn-sec" id="fSubir">${esc(F.subir)}</button>
      <input type="file" id="fFichero" accept="image/*" class="oculto">
    </div>
    <div class="enlaces">${ya ? '<button class="btn-link" id="fSeguir">Seguir sin cambiarla</button>'
      : `<button class="btn-link" id="fSaltar">${esc(F.saltar)}</button>`}</div>`;
  enlazarBarra(foto);
  $('fCamara').onclick = abrirCamara;
  $('fSubir').onclick = () => $('fFichero').click();
  $('fFichero').onchange = e => { const f = e.target.files[0]; if (f) prepararSubida(f); };
  if ($('fSaltar')) $('fSaltar').onclick = saltarFoto;
  if ($('fSeguir')) $('fSeguir').onclick = trasFoto;
}

async function abrirCamara() {
  aviso('');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return aviso('Este navegador no nos deja usar la cámara. Usa «' + T.foto.subir + '».');
  }
  try {
    camara = await navigator.mediaDevices.getUserMedia({audio: false,
      video: {facingMode: 'user', width: {ideal: 1280}, height: {ideal: 1280}}});
  } catch (e) {
    return aviso('No hemos podido abrir la cámara. Revisa el permiso del navegador (el icono ' +
      'junto a la dirección) o usa «' + T.foto.subir + '».');
  }
  $('caminos').classList.add('oculto');
  $('zonaFoto').innerHTML = `<div class="lienzo"><video id="video" autoplay playsinline muted></video>
      <i class="esq a"></i><i class="esq b"></i><i class="esq c"></i><i class="esq d"></i></div>
    <div class="acciones"><button class="btn btn-pri" id="disparar">Hacer la foto</button>
      <button class="btn btn-sec" id="cancelar">Cancelar</button></div>`;
  const v = $('video'); v.srcObject = camara;
  $('zonaFoto').scrollIntoView({behavior: 'smooth', block: 'start'});
  $('cancelar').onclick = foto;
  $('disparar').onclick = async () => {
    if (!v.videoWidth) return;
    // Recorte central 4:5, sin espejo: la foto sale como la verían los demás.
    const w = v.videoWidth, h = v.videoHeight, r = 4 / 5;
    let sw = w, sh = w / r; if (sh > h) { sh = h; sw = h * r; }
    const escala = Math.min(1, 1200 / sw);
    const cv = document.createElement('canvas');
    cv.width = Math.round(sw * escala); cv.height = Math.round(sh * escala);
    cv.getContext('2d').drawImage(v, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, cv.width, cv.height);
    const b = await new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.88));
    camara.getTracks().forEach(t => t.stop()); camara = null;
    vistaPrevia(b, 'camara');
  };
}

async function prepararSubida(fichero) {
  aviso('');
  if (fichero.size > 25 * 1024 * 1024) return aviso('Esa foto es demasiado grande. Prueba con otra.');
  // Se reescala a 1600 px y se pasa a JPEG: pesa menos y se quitan los datos ocultos (GPS).
  let b = null;
  try {
    const img = await createImageBitmap(fichero);
    const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width * escala); cv.height = Math.round(img.height * escala);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    b = await new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.88));
  } catch (e) { b = null; }
  if (!b) {
    if (fichero.size > 12 * 1024 * 1024) return aviso('No podemos leer esa foto. Prueba con otra.');
    b = fichero;
  }
  vistaPrevia(b, 'subida', b === fichero);
}

function vistaPrevia(b, origen, sinVista = false) {
  fotoBlob = b; fotoOrigen = origen;
  $('caminos').classList.add('oculto');
  $('zonaFoto').innerHTML = `${sinVista ? '<p class="sec" style="margin-top:20px">No podemos ' +
      'enseñarte la vista previa de este formato, pero puedes enviarla igualmente.</p>'
    : `<div class="lienzo"><img id="previa" alt="Vista previa de tu foto"></div>`}
    <div class="acciones"><button class="btn btn-pri" id="fEnviar">Usar esta foto</button>
      <button class="btn btn-sec" id="fOtra">${origen === 'camara' ? 'Repetir' : 'Elegir otra'}</button></div>`;
  if (!sinVista) $('previa').src = URL.createObjectURL(b);
  $('zonaFoto').scrollIntoView({behavior: 'smooth', block: 'start'});
  $('fOtra').onclick = () => origen === 'camara' ? abrirCamara() : $('fFichero').click();
  $('fEnviar').onclick = enviarFoto;
}

async function enviarFoto() {
  const b = $('fEnviar'); b.disabled = true; b.textContent = 'Enviando…'; aviso('');
  try {
    const r = await fetch(url('foto', '&origen=' + fotoOrigen), {method: 'POST',
      headers: {'Content-Type': fotoBlob.type || 'image/jpeg'}, body: fotoBlob});
    if (!r.ok) throw 0;
    C.foto = (await r.json()).foto;
    trasFoto();
  } catch (e) {
    b.disabled = false; b.textContent = 'Usar esta foto';
    aviso('No se ha podido enviar la foto. Comprueba la conexión y vuelve a intentarlo.');
  }
}
async function saltarFoto() {
  try {
    const r = await fetch(url('foto_saltar'), {method: 'POST'});
    if (r.ok) C.foto = (await r.json()).foto;
  } catch (e) {}
  trasFoto();
}
function trasFoto() { limpiar(); C.permiso ? avanzar(T.preguntas.length) : permiso(); }

// ── Permiso (separado de todo lo anterior) ─────────────────────────────────────────────
function permiso() {
  limpiar(); aguja('Permiso');
  const P = T.permiso, previo = C.permiso;
  V.innerHTML = barra('Aparte') + `
    <h2>${rellena(P.titulo)}</h2>
    <p style="margin-top:14px">${rellena(P.texto)}</p>
    <div class="opciones" role="radiogroup">${P.opciones.map(o => `
      <label class="opcion"><input type="radio" name="permiso" value="${esc(o.id)}"
        ${previo && previo.opcion === o.id ? 'checked' : ''}><span class="punto"></span>
        <span class="t">${rellena(o.texto)}${o.detalle
          ? `<span class="d">${rellena(o.detalle)}</span>` : ''}</span></label>`).join('')}</div>
    ${previo ? `<div class="sello">Respondiste el ${esc(fecha(previo.fecha))}</div>` : ''}
    <p class="nota">${rellena(P.nota)}</p>
    <div id="aviso"></div>
    <div class="acciones"><button class="btn btn-pri" id="pGuardar" ${previo ? '' : 'disabled'}>${esc(P.boton)}</button></div>`;
  enlazarBarra(permiso);
  V.querySelectorAll('input[name=permiso]').forEach(r => r.onchange = () => $('pGuardar').disabled = false);
  $('pGuardar').onclick = async () => {
    const elegido = V.querySelector('input[name=permiso]:checked');
    if (!elegido) return;
    const op = P.opciones.find(o => o.id === elegido.value);
    const b = $('pGuardar'); b.disabled = true; b.textContent = 'Guardando…';
    try {
      const r = await fetch(url('permiso'), {method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({opcion: op.id, texto: op.texto, pregunta: P.texto, version: T.version})});
      if (!r.ok) throw 0;
      C.permiso = (await r.json()).permiso;
      avanzar(T.preguntas.length);
    } catch (e) {
      b.disabled = false; b.textContent = P.boton;
      aviso('No se ha podido guardar. Comprueba la conexión y vuelve a intentarlo.');
    }
  };
}

// ── Final ───────────────────────────────────────────────────────────────────────────────
function fin() {
  limpiar(); aguja('Completado');
  const F = T.final;
  V.innerHTML = `
    <div style="margin-bottom:22px">${SVG_OK}</div>
    <h1>${rellena(F.titulo)}</h1>
    <p style="margin-top:20px">${rellena(F.texto)}</p>
    ${F.sorteo ? `<p class="sorteo">${rellena(F.sorteo)}</p>` : ''}
    <p class="nota">${rellena(F.nota)}</p>
    <p class="firma">${esc(F.firma)}</p>
    <div class="acciones"><button class="btn btn-sec" id="revisar">Revisar o añadir algo</button></div>`;
  $('revisar').onclick = indice;
}

cargar();
