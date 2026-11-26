/*!
 * Chantier en direct — des curseurs colorés construisent ta page sous tes yeux.
 * Aucune dépendance.
 * (c) 2026 Amine Jebali (@ukiyoaj) — Licence MIT
 *
 * Utilisation : charge ce fichier dans le <head>, sans defer :
 *   <link rel="stylesheet" href="css/chantier.css">
 *   <script src="js/chantier.js" data-logo="aj"></script>
 *
 * Puis marque tes éléments :
 *   class="b"            bloc construit par un curseur (apparaît de gauche à droite)
 *   class="b t"          texte tapé lettre par lettre (texte simple, sans balises dedans)
 *   data-frame           zone (section, header…) encadrée avant d'être remplie
 *   data-l="titre"       nom affiché sur l'étiquette du cadre (facultatif)
 *
 * Options sur la balise <script> :
 *   data-logo="aj"       texte du logo central pendant l'analyse
 *   data-agents="16"     nombre de curseurs (10 par défaut sur mobile)
 *   data-noms="A,B,C"    noms des curseurs
 *   data-auto="false"    ne pas démarrer tout seul (lancer avec Chantier.lancer())
 *   data-lang="en"       langue de la barre de contrôle : "fr" ou "en"
 *                        (par défaut : la langue de la page, <html lang="…">)
 */
(function () {
  'use strict';

  var script = document.currentScript;
  var opt = (script && script.dataset) || {};
  var root = document.documentElement;
  var RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var COULEURS = ['#ff8fa3', '#7cc6ff', '#ffd166', '#7ef0b5', '#c59bff', '#ff9f5a', '#5ee7f0', '#ff6bd6',
                  '#b5f05e', '#9fa8ff', '#ffb3c7', '#6effa0', '#f5e663', '#ff7a7a', '#8ff0ff', '#d2a6ff'];
  var LANGUE = (opt.lang || root.lang || 'fr').toLowerCase().indexOf('fr') === 0 ? 'fr' : 'en';
  var TXT = {
    fr: { analyse: 'Analyse de la page…', agents: 'agents', calques: 'calques', termine: 'Terminé', rejouer: 'Rejouer',
          lancer: 'Lancer l\'animation', reduit: 'Animations réduites sur cet appareil', prete: 'Page prête', passer: 'Tout construire d\'un coup' },
    en: { analyse: 'Scanning page…', agents: 'agents', calques: 'layers', termine: 'Done', rejouer: 'Replay',
          lancer: 'Start the animation', reduit: 'Reduced motion is on', prete: 'Page ready', passer: 'Build everything at once' }
  }[LANGUE];
  var NOMS = (opt.noms ? opt.noms.split(',') : ['Nova', 'Pixel', 'Byte', 'Echo', 'Volt', 'Sora', 'Kiro', 'Lumen',
              'Flux', 'Orion', 'Zed', 'Mika', 'Rune', 'Iris', 'Tak', 'Vega']).map(function (s) { return s.trim(); });

  // On cache les blocs tout de suite, avant l'affichage de la page.
  root.classList.add('chantier');
  // Filet de sécurité : si le moteur ne démarre pas, on montre la page normalement.
  var securite = setTimeout(function () { root.classList.remove('chantier'); }, 4000);

  var $, calque, traces, ctx, logo, barre, ui = {};
  var taches = [], agents = [], total = 0, faits = 0;
  var phase = 'attente', tAnalyse = 0, tour = true, vitesse = 1, dernier = 0, tFin = 0, dpr = 1;

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; }

  function monter() {
    calque = el('div'); calque.id = 'chantier-calque';
    traces = el('canvas'); traces.id = 'chantier-traces';
    logo = el('div'); logo.id = 'chantier-logo';
    logo.textContent = opt.logo || (document.title || '✦').trim().slice(0, 2).toLowerCase();
    barre = el('div', 'chantier-barre',
      '<span class="chantier-points"></span><span class="chantier-etat">' + TXT.analyse + '</span>' +
      '<span class="chantier-jauge"><i></i></span>' +
      '<button data-a="tour" class="actif" aria-pressed="true">Tour</button>' +
      '<button data-a="vitesse">1×</button>' +
      '<button data-a="passer" aria-label="' + TXT.passer + '">×</button>' +
      '<button data-a="rejouer" hidden>' + TXT.rejouer + '</button>');
    document.body.append(calque, traces, logo, barre);
    ctx = traces.getContext('2d');
    ui.points = barre.querySelector('.chantier-points');
    ui.etat = barre.querySelector('.chantier-etat');
    ui.jauge = barre.querySelector('.chantier-jauge i');
    ['tour', 'vitesse', 'passer', 'rejouer'].forEach(function (a) { ui[a] = barre.querySelector('[data-a="' + a + '"]'); });

    ui.tour.onclick = function () { tour = !tour; ui.tour.classList.toggle('actif', tour); ui.tour.setAttribute('aria-pressed', tour); };
    ui.vitesse.onclick = function () { vitesse = vitesse >= 4 ? 1 : vitesse * 2; root.style.setProperty('--chantier-vitesse', vitesse); ui.vitesse.textContent = vitesse + '×'; };
    ui.passer.onclick = toutConstruire;
    ui.rejouer.onclick = lancer;

    var stop = function () {
      if (phase !== 'construction' && phase !== 'analyse') return;
      tour = false; ui.tour.classList.remove('actif'); ui.tour.setAttribute('aria-pressed', 'false');
    };
    addEventListener('wheel', stop, { passive: true });
    addEventListener('touchmove', stop, { passive: true });
    addEventListener('keydown', function (e) {
      if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'End', 'Home'].indexOf(e.key) >= 0) stop();
    });
    document.querySelectorAll('a[href^="#"]').forEach(function (a) { a.addEventListener('click', stop); });
    addEventListener('resize', mesurer);

    taches = Array.prototype.map.call(document.querySelectorAll('[data-frame],.b'), function (e) {
      return { el: e, cadre: e.hasAttribute('data-frame'), texte: e.classList.contains('t'), st: 0, haut: 0 };
    });
    taches.forEach(function (j) {
      var p = j.el.parentElement && j.el.parentElement.closest('.b');
      j.dep = null;
      if (p) for (var i = 0; i < taches.length; i++) if (taches[i].el === p) { j.dep = taches[i]; break; }
    });
    total = taches.length;
  }

  function mesurer() {
    taches.forEach(function (j) { j.haut = j.el.getBoundingClientRect().top + scrollY; });
    dpr = Math.min(2, devicePixelRatio || 1);
    traces.width = innerWidth * dpr; traces.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function rect(e) { var r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; }

  function creerAgents() {
    calque.innerHTML = '';
    var n = parseInt(opt.agents, 10) || (innerWidth < 600 ? 10 : 16);
    agents = [];
    for (var i = 0; i < n; i++) {
      var c = COULEURS[i % COULEURS.length];
      var d = el('div', 'chantier-curseur',
        '<svg viewBox="0 0 20 22" width="20" height="22"><path d="M2 1.5l15 9.4-6.5 1.5 3.8 7.3-3 1.6-3.8-7.4L2 18.5z"/></svg><span></span>');
      d.style.setProperty('--c', c);
      d.querySelector('span').textContent = NOMS[i % NOMS.length];
      calque.appendChild(d);
      var a = Math.random() * 6.28, R = Math.max(innerWidth, innerHeight);
      agents.push({ d: d, c: c, x: innerWidth / 2 + Math.cos(a) * R * .7, y: scrollY + innerHeight / 2 + Math.sin(a) * R * .7,
        tx: 0, ty: 0, st: 'analyse', ang: i / n * 6.28, rad: 62 + (i % 3) * 30, job: null, t: 0, tr: [], cadre: null, r: null });
    }
    ui.points.innerHTML = agents.slice(0, 5).map(function (a) { return '<i style="background:' + a.c + '"></i>'; }).join('');
  }

  function front() { for (var i = 0; i < taches.length; i++) if (taches[i].st < 2) return taches[i].haut; return document.body.scrollHeight; }
  function choisir() {
    var lim = Math.max(front(), scrollY) + innerHeight * 1.2, mieux = null;
    for (var i = 0; i < taches.length; i++) {
      var j = taches[i];
      if (j.st || (j.dep && j.dep.st !== 2) || j.haut > lim) continue;
      if (j.haut >= scrollY - 40 && j.haut < scrollY + innerHeight) return j;
      if (!mieux) mieux = j;
    }
    return mieux;
  }
  function etiquette(e, r) { return (e.dataset.l || e.tagName.toLowerCase()) + ' · ' + Math.round(r.w) + '×' + Math.round(r.h); }

  function commencerTexte(j, c) {
    var e = j.el;
    j.plein = e.textContent.replace(/\s+/g, ' ').trim(); j.n = 0;
    e.textContent = '';
    var a = el('span', 'chantier-tape'), g = el('span', 'chantier-fantome');
    g.textContent = j.plein;
    e.style.setProperty('--c', c);
    e.append(a, g); j.a = a; j.g = g;
    e.classList.add('on');
  }
  function terminer(j) {
    if (j.st === 2) return;
    if (j.texte && j.a) { j.el.textContent = j.plein; j.a = j.g = null; }
    j.el.classList.add('on'); j.st = 2; faits++;
  }
  function lacher(a) {
    if (!a.cadre) return;
    var s = a.cadre; a.cadre = null;
    s.classList.add('fin'); setTimeout(function () { s.remove(); }, 500);
  }

  function pas(a, dt) {
    var k = dt * vitesse;
    if (a.st === 'libre') {
      var j0 = choisir();
      if (j0) { j0.st = 1; a.job = j0; a.r = rect(j0.el); a.tx = a.r.x; a.ty = a.r.y; a.st = 'vol'; }
      else if (Math.hypot(a.tx - a.x, a.ty - a.y) < 8) { a.tx = 40 + Math.random() * (innerWidth - 80); a.ty = scrollY + innerHeight * (.25 + Math.random() * .5); }
      return;
    }
    var j = a.job, r = a.r, p;
    if (a.st === 'vol' && Math.hypot(a.tx - a.x, a.ty - a.y) < 6) {
      a.st = 'selection'; a.t = 0;
      var s = el('div', 'chantier-cadre', '<i></i>');
      s.style.setProperty('--c', a.c);
      s.style.left = r.x + 'px'; s.style.top = r.y + 'px'; s.style.width = s.style.height = '0px';
      s.firstChild.textContent = etiquette(j.el, r);
      calque.appendChild(s); a.cadre = s;
    } else if (a.st === 'selection') {
      a.t += k; p = Math.min(1, a.t / (j.cadre ? .5 : .32));
      var e = 1 - Math.pow(1 - p, 3);
      a.cadre.style.width = r.w * e + 'px'; a.cadre.style.height = r.h * e + 'px';
      a.tx = r.x + r.w * e; a.ty = r.y + (j.cadre ? Math.min(r.h, innerHeight * .5) : r.h) * e;
      if (p >= 1) { a.st = 'travail'; a.t = 0; if (j.texte) commencerTexte(j, a.c); else if (!j.cadre) j.el.classList.add('on'); }
    } else if (a.st === 'travail') {
      a.t += k;
      if (j.texte) {
        var debit = Math.max(40, j.plein.length / 1.1);
        j.n = Math.min(j.plein.length, Math.floor(a.t * debit));
        j.a.textContent = j.plein.slice(0, j.n); j.g.textContent = j.plein.slice(j.n);
        var reste = !!j.g.textContent, rs = (reste ? j.g : j.a).getClientRects();
        if (rs.length) { var q = reste ? rs[0] : rs[rs.length - 1]; a.tx = (reste ? q.left : q.right) + scrollX; a.ty = q.top + q.height * .55 + scrollY; }
        p = j.n >= j.plein.length ? 1 : 0;
      } else {
        p = Math.min(1, a.t / (j.cadre ? .35 : .5));
        if (j.cadre && p >= .3) j.el.classList.add('on');
        a.tx = r.x + r.w * p; a.ty = r.y + Math.min(r.h, j.cadre ? innerHeight * .5 : r.h) * (.5 + .4 * Math.sin(p * 9.4));
      }
      if (p >= 1) { terminer(j); lacher(a); a.job = null; a.st = 'libre'; }
    }
  }

  function majBarre() {
    ui.jauge.style.width = (faits / total * 100) + '%';
    if (phase === 'analyse') ui.etat.textContent = TXT.analyse;
    else if (phase === 'construction') ui.etat.textContent = agents.length + ' ' + TXT.agents + ' · ' + faits + ' / ' + total + ' ' + TXT.calques;
    else ui.etat.textContent = TXT.termine + ' · ' + total + ' ' + TXT.calques;
  }
  function boutonsFin(texte) {
    ui.tour.hidden = ui.vitesse.hidden = ui.passer.hidden = true;
    ui.rejouer.hidden = false; ui.rejouer.textContent = texte;
  }
  function fin() {
    phase = 'fin'; tFin = 0; tour = false; boutonsFin(TXT.rejouer);
    agents.forEach(function (a, i) {
      lacher(a); a.st = 'depart';
      var an = i / agents.length * 6.28;
      a.tx = a.x + Math.cos(an) * innerWidth; a.ty = a.y + Math.sin(an) * innerHeight;
    });
    setTimeout(function () { agents.forEach(function (a) { a.d.style.opacity = 0; }); }, 500);
    majBarre();
  }
  function toutConstruire() {
    agents.forEach(function (a) { lacher(a); a.job = null; });
    taches.forEach(terminer); logo.classList.add('parti'); fin();
  }

  function dessinerTraces() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    if (phase === 'fin' && tFin > 1.2) return;
    agents.forEach(function (a) {
      var L = a.tr.length; ctx.strokeStyle = a.c; ctx.lineWidth = 1.6;
      for (var i = 0; i < L; i++) {
        var q = a.tr[i], s = 2 + i / L * 2.5, x = q[0] - scrollX, y = q[1] - scrollY;
        ctx.globalAlpha = (i + 1) / L * .75;
        ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x + s, y); ctx.moveTo(x, y - s); ctx.lineTo(x, y + s); ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;
  }

  function boucle(t) {
    var dt = Math.min(.05, (t - dernier) / 1000); dernier = t;
    if (phase === 'analyse') {
      tAnalyse += dt;
      var cx = innerWidth / 2, cy = scrollY + innerHeight / 2;
      agents.forEach(function (a) { a.ang += dt * 2.4; a.tx = cx + Math.cos(a.ang) * a.rad * 1.3; a.ty = cy + Math.sin(a.ang) * a.rad; });
      if (tAnalyse > 2) { phase = 'construction'; logo.classList.add('parti'); agents.forEach(function (a) { a.st = 'libre'; a.tx = a.x; a.ty = a.y; }); }
    } else if (phase === 'construction') {
      agents.forEach(function (a) { pas(a, dt); });
      if (faits >= total) fin();
      if (tour) {
        var cible = Math.max(0, Math.min(front() - innerHeight * .38, document.body.scrollHeight - innerHeight)), cur = scrollY;
        if (cible > cur + 1) scrollTo(0, cur + (cible - cur) * Math.min(1, dt * 2.6));
      }
    } else tFin += dt;

    var f = 1 - Math.exp(-dt * (phase === 'analyse' ? 5 : 7.5) * (phase === 'construction' ? Math.sqrt(vitesse) : 1));
    agents.forEach(function (a) {
      a.x += (a.tx - a.x) * f; a.y += (a.ty - a.y) * f;
      a.d.style.transform = 'translate(' + (a.x - 2) + 'px,' + (a.y - 1.5) + 'px)';
      var l = a.tr[a.tr.length - 1];
      if (!l || Math.hypot(l[0] - a.x, l[1] - a.y) > 7) { a.tr.push([a.x, a.y]); if (a.tr.length > 14) a.tr.shift(); }
      else if (a.tr.length && Math.random() < .15) a.tr.shift();
    });
    dessinerTraces(); majBarre();
    if (phase !== 'fin' || tFin < 1.5) requestAnimationFrame(boucle);
  }

  function lancer() {
    taches.forEach(function (j) { j.st = 0; j.el.classList.remove('on'); });
    faits = 0; phase = 'analyse'; tAnalyse = 0; tour = true; vitesse = 1;
    root.style.setProperty('--chantier-vitesse', 1);
    ui.tour.hidden = ui.vitesse.hidden = ui.passer.hidden = false; ui.rejouer.hidden = true;
    ui.tour.classList.add('actif'); ui.tour.setAttribute('aria-pressed', 'true'); ui.vitesse.textContent = '1×';
    logo.classList.remove('parti');
    scrollTo(0, 0); mesurer(); creerAgents();
    dernier = performance.now(); requestAnimationFrame(boucle);
  }

  function preparer() {
    monter();
    clearTimeout(securite);
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    var go = function () { if (go.fait) return; go.fait = 1; lancer(); };
    if (RM || opt.auto === 'false') {
      taches.forEach(terminer); logo.classList.add('parti'); phase = 'fin';
      ui.jauge.style.width = '100%';
      ui.etat.textContent = RM ? TXT.reduit : TXT.prete;
      boutonsFin(TXT.lancer);
      return;
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(go, go);
    setTimeout(go, 1500);
  }

  window.Chantier = {
    lancer: function () { if (ui.rejouer) lancer(); },
    toutConstruire: function () { if (ui.passer) toutConstruire(); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', preparer);
  else preparer();
})();
