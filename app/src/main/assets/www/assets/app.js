/* ===========================================================
   喵记 · 猫粮猫砂记录  (app.js)
   纯前端 · 数据保存在本机 localStorage · 无任何依赖
   =========================================================== */
'use strict';
(function () {

  /* ================= 基础工具 ================= */
  var DAY = 86400000;
  var KEY = 'miaojil.v1';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toISO(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function fromISO(s) { var p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function todayISO() { return toISO(new Date()); }
  function diffDays(a, b) { return Math.round((fromISO(b) - fromISO(a)) / DAY); }
  function addDaysISO(iso, n) { var d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); }
  function isValidISO(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(fromISO(s).getTime()); }
  function fmtMD(iso) { var d = fromISO(iso); return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
  var WK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  function fmtWeek(iso) { return WK[fromISO(iso).getDay()]; }
  function hexA(hex, a) {
    var h = String(hex || '#b9aea4').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* ================= 状态 ================= */
  var db = null;
  var UI = { tab: 'home', type: 'all', cat: 'all', scroll: {}, lastBoxId: null, lastCatId: null, day: todayISO() };
  var installEvt = null;

  /* ================= 存储 ================= */
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch (e) { toast('保存失败：手机存储空间可能满了'); }
  }
  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }
    if (!raw) return null;
    try {
      var d = JSON.parse(raw);
      if (!d || !Array.isArray(d.cats)) return null;
      d.boxes = d.boxes || []; d.bags = d.bags || []; d.litters = d.litters || [];
      d.prefs = d.prefs || {};
      if (!d.prefs.defaultCycle) d.prefs.defaultCycle = 14;
      if (!d.prefs.notified) d.prefs.notified = {};
      return d;
    } catch (e) { return null; }
  }

  /* ================= 派生数据 ================= */
  function catById(id) {
    for (var i = 0; i < db.cats.length; i++) if (db.cats[i].id === id) return db.cats[i];
    return null;
  }
  function catName(id) { var c = catById(id); return c ? c.name : '两只共用'; }
  function catColor(id) { var c = catById(id); return c ? c.color : '#b9aea4'; }
  function catEmoji(id) { var c = catById(id); return c ? c.emoji : '🐾'; }
  function boxById(id) {
    for (var i = 0; i < db.boxes.length; i++) if (db.boxes[i].id === id) return db.boxes[i];
    return null;
  }
  function bagById(id) {
    for (var i = 0; i < db.bags.length; i++) if (db.bags[i].id === id) return db.bags[i];
    return null;
  }
  function kindText(k) { return k === 'wet' ? '罐头 / 湿粮' : '干粮'; }

  function weightText(g) {
    g = Number(g) || 0;
    if (g <= 0) return '';
    if (g >= 1000) {
      var v = g / 1000;
      return (Math.round(v * 100) / 100).toString().replace(/\.0+$/, '') + ' kg';
    }
    return g + ' g';
  }

  /* 某只猫最近几袋的消耗情况 */
  function catStats(catId) {
    var done = db.bags.filter(function (b) {
      return b.catId === (catId || null) && b.finishedAt && isValidISO(b.finishedAt) && isValidISO(b.openedAt);
    }).map(function (b) {
      var days = Math.max(1, diffDays(b.openedAt, b.finishedAt));
      return { days: days, g: Number(b.weightG) || 0, finishedAt: b.finishedAt };
    }).sort(function (a, b) { return b.finishedAt.localeCompare(a.finishedAt); }).slice(0, 3);
    if (!done.length) return null;
    var avgDays = done.reduce(function (s, b) { return s + b.days; }, 0) / done.length;
    var withG = done.filter(function (b) { return b.g > 0; });
    var dailyG = null;
    if (withG.length) {
      dailyG = withG.reduce(function (s, b) { return s + b.g / b.days; }, 0) / withG.length;
    }
    return { avgDays: Math.max(1, Math.round(avgDays)), dailyG: dailyG, samples: done.length };
  }

  /* 正在吃的那袋的进度 */
  function bagProgress(bag) {
    var t = todayISO();
    var elapsed = Math.max(0, diffDays(bag.openedAt, t));
    var st = catStats(bag.catId);
    var total = null, left = null, dueISO = null, pct = null, dailyG = null;
    if (st && st.dailyG && Number(bag.weightG) > 0) {
      dailyG = st.dailyG;
      total = Math.max(1, Math.round(Number(bag.weightG) / st.dailyG));
      dueISO = addDaysISO(bag.openedAt, total);
      left = total - elapsed;
      pct = clamp(elapsed / total, 0, 1);
    }
    return { elapsed: elapsed, total: total, left: left, dueISO: dueISO, pct: pct, dailyG: dailyG, stat: st };
  }

  /* 砂盆状态 */
  function boxStatus(box) {
    var recs = db.litters.filter(function (r) { return r.boxId === box.id; })
      .sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
    var last = recs[0] || null;
    if (!last) return { state: 'empty', last: null, since: null, left: null, total: null, pct: null };
    var t = todayISO();
    var since = Math.max(0, diffDays(last.at, t));
    if (!last.nextAt || !isValidISO(last.nextAt)) {
      return { state: 'none', last: last, since: since, left: null, total: null, pct: null };
    }
    var total = Math.max(1, diffDays(last.at, last.nextAt));
    var left = diffDays(t, last.nextAt);
    var state = 'ok';
    if (left < 0) state = 'overdue';
    else if (left === 0) state = 'due';
    else if (left <= 2) state = 'soon';
    return { state: state, last: last, since: since, left: left, total: total, pct: clamp(since / total, 0, 1) };
  }

  /* ================= 渲染：外壳 ================= */
  function render() {
    if (!db) return;
    renderTopbar();
    renderTabs();
    var view = $('#view');
    var el = document.createElement('div');
    if (UI.tab === 'home') el.innerHTML = viewHome();
    else if (UI.tab === 'records') el.innerHTML = viewRecords();
    else el.innerHTML = viewSettings();
    view.innerHTML = '';
    view.appendChild(el);
    view.scrollTop = UI.scroll[UI.tab] || 0;
  }

  function renderTopbar() {
    var cfg = {
      home: { title: '喵记', sub: db.cats.map(function (c) { return c.name; }).join(' · ') },
      records: { title: '记录', sub: '所有猫粮和猫砂的流水' },
      settings: { title: '我的', sub: '猫咪资料与设置' }
    }[UI.tab];
    var add = UI.tab === 'settings' ? '' :
      '<button class="tb-add" data-act="quick" aria-label="记一笔">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>';
    $('#topbar').innerHTML = '<div class="tb-title">' + esc(cfg.title) + '<small>' + esc(cfg.sub) + '</small></div>' + add;
  }

  var ICON = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3.2 10.4 12 3.2l8.8 7.2"/><path d="M5.6 9.2V20a1 1 0 0 0 1 1h3.2v-5.4h4.4V21h3.2a1 1 0 0 0 1-1V9.2"/></svg>',
    records: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.6" cy="6.5" r="1.5" fill="currentColor" stroke="none"/><circle cx="4.6" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="4.6" cy="17.5" r="1.5" fill="currentColor" stroke="none"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="8" r="3.4"/><path d="M4.6 20.2c1.3-4 4.1-6 7.4-6s6.1 2 7.4 6"/></svg>'
  };

  function renderTabs() {
    var items = [
      { k: 'home', t: '首页' },
      { k: 'records', t: '记录' },
      { k: 'settings', t: '我的' }
    ];
    $('#tabbar').innerHTML = items.map(function (i) {
      return '<button class="tab' + (UI.tab === i.k ? ' on' : '') + '" data-tab="' + i.k + '">' + ICON[i.k] + '<span>' + i.t + '</span></button>';
    }).join('');
  }

  function catBadge(catId) {
    return '<span class="cat-badge" style="background:' + hexA(catColor(catId), 0.15) +
      ';box-shadow:inset 0 0 0 1px ' + hexA(catColor(catId), 0.22) + '">' + catEmoji(catId) + '</span>';
  }

  /* ================= 首页 ================= */
  function viewHome() {
    var t = todayISO();
    var h = '<div class="dayhead"><h1>今天</h1><span>' + fmtMD(t) + ' · ' + fmtWeek(t) + '</span></div>';
    h += alertHTML();

    h += '<div class="sec-head"><h2>猫砂</h2><span class="sec-note">' +
      (db.boxes.length ? db.boxes.length + ' 个砂盆' : '还没添加') + '</span></div>';
    if (!db.boxes.length) {
      h += emptyCard('还没有猫砂盆', '加一个砂盆，就能记每次换砂和下次到期', '添加砂盆', 'box-new');
    } else {
      db.boxes.forEach(function (box) { h += litterCard(box); });
    }

    var openCount = db.bags.filter(function (b) { return !b.finishedAt; }).length;
    h += '<div class="sec-head"><h2>猫粮</h2><span class="sec-note">' +
      (openCount ? openCount + ' 袋正在吃' : '当前没有开封的') + '</span></div>';

    db.cats.forEach(function (cat) {
      var opens = db.bags.filter(function (b) { return b.catId === cat.id && !b.finishedAt; })
        .sort(function (a, b) { return String(b.openedAt).localeCompare(String(a.openedAt)); });
      if (!opens.length) h += emptyBagCard(cat);
      else opens.forEach(function (bag) { h += bagCard(bag); });
    });

    var shared = db.bags.filter(function (b) { return !b.catId && !b.finishedAt; })
      .sort(function (a, b) { return String(b.openedAt).localeCompare(String(a.openedAt)); });
    if (shared.length) {
      h += '<div class="sec-head"><h2>两只一起吃的</h2><span class="sec-note">' + shared.length + ' 袋</span></div>';
      shared.forEach(function (bag) { h += bagCard(bag); });
    }
    return h;
  }

  function alertHTML() {
    var t = todayISO(), items = [];
    db.boxes.forEach(function (box) {
      var s = boxStatus(box);
      if (s.state === 'overdue') items.push({ danger: true, title: box.name + ' 该换砂了', sub: '已经超期 ' + (-s.left) + ' 天' });
      else if (s.state === 'due') items.push({ danger: true, title: box.name + ' 今天该换砂了', sub: '换完顺手记一笔就好' });
      else if (s.state === 'soon') items.push({ danger: false, title: box.name + ' 还有 ' + s.left + ' 天换砂', sub: '提前备好猫砂' });
    });
    db.bags.forEach(function (bag) {
      if (bag.finishedAt) return;
      var p = bagProgress(bag);
      if (p.dueISO && diffDays(t, p.dueISO) <= 0) {
        items.push({ danger: false, title: (bag.name || '这袋猫粮') + ' 预计吃完了', sub: '记得开新的一袋' });
      }
    });
    if (!items.length) return '';
    var worst = items.some(function (i) { return i.danger; });
    return '<div class="alert' + (worst ? '' : ' warn') + '"><div class="alert-ico">' + (worst ? '🔔' : '🐾') + '</div>' +
      '<div class="alert-body"><ul class="alert-list">' + items.map(function (i) {
        return '<li><b>' + esc(i.title) + '</b><span>' + esc(i.sub) + '</span></li>';
      }).join('') + '</ul></div></div>';
  }

  var LITTER_TAG = { ok: '正常', soon: '快到了', due: '今天', overdue: '超期', none: '无提醒', empty: '未记录' };

  function litterCard(box) {
    var s = boxStatus(box);
    var barCls = s.state === 'overdue' ? 'overdue' : s.state === 'soon' || s.state === 'due' ? 'soon' : 'ok';
    var big = '', meta = '', bar = '';

    if (s.state === 'empty') {
      big = '还没记录过';
      meta = '记一次换砂，就会开始倒计时';
    } else if (s.state === 'none') {
      big = '已用 <b>' + s.since + '</b> 天';
      meta = '上次 ' + fmtMD(s.last.at) + ' 换 · 这次没设下次日期';
    } else if (s.state === 'due') {
      big = '今天该换砂了';
      meta = '上次 ' + fmtMD(s.last.at) + ' 换 · 每 ' + s.total + ' 天';
    } else if (s.state === 'overdue') {
      big = '超期 <b class="danger">' + (-s.left) + '</b> 天';
      meta = '上次 ' + fmtMD(s.last.at) + ' 换 · 每 ' + s.total + ' 天';
    } else {
      big = '还剩 <b>' + s.left + '</b> 天';
      meta = '上次 ' + fmtMD(s.last.at) + ' 换 · 每 ' + s.total + ' 天';
    }
    if (s.state === 'ok' || s.state === 'soon' || s.state === 'due' || s.state === 'overdue') {
      bar = '<div class="bar ' + barCls + '"><i style="width:' + Math.round((s.pct || 0) * 100) + '%"></i></div>';
    }

    return '<article class="card" data-box-card="' + box.id + '">' +
      '<div class="card-top">' + catBadge(box.catId) +
      '<div class="card-titles"><div class="card-name">' + esc(box.name) + '</div>' +
      '<div class="card-sub">' + esc(box.catId ? catName(box.catId) + ' 的砂盆' : '两只共用') + '</div></div>' +
      '<span class="tag ' + s.state + '">' + LITTER_TAG[s.state] + '</span></div>' +
      '<div class="big' + (s.state === 'overdue' ? ' danger' : '') + '">' + big + '</div>' +
      bar +
      '<div class="meta">' + meta + '</div>' +
      '<div class="card-actions"><button class="btn primary" data-act="litter" data-box="' + box.id + '">记录换砂</button>' +
      (db.litters.some(function (r) { return r.boxId === box.id; }) ?
        '<button class="btn ghost" data-act="litter-edit" data-box="' + box.id + '">改上次</button>' : '') +
      '</div></article>';
  }

  function bagCard(bag) {
    var p = bagProgress(bag);
    var sub = [kindText(bag.kind)].concat(bag.weightG > 0 ? [weightText(bag.weightG)] : []).join(' · ');
    var nameLine = bag.name ? esc(bag.name) : '（未命名猫粮）';
    var tag = p.elapsed === 0 ? '今天开封' : '第 ' + (p.elapsed + 1) + ' 天';
    var big, meta = '', bar = '';

    if (p.dueISO) {
      var left = p.left;
      if (left > 1) {
        big = '预计 <b class="sm">' + fmtMD(p.dueISO) + '</b> 吃完';
        meta = '约还能吃 <b>' + left + '</b> 天 · 每天约 ' + Math.round(p.dailyG) + ' g';
      } else if (left === 1) {
        big = '预计 <b class="sm">明天</b> 吃完';
        meta = '按之前的吃法 · 每天约 ' + Math.round(p.dailyG) + ' g';
      } else if (left === 0) {
        big = '预计 <b class="sm">今天</b> 吃完';
        meta = '该准备下一袋了 · 每天约 ' + Math.round(p.dailyG) + ' g';
      } else {
        big = '估计已经吃完了';
        meta = '按之前的吃法，' + fmtMD(p.dueISO) + ' 就该见底了';
      }
      bar = '<div class="bar' + (left <= 0 ? ' soon' : '') + '"><i style="width:' + Math.round(p.pct * 100) + '%"></i></div>';
    } else {
      big = '已开封 <b>' + p.elapsed + '</b> 天';
      meta = '填上净含量，就能自动估出哪天吃完';
    }

    return '<article class="card" data-bag-card="' + bag.id + '">' +
      '<div class="card-top">' + catBadge(bag.catId) +
      '<div class="card-titles"><div class="card-name">' + nameLine + '</div>' +
      '<div class="card-sub">' + esc(catName(bag.catId)) + ' · ' + sub + '</div></div>' +
      '<span class="tag ok">' + tag + '</span></div>' +
      '<div class="big">' + big + '</div>' + bar +
      '<div class="meta">' + meta + '</div>' +
      '<div class="card-actions">' +
      '<button class="btn primary" data-act="finish" data-bag="' + bag.id + '">吃完了</button>' +
      '<button class="btn ghost" data-act="bag-new" data-cat="' + (bag.catId || '') + '">再开一袋</button>' +
      '</div></article>';
  }

  function emptyBagCard(cat) {
    return '<article class="card empty">' +
      '<p>' + esc(cat.name) + ' 现在没有开封的猫粮</p>' +
      '<button class="btn primary" data-act="bag-new" data-cat="' + cat.id + '">开封一袋</button></article>';
  }

  function emptyCard(title, sub, btn, act) {
    return '<article class="card empty"><p>' + esc(sub) + '</p>' +
      '<button class="btn primary" data-act="' + act + '">' + esc(btn) + '</button></article>';
  }

  /* ================= 记录页 ================= */
  function buildEvents() {
    var evs = [];
    db.litters.forEach(function (r) {
      var box = boxById(r.boxId);
      evs.push({ id: 'L' + r.id, kind: 'litter', at: r.at, rec: r, box: box, catId: box ? box.catId : null });
    });
    db.bags.forEach(function (b) {
      evs.push({ id: 'O' + b.id, kind: 'open', at: b.openedAt, bag: b, catId: b.catId });
      if (b.finishedAt) evs.push({ id: 'F' + b.id, kind: 'finish', at: b.finishedAt, bag: b, catId: b.catId });
    });
    evs.sort(function (a, b) {
      var c = String(b.at).localeCompare(String(a.at));
      if (c !== 0) return c;
      var order = { litter: 0, finish: 1, open: 2 };
      return (order[a.kind] || 0) - (order[b.kind] || 0);
    });
    return evs;
  }

  function viewRecords() {
    var h = '<div class="filters">';
    [['all', '全部'], ['food', '猫粮'], ['litter', '猫砂']].forEach(function (f) {
      h += '<button class="chip" aria-pressed="' + (UI.type === f[0]) + '" data-ftype="' + f[0] + '">' + f[1] + '</button>';
    });
    h += '</div><div class="filters second">';
    h += '<button class="chip" aria-pressed="' + (UI.cat === 'all') + '" data-fcat="all">所有猫</button>';
    db.cats.forEach(function (c) {
      h += '<button class="chip dot" style="--c:' + esc(c.color) + '" aria-pressed="' + (UI.cat === c.id) + '" data-fcat="' + c.id + '">' + esc(c.name) + '</button>';
    });
    h += '</div>';

    var evs = buildEvents().filter(function (e) {
      if (UI.type === 'food' && e.kind === 'litter') return false;
      if (UI.type === 'litter' && e.kind !== 'litter') return false;
      // 按某只猫筛选时，共用砂盆/共用粮的记录也算（两只猫都在用）
      if (UI.cat !== 'all' && e.catId !== UI.cat && e.catId !== null) return false;
      return true;
    });

    if (!evs.length) {
      h += '<div class="card empty" style="margin-top:26px"><p>' +
        (db.litters.length || db.bags.length ? '这个筛选下没有记录' : '还没有任何记录，点右上角 ＋ 记第一笔') + '</p></div>';
      return h;
    }

    var groups = [], cur = null;
    evs.forEach(function (e) {
      var m = String(e.at).slice(0, 7);
      if (!cur || cur.m !== m) { cur = { m: m, list: [] }; groups.push(cur); }
      cur.list.push(e);
    });

    groups.forEach(function (g) {
      var p = g.m.split('-');
      h += '<div class="month-label">' + p[0] + '年' + Number(p[1]) + '月</div><div class="rec-list">';
      g.list.forEach(function (e) { h += recRow(e); });
      h += '</div>';
    });
    return h;
  }

  function evIco(kind, big) {
    var ch = kind === 'litter' ? '换' : kind === 'open' ? '开' : '完';
    return '<span class="ev-ico k-' + kind + (big ? ' lg' : '') + '">' + ch + '</span>';
  }

  function recRow(e) {
    var title, sub;
    if (e.kind === 'litter') {
      title = (e.box ? e.box.name : '已删除的砂盆') + ' · 换猫砂';
      sub = e.rec.nextAt && isValidISO(e.rec.nextAt) ? '下次 ' + fmtMD(e.rec.nextAt) : '没设下次日期';
    } else if (e.kind === 'open') {
      title = '开封 ' + (e.bag.name || '猫粮');
      sub = catName(e.catId) + (e.bag.weightG > 0 ? ' · ' + weightText(e.bag.weightG) : '');
    } else {
      var d = Math.max(1, diffDays(e.bag.openedAt, e.bag.finishedAt));
      title = '吃完 ' + (e.bag.name || '猫粮');
      sub = d + ' 天吃完' + (e.bag.weightG > 0 ? ' · 每天约 ' + Math.round(e.bag.weightG / d) + ' g' : '');
    }
    return '<button class="rec" data-ev="' + e.id + '">' +
      evIco(e.kind) +
      '<span class="rec-body"><span class="rec-title">' + esc(title) + '</span>' +
      '<span class="rec-sub">' + esc(sub) + '</span></span>' +
      '<span class="rec-date">' + fmtMD(e.at) + '</span></button>';
  }

  /* ================= 设置页 ================= */
  function viewSettings() {
    var h = '';
    h += '<div class="sec-head"><h2>猫咪</h2></div><div class="list">';
    db.cats.forEach(function (c) {
      h += '<button class="row" data-act="cat-edit" data-cat="' + c.id + '">' +
        '<span class="cat-badge" style="background:' + hexA(c.color, 0.15) + ';box-shadow:inset 0 0 0 1px ' + hexA(c.color, 0.22) + '">' + c.emoji + '</span>' +
        '<span class="row-main"><span class="row-title">' + esc(c.name) + '</span>' +
        '<span class="row-sub">' + db.bags.filter(function (b) { return b.catId === c.id; }).length + ' 条猫粮记录</span></span>' +
        chevSvg() + '</button>';
    });
    h += '<button class="row add" data-act="cat-new"><span class="row-main"><span class="row-title">＋ 添加一只猫</span></span></button>';
    h += '</div>';

    h += '<div class="sec-head"><h2>猫砂盆</h2><span class="sec-note">' + db.boxes.length + ' 个</span></div><div class="list">';
    if (!db.boxes.length) h += '<div class="row"><span class="row-main"><span class="row-sub">还没有砂盆，加一个吧</span></span></div>';
    db.boxes.forEach(function (b) {
      h += '<button class="row" data-act="box-edit" data-box="' + b.id + '">' +
        evIco('litter') +
        '<span class="row-main"><span class="row-title">' + esc(b.name) + '</span>' +
        '<span class="row-sub">' + esc(b.catId ? catName(b.catId) + ' 专用' : '两只共用') + '</span></span>' +
        chevSvg() + '</button>';
    });
    h += '<button class="row add" data-act="box-new"><span class="row-main"><span class="row-title">＋ 添加砂盆</span></span></button>';
    h += '</div>';

    h += '<div class="sec-head"><h2>换砂周期</h2></div><div class="list"><div class="row" style="flex-wrap:wrap;gap:10px">' +
      '<div class="row-main" style="flex-basis:100%"><span class="row-title">默认多久换一次</span>' +
      '<span class="row-sub">只是记换砂时帮你预填，每次都能自己改</span></div>' +
      '<div class="chips" data-group="defcycle">' +
      [7, 14, 21, 30].map(function (n) {
        return '<button class="chip" data-val="' + n + '" aria-pressed="' + (Number(db.prefs.defaultCycle) === n) + '">' + n + ' 天</button>';
      }).join('') + '</div></div></div>';

    h += '<div class="sec-head"><h2>提醒</h2></div><div class="list">' +
      '<div class="row"><span class="row-main"><span class="row-title">打开 App 时提醒我</span>' +
      '<span class="row-sub">' + (db.prefs.notif ? '已开启 · 有到期的会推通知' : '开启后，打开 App 时有到期就推通知') + '</span></span>' +
      '<button class="switch" role="switch" aria-checked="' + (!!db.prefs.notif) + '" data-act="toggle-notif"><i></i></button></div>' +
      '<button class="row" data-act="ics"><span class="rec-ico" style="background:#e9eff6">📅</span>' +
      '<span class="row-main"><span class="row-title">把到期日加到手机日历</span>' +
      '<span class="row-sub">下载 .ics，用华为日历导入，关了 App 也会准点提醒</span></span>' + chevSvg() + '</button>' +
      '</div>';

    if (installEvt) {
      h += '<div class="list"><button class="row" data-act="install"><span class="rec-ico">📲</span>' +
        '<span class="row-main"><span class="row-title">加到手机桌面</span>' +
        '<span class="row-sub">像 App 一样打开</span></span>' + chevSvg() + '</button></div>';
    } else if (!isStandalone()) {
      h += '<div class="list"><button class="row" data-act="install-help"><span class="rec-ico">📲</span>' +
        '<span class="row-main"><span class="row-title">加到手机桌面</span>' +
        '<span class="row-sub">浏览器右上角菜单 → 添加到桌面</span></span>' + chevSvg() + '</button></div>';
    }

    h += '<div class="sec-head"><h2>数据</h2></div><div class="list">' +
      '<button class="row" data-act="export"><span class="rec-ico">💾</span>' +
      '<span class="row-main"><span class="row-title">导出备份</span><span class="row-sub">存成文件，换手机时用</span></span>' + chevSvg() + '</button>' +
      '<button class="row" data-act="import"><span class="rec-ico">📥</span>' +
      '<span class="row-main"><span class="row-title">导入备份</span><span class="row-sub">会用文件里的数据替换现在全部数据</span></span>' + chevSvg() + '</button>' +
      '<button class="row" data-act="clear"><span class="rec-ico" style="background:#fae8e6">🗑</span>' +
      '<span class="row-main"><span class="row-title" style="color:var(--danger)">清空所有数据</span></span>' + chevSvg() + '</button>' +
      '</div>';

    h += '<p class="footnote">所有记录只保存在这台手机里（浏览器本地存储），不会上传到任何服务器。换手机、清理浏览器数据前，记得先<b>导出备份</b>。</p>';
    h += '<div class="ver">喵记 v1.0 · 本地存储版</div>';
    return h;
  }

  function chevSvg() {
    return '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
  }

  /* ================= 弹层基础 ================= */
  var sheetRoot = null;
  function openSheet(html, mount) {
    var layer = $('#sheetLayer');
    var sheet = $('#sheet');
    sheet.innerHTML = html;
    layer.hidden = false;
    document.body.style.overflow = 'hidden';
    sheetRoot = sheet;
    if (mount) mount(sheet);
    var body = $('.sheet-body', sheet);
    if (body) body.scrollTop = 0;
  }
  function closeSheet() {
    $('#sheetLayer').hidden = true;
    $('#sheet').innerHTML = '';
    document.body.style.overflow = '';
    sheetRoot = null;
  }
  function sheetShell(title, bodyHTML, footHTML) {
    return '<div class="sheet-head"><h2>' + esc(title) + '</h2>' +
      '<button class="x" data-close="1" aria-label="关闭">✕</button></div>' +
      '<div class="sheet-body">' + bodyHTML + '</div>' +
      (footHTML === null ? '' : '<div class="sheet-foot">' + footHTML + '</div>');
  }
  function readForm(root) {
    var out = {};
    $$('[data-f]', root).forEach(function (el) {
      var k = el.getAttribute('data-f');
      if (el.type === 'checkbox') out[k] = el.checked; else out[k] = el.value;
    });
    return out;
  }
  function groupVal(root, name) {
    var el = $('[data-group="' + name + '"] [data-val][aria-pressed="true"]', root);
    return el ? el.getAttribute('data-val') : null;
  }

  /* ================= 换砂弹层 ================= */
  function boxOptions(sel) {
    return db.boxes.map(function (b) {
      return '<option value="' + b.id + '"' + (b.id === sel ? ' selected' : '') + '>' +
        esc(b.name) + (b.catId ? '（' + esc(catName(b.catId)) + '）' : '') + '</option>';
    }).join('');
  }

  function sheetLitter(rec) {
    if (!db.boxes.length) { toast('先去「我的 → 猫砂盆」加一个砂盆'); return; }
    var editing = !!rec;
    var boxId = rec ? rec.boxId : (UI.lastBoxId && boxById(UI.lastBoxId) ? UI.lastBoxId : db.boxes[0].id);
    var at = rec ? rec.at : todayISO();
    var nextAt = rec ? (rec.nextAt || '') : addDaysISO(at, Number(db.prefs.defaultCycle) || 14);
    var d0 = nextAt && isValidISO(nextAt) ? diffDays(at, nextAt) : null;

    var body =
      '<label class="field"><span class="lbl">哪一盆</span>' +
      '<select class="input" data-f="boxId">' + boxOptions(boxId) + '</select></label>' +
      '<label class="field"><span class="lbl">换砂日期</span>' +
      '<input class="input" type="date" data-f="at" value="' + at + '"></label>' +
      '<div class="field"><span class="lbl">下次该换了（留空就不提醒）</span>' +
      '<div class="chips" data-group="cycle" style="margin-bottom:8px">' +
      [7, 14, 21, 30].map(function (n) {
        return '<button class="chip" data-val="' + n + '" aria-pressed="' + (d0 === n) + '">' + n + ' 天</button>';
      }).join('') +
      '<button class="chip" data-val="none" aria-pressed="' + (d0 === null) + '">不提醒</button></div>' +
      '<input class="input" type="date" data-f="nextAt" value="' + (nextAt || '') + '">' +
      '<span class="hint" data-hint="next"></span></div>' +
      '<label class="field"><span class="lbl">备注（可选）</span>' +
      '<input class="input" data-f="note" maxlength="60" value="' + esc(rec ? rec.note || '' : '') + '" placeholder="比如：换成豆腐砂 / 洗了盆"></label>';

    var foot = (editing ? '<button class="btn ghost" data-del="1" style="flex:0 0 80px;color:var(--danger)">删除</button>' : '') +
      '<button class="btn primary" data-submit="1">保存</button>';

    openSheet(sheetShell(editing ? '改换砂记录' : '记录换砂', body, foot), function (root) {
      var atI = $('[data-f="at"]', root), nextI = $('[data-f="nextAt"]', root), hint = $('[data-hint="next"]', root);
      var chips = $$('[data-group="cycle"] [data-val]', root);
      function updHint() {
        var n = nextI.value;
        if (!isValidISO(n)) { hint.textContent = '不设下次日期也可以，那就只记这次换砂'; return; }
        var d = diffDays(atI.value || todayISO(), n);
        if (d < 0) { hint.textContent = '⚠️ 下次日期早于这次换砂日期'; return; }
        hint.textContent = '下次 ' + fmtMD(n) + ' · ' + d + ' 天后' + (d === Number(db.prefs.defaultCycle) ? '' : '');
      }
      root.addEventListener('groupchange', function (e) {
        if (!e.detail || e.detail.name !== 'cycle') return;
        if (e.detail.val === 'none') nextI.value = '';
        else nextI.value = addDaysISO(atI.value || todayISO(), Number(e.detail.val));
        updHint();
      });
      atI.addEventListener('change', function () {
        var p = $('[data-group="cycle"] [data-val][aria-pressed="true"]', root);
        if (p && p.getAttribute('data-val') !== 'none') nextI.value = addDaysISO(atI.value, Number(p.getAttribute('data-val')));
        updHint();
      });
      nextI.addEventListener('change', updHint);
      updHint();

      if (editing) {
        var del = $('[data-del]', root);
        if (del) del.addEventListener('click', function () {
          db.litters = db.litters.filter(function (x) { return x.id !== rec.id; });
          save(); closeSheet(); render(); toast('已删除这条换砂记录');
        });
      }

      $('[data-submit]', root).addEventListener('click', function () {
        var f = readForm(root);
        if (!isValidISO(f.at)) return toast('先选一个换砂日期');
        var nx = isValidISO(f.nextAt) ? f.nextAt : null;
        if (nx && diffDays(f.at, nx) < 0) return toast('下次日期不能早于换砂日期');
        if (editing) {
          rec.boxId = f.boxId; rec.at = f.at; rec.nextAt = nx; rec.note = f.note.trim();
        } else {
          db.litters.push({ id: uid(), boxId: f.boxId, at: f.at, nextAt: nx, note: f.note.trim() });
        }
        UI.lastBoxId = f.boxId;
        save(); closeSheet(); render();
        toast(nx ? '已记录 · 下次 ' + fmtMD(nx) + '（' + diffDays(f.at, nx) + ' 天后）' : '已记录这次换砂');
        checkDue(false);
      });
    });
  }

  function nearestLitterRec(boxId) {
    var rs = db.litters.filter(function (r) { return r.boxId === boxId; })
      .sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
    return rs[0] || null;
  }

  /* ================= 猫粮弹层 ================= */
  function lastBagOf(catId) {
    var arr = db.bags.filter(function (b) { return (b.catId || null) === (catId || null); })
      .sort(function (a, b) { return String(b.openedAt).localeCompare(String(a.openedAt)); });
    return arr[0] || null;
  }

  function catOptions(sel) {
    return '<option value="">两只共用</option>' + db.cats.map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === sel ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');
  }

  function nameList() {
    var names = [];
    db.bags.forEach(function (b) { if (b.name && names.indexOf(b.name) < 0) names.push(b.name); });
    return '<datalist id="bagNames">' + names.slice(0, 20).map(function (n) {
      return '<option value="' + esc(n) + '"></option>';
    }).join('') + '</datalist>';
  }

  function sheetBag(bag, presetCatId) {
    var editing = !!bag;
    var catId = bag ? (bag.catId || '') : (presetCatId != null ? presetCatId : (UI.lastCatId || (db.cats[0] && db.cats[0].id) || ''));
    var kind = bag ? (bag.kind || 'dry') : 'dry';
    var last = lastBagOf(catId || null);
    var wG = bag ? Number(bag.weightG) || 0 : (last && last.weightG ? Number(last.weightG) : 0);
    var unit = wG > 0 && wG < 1000 ? 'g' : 'kg';
    var wVal = wG > 0 ? (unit === 'g' ? wG : wG / 1000) : '';

    var body =
      (db.cats.length ? '<label class="field"><span class="lbl">哪只猫的</span>' +
        '<select class="input" data-f="catId">' + catOptions(catId) + '</select></label>' : '') +
      '<label class="field"><span class="lbl">是什么粮</span>' +
      '<div class="chips" data-group="kind" style="margin-bottom:8px">' +
      '<button class="chip" data-val="dry" aria-pressed="' + (kind === 'dry') + '">干粮</button>' +
      '<button class="chip" data-val="wet" aria-pressed="' + (kind === 'wet') + '">罐头 / 湿粮</button>' +
      '<button class="chip" data-val="snack" aria-pressed="' + (kind === 'snack') + '">零食</button></div>' +
      '<input class="input" data-f="name" list="bagNames" maxlength="40" value="' + esc(bag ? bag.name || '' : '') + '" placeholder="品牌或口味，例如：渴望 鸡肉">' +
      nameList() + '</label>' +
      '<div class="field"><span class="lbl">净含量（可不填，填了能估算吃完日期）</span>' +
      '<div class="input-row"><input class="input" type="number" inputmode="decimal" min="0" step="any" data-f="weight" value="' + (wVal === '' ? '' : wVal) + '" placeholder="' + (unit === 'g' ? '85' : '1.5') + '">' +
      '<div class="seg" data-group="unit" style="flex:0 0 116px"><button data-val="g" aria-pressed="' + (unit === 'g') + '">g</button><button data-val="kg" aria-pressed="' + (unit === 'kg') + '">kg</button></div></div></div>' +
      '<label class="field"><span class="lbl">开封日期</span>' +
      '<input class="input" type="date" data-f="openedAt" value="' + (bag ? bag.openedAt : todayISO()) + '"></label>' +
      (editing ? '<label class="field"><span class="lbl">吃完日期（留空＝还在吃）</span>' +
        '<input class="input" type="date" data-f="finishedAt" value="' + (bag.finishedAt || '') + '"></label>' : '') +
      '<label class="field"><span class="lbl">备注（可选）</span>' +
      '<input class="input" data-f="note" maxlength="60" value="' + esc(bag ? bag.note || '' : '') + '" placeholder="比如：活动价买的 / 换了新口味"></label>';

    var foot = (editing ? '<button class="btn ghost" data-del="1" style="flex:0 0 80px;color:var(--danger)">删除</button>' : '') +
      '<button class="btn primary" data-submit="1">' + (editing ? '保存' : '开封了') + '</button>';

    openSheet(sheetShell(editing ? '改猫粮记录' : '开封一袋猫粮', body, foot), function (root) {
      var wI = $('[data-f="weight"]', root);
      root.addEventListener('groupchange', function (e) {
        if (!e.detail) return;
        if (e.detail.name === 'kind' && !wI.value) {
          wI.placeholder = e.detail.val === 'wet' ? '85' : e.detail.val === 'snack' ? '30' : '1.5';
          var u = $('[data-group="unit"] [data-val="' + (e.detail.val === 'wet' || e.detail.val === 'snack' ? 'g' : 'kg') + '"]', root);
          if (u) { $$('[data-group="unit"] [data-val]', root).forEach(function (x) { x.setAttribute('aria-pressed', 'false'); }); u.setAttribute('aria-pressed', 'true'); }
        }
        if (e.detail.name === 'catId') { /* select 走 change */ }
      });

      if (editing) {
        var del = $('[data-del]', root);
        del.addEventListener('click', function () {
          db.bags = db.bags.filter(function (x) { return x.id !== bag.id; });
          save(); closeSheet(); render(); toast('已删除这袋粮的记录');
        });
      }

      $('[data-submit]', root).addEventListener('click', function () {
        var f = readForm(root);
        var unit = groupVal(root, 'unit') || 'kg';
        var wNum = parseFloat(f.weight);
        var grams = isFinite(wNum) && wNum > 0 ? Math.round(unit === 'kg' ? wNum * 1000 : wNum) : 0;
        if (!isValidISO(f.openedAt)) return toast('先选开封日期');
        if (editing && f.finishedAt && !isValidISO(f.finishedAt)) return toast('吃完日期格式不对');
        if (editing && f.finishedAt && diffDays(f.openedAt, f.finishedAt) < 0) return toast('吃完日期不能早于开封日期');
        var data = {
          catId: f.catId || null,
          kind: groupVal(root, 'kind') || 'dry',
          name: (f.name || '').trim(),
          weightG: grams,
          openedAt: f.openedAt,
          note: (f.note || '').trim()
        };
        if (editing) {
          bag.catId = data.catId; bag.kind = data.kind; bag.name = data.name;
          bag.weightG = data.weightG; bag.openedAt = data.openedAt; bag.note = data.note;
          bag.finishedAt = f.finishedAt || null;
        } else {
          data.id = uid();
          data.finishedAt = null;
          db.bags.push(data);
        }
        UI.lastCatId = data.catId;
        save(); closeSheet(); render();
        if (editing && bag.finishedAt) {
          var d = Math.max(1, diffDays(bag.openedAt, bag.finishedAt));
          toast('这袋吃了 ' + d + ' 天' + (bag.weightG > 0 ? ' · 每天约 ' + Math.round(bag.weightG / d) + ' g' : ''));
        } else {
          toast(editing ? '已保存' : '🍚 已记录开封' + (grams ? ' · ' + weightText(grams) : ''));
        }
      });
    });
  }

  function sheetFinish(bag) {
    var body = '<div class="calc" data-calc>吃完这袋用了 <b>—</b> 天</div>' +
      '<label class="field"><span class="lbl">哪天吃完了</span>' +
      '<input class="input" type="date" data-f="finishedAt" value="' + todayISO() + '"></label>' +
      '<p class="footnote" style="margin-top:0">记下吃完日期，之后就能算出这只猫平均几天吃完一袋、每天吃多少。</p>';
    openSheet(sheetShell('猫粮吃完了？', body, '<button class="btn ghost" data-close="1" style="flex:0 0 90px">取消</button><button class="btn primary" data-submit="1">确认吃完</button>'),
      function (root) {
        var i = $('[data-f="finishedAt"]', root), calc = $('[data-calc]', root);
        function upd() {
          if (!isValidISO(i.value)) { calc.innerHTML = '先选个日期'; return; }
          var d = diffDays(bag.openedAt, i.value);
          if (d < 0) { calc.className = 'calc danger'; calc.innerHTML = '⚠️ 早于开封日期（' + fmtMD(bag.openedAt) + '）'; return; }
          calc.className = 'calc';
          calc.innerHTML = '这袋吃了 <b>' + d + '</b> 天' + (bag.weightG > 0 && d > 0 ? ' · 每天约 ' + Math.round(bag.weightG / Math.max(1, d)) + ' g' : '');
        }
        i.addEventListener('change', upd); upd();
        $('[data-submit]', root).addEventListener('click', function () {
          if (!isValidISO(i.value)) return toast('先选吃完日期');
          if (diffDays(bag.openedAt, i.value) < 0) return toast('吃完日期不能早于开封日期');
          bag.finishedAt = i.value;
          save(); closeSheet(); render();
          var d = Math.max(1, diffDays(bag.openedAt, bag.finishedAt));
          toast('✅ 记下了 · ' + d + ' 天吃完' + (bag.weightG > 0 ? '，每天约 ' + Math.round(bag.weightG / d) + ' g' : ''));
        });
      });
  }

  /* ================= 猫 / 砂盆 / 快捷添加 ================= */
  var EMOJIS = ['🐱', '🐈', '🐈‍⬛', '😺', '😸', '🐾', '🐯', '🦁', '🐰', '🐼', '🐶', '🐹'];
  var COLORS = ['#E1772F', '#6E8FB8', '#8C7BB5', '#4F9D69', '#C9705E', '#B58A5A', '#5FA5A0', '#C77BA0'];

  function sheetCat(cat) {
    var editing = !!cat;
    var c = cat || { name: '', emoji: EMOJIS[db.cats.length % EMOJIS.length], color: COLORS[db.cats.length % COLORS.length] };
    var body =
      '<label class="field"><span class="lbl">名字</span>' +
      '<input class="input" data-f="name" maxlength="12" value="' + esc(c.name) + '" placeholder="比如：大橘"></label>' +
      '<div class="field"><span class="lbl">头像</span><div class="emoji-grid" data-group="emoji">' +
      EMOJIS.map(function (e) {
        return '<button data-val="' + e + '" aria-pressed="' + (e === c.emoji) + '">' + e + '</button>';
      }).join('') + '</div></div>' +
      '<div class="field"><span class="lbl">颜色</span><div class="color-grid" data-group="color">' +
      COLORS.map(function (x) {
        return '<button data-val="' + x + '" style="--c:' + x + '" aria-pressed="' + (x === c.color) + '"></button>';
      }).join('') + '</div></div>';

    var foot = (editing && db.cats.length > 1 ? '<button class="btn ghost" data-del="1" style="flex:0 0 80px;color:var(--danger)">删除</button>' : '') +
      '<button class="btn primary" data-submit="1">保存</button>';

    openSheet(sheetShell(editing ? '编辑猫咪' : '添加猫咪', body, foot), function (root) {
      if (editing) {
        var del = $('[data-del]', root);
        if (del) del.addEventListener('click', function () {
          if (db.cats.length <= 1) return toast('至少留一只猫');
          db.cats = db.cats.filter(function (x) { return x.id !== cat.id; });
          db.bags.forEach(function (b) { if (b.catId === cat.id) b.catId = null; });
          db.boxes.forEach(function (b) { if (b.catId === cat.id) b.catId = null; });
          save(); closeSheet(); render(); toast('已删除「' + cat.name + '」，它的记录保留为「共用」');
        });
      }
      $('[data-submit]', root).addEventListener('click', function () {
        var f = readForm(root);
        var name = (f.name || '').trim();
        if (!name) return toast('给猫咪起个名字吧');
        var emoji = groupVal(root, 'emoji') || '🐱';
        var color = groupVal(root, 'color') || COLORS[0];
        if (editing) { cat.name = name; cat.emoji = emoji; cat.color = color; }
        else db.cats.push({ id: uid(), name: name, emoji: emoji, color: color });
        save(); closeSheet(); render(); toast('已保存');
      });
    });
  }

  function sheetBox(box) {
    var editing = !!box;
    var b = box || { name: '', catId: null };
    var body =
      '<label class="field"><span class="lbl">砂盆名字</span>' +
      '<input class="input" data-f="name" maxlength="16" value="' + esc(b.name) + '" placeholder="比如：客厅盆 / 阳台盆"></label>' +
      '<label class="field"><span class="lbl">谁在用</span>' +
      '<select class="input" data-f="catId">' + catOptions(b.catId || '') + '</select>' +
      '<span class="hint">如果两只猫共用一个盆，就选「两只共用」</span></label>';

    var foot = (editing ? '<button class="btn ghost" data-del="1" style="flex:0 0 80px;color:var(--danger)">删除</button>' : '') +
      '<button class="btn primary" data-submit="1">保存</button>';

    openSheet(sheetShell(editing ? '编辑砂盆' : '添加砂盆', body, foot), function (root) {
      if (editing) {
        $('[data-del]', root).addEventListener('click', function () {
          db.boxes = db.boxes.filter(function (x) { return x.id !== box.id; });
          db.litters = db.litters.filter(function (x) { return x.boxId !== box.id; });
          save(); closeSheet(); render(); toast('已删除砂盆和它的换砂记录');
        });
      }
      $('[data-submit]', root).addEventListener('click', function () {
        var f = readForm(root);
        var name = (f.name || '').trim();
        if (!name) return toast('给砂盆起个名字吧');
        if (editing) { box.name = name; box.catId = f.catId || null; }
        else db.boxes.push({ id: uid(), name: name, catId: f.catId || null });
        save(); closeSheet(); render(); toast('已保存');
      });
    });
  }

  function sheetQuick() {
    var body = '<div class="opt-list">' +
      '<button class="opt" data-act="quick-litter">' + evIco('litter', true) +
      '<span class="row-main"><span class="opt-title">换猫砂了</span><span class="opt-sub">记下这次换砂和下次到期</span></span></button>' +
      '<button class="opt" data-act="quick-open">' + evIco('open', true) +
      '<span class="row-main"><span class="opt-title">开封一袋新粮</span><span class="opt-sub">开始算这袋能吃多久</span></span></button>' +
      '<button class="opt" data-act="quick-finish">' + evIco('finish', true) +
      '<span class="row-main"><span class="opt-title">猫粮吃完了</span><span class="opt-sub">记下吃完日期</span></span></button>' +
      '</div>';
    openSheet(sheetShell('记一笔', body, null));
  }

  function sheetFinishPick() {
    var opens = db.bags.filter(function (b) { return !b.finishedAt; })
      .sort(function (a, b) { return String(b.openedAt).localeCompare(String(a.openedAt)); });
    if (!opens.length) { toast('现在没有正在吃的猫粮，先开封一袋吧'); return; }
    var body = '<div class="opt-list">' + opens.map(function (b) {
      return '<button class="opt" data-pickbag="' + b.id + '"><span class="opt-ico">🍚</span>' +
        '<span class="row-main"><span class="opt-title">' + esc(b.name || '（未命名猫粮）') + '</span>' +
        '<span class="opt-sub">' + esc(catName(b.catId)) + ' · ' + fmtMD(b.openedAt) + ' 开封</span></span></button>';
    }).join('') + '</div>';
    openSheet(sheetShell('哪一袋吃完了', body, null));
  }

  /* ================= 通知 ================= */
  function dueList() {
    var t = todayISO(), out = [];
    db.boxes.forEach(function (box) {
      var s = boxStatus(box);
      if (s.state === 'overdue') out.push({ key: 'box-' + box.id, title: box.name + ' 该换猫砂了', body: '已经超期 ' + (-s.left) + ' 天' });
      else if (s.state === 'due') out.push({ key: 'box-' + box.id, title: box.name + ' 今天该换猫砂了', body: '换完记得在喵记里记一笔' });
    });
    db.bags.forEach(function (bag) {
      if (bag.finishedAt) return;
      var p = bagProgress(bag);
      if (p.dueISO && diffDays(t, p.dueISO) <= 0) {
        out.push({ key: 'bag-' + bag.id, title: (bag.name || '猫粮') + ' 预计吃完了', body: '记得开新的一袋' });
      }
    });
    return out;
  }

  function checkDue(force) {
    if (!db || !db.prefs.notif) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    var t = todayISO();
    dueList().forEach(function (d) {
      if (!force && db.prefs.notified[d.key] === t) return;
      db.prefs.notified[d.key] = t;
      try {
        if (navigator.serviceWorker && navigator.serviceWorker.ready) {
          navigator.serviceWorker.ready.then(function (reg) {
            reg.showNotification(d.title, { body: d.body, icon: 'assets/icons/icon-192.png', badge: 'assets/icons/icon-192.png', tag: d.key, lang: 'zh-CN' });
          }).catch(function () { new Notification(d.title, { body: d.body, tag: d.key }); });
        } else {
          new Notification(d.title, { body: d.body, tag: d.key });
        }
      } catch (e) { /* 忽略 */ }
    });
    save();
  }

  function toggleNotif() {
    if (db.prefs.notif) {
      db.prefs.notif = false; save(); render(); toast('已关闭提醒');
      return;
    }
    if (typeof Notification === 'undefined') { toast('这个浏览器不支持通知，用首页红条看提醒就好'); return; }
    Notification.requestPermission().then(function (p) {
      if (p === 'granted') {
        db.prefs.notif = true; save(); render();
        toast('已开启 · 到期时会通知你');
        checkDue(true);
      } else {
        toast('没拿到通知权限，可以在浏览器设置里允许通知');
      }
    });
  }

  /* ================= 数据备份 ================= */
  function exportData() {
    var payload = JSON.stringify({ app: 'miaojil', v: 1, exportedAt: new Date().toISOString(), data: db }, null, 2);
    var blob = new Blob([payload], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '喵记备份-' + todayISO() + '.json';
    document.body.appendChild(a);
    a.click();
    var rem = a; a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    toast('备份文件已生成，存到网盘或发给自己');
  }

  function importData() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = function () {
      var f = input.files && input.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var j = JSON.parse(String(fr.result));
          var d = j && j.data ? j.data : j;
          if (!d || !Array.isArray(d.cats)) throw new Error('bad');
          d.boxes = d.boxes || []; d.bags = d.bags || []; d.litters = d.litters || [];
          d.prefs = d.prefs || { defaultCycle: 14, notified: {} };
          db = d; save(); render();
          toast('导入成功 · ' + db.bags.length + ' 条粮记录 / ' + db.litters.length + ' 条换砂记录');
        } catch (e) { toast('这个文件读不出来，可能不是喵记的备份'); }
      };
      fr.readAsText(f);
    };
    input.click();
  }

  function clearAll() {
    openSheet(sheetShell('清空所有数据？',
      '<p class="footnote" style="margin:4px 0 18px">所有猫咪、猫粮和换砂记录都会被删掉，无法恢复。<br><b>建议先导出备份。</b></p>',
      '<button class="btn ghost" data-close="1">再想想</button><button class="btn primary" data-submit="1" style="background:var(--danger)">确定清空</button>'),
      function (root) {
        $('[data-submit]', root).addEventListener('click', function () {
          try { localStorage.removeItem(KEY); } catch (e) { }
          db = null; closeSheet();
          document.body.innerHTML = '';
          location.reload();
        });
      });
  }

  /* ================= 日历提醒（.ics） ================= */
  function isStandalone() {
    try {
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
      if (window.navigator.standalone) return true;
      if (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) return true;
    } catch (e) { }
    return false;
  }

  function icsEsc(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }
  function icsStamp() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + 'T' +
      p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z';
  }
  /* 浮动时间（不带 Z / TZID）：由手机按本地时区解释 */
  function icsLocal(iso, hhmm) { return iso.replace(/-/g, '') + 'T' + String(hhmm).replace(':', '') + '00'; }

  function calendarEvents() {
    var out = [], t = todayISO();
    function later(iso) { return diffDays(t, iso) < 0 ? t : iso; }  // 已超期的提醒挪到今天
    db.boxes.forEach(function (box) {
      var s = boxStatus(box);
      if (!s.last || !s.last.nextAt || !isValidISO(s.last.nextAt)) return;
      if (diffDays(t, s.last.nextAt) < -90) return;
      out.push({
        uid: 'litter-' + box.id + '-' + later(s.last.nextAt),
        date: later(s.last.nextAt),
        summary: '换猫砂 · ' + box.name,
        desc: '上次 ' + fmtMD(s.last.at) + ' 换的，每 ' + s.total + ' 天换一次。',
        alarm: '该给' + box.name + '换猫砂了'
      });
    });
    db.bags.forEach(function (bag) {
      if (bag.finishedAt) return;
      var p = bagProgress(bag);
      if (!p.dueISO) return;
      if (diffDays(t, p.dueISO) < -90) return;
      out.push({
        uid: 'bag-' + bag.id + '-' + later(p.dueISO),
        date: later(p.dueISO),
        summary: '预计吃完 · ' + (bag.name || '猫粮'),
        desc: (bag.weightG > 0 ? weightText(bag.weightG) + '，' : '') +
          fmtMD(bag.openedAt) + ' 开封，按以往速度预计这天吃完。',
        alarm: (bag.name || '猫粮') + '差不多吃完了，记得开新的一袋'
      });
    });
    out.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    return out;
  }

  function icsFold(line) {
    var enc = null;
    try { enc = new TextEncoder(); } catch (e) { enc = null; }
    function w(ch) {
      if (enc) return enc.encode(ch).length;
      var c = ch.charCodeAt(0);
      return c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
    }
    var i, total = 0;
    for (i = 0; i < line.length; i++) total += w(line.charAt(i));
    if (total <= 75) return line;
    var out = [], cur = '', bytes = 0, limit = 75;
    for (i = 0; i < line.length; i++) {
      var ch = line.charAt(i), c = line.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < line.length) ch += line.charAt(++i); // 代理对整体处理
      var bw = w(ch);
      if (bytes + bw > limit) { out.push(cur); cur = ' '; bytes = 1; }
      cur += ch; bytes += bw;
    }
    out.push(cur);
    return out.join('\r\n');
  }

  function buildICS() {
    var L = [];
    L.push('BEGIN:VCALENDAR');
    L.push('VERSION:2.0');
    L.push('PRODID:-//MiaoJi//Cat Care//CN');
    L.push('CALSCALE:GREGORIAN');
    L.push('METHOD:PUBLISH');
    L.push('X-WR-CALNAME:喵记 · 猫咪提醒');
    L.push('X-WR-TIMEZONE:Asia/Shanghai');
    calendarEvents().forEach(function (e) {
      L.push('BEGIN:VEVENT');
      L.push('UID:' + e.uid + '@miaojil');
      L.push('DTSTAMP:' + icsStamp());
      L.push('DTSTART:' + icsLocal(e.date, '09:00'));
      L.push('DTEND:' + icsLocal(e.date, '09:15'));
      L.push('SUMMARY:' + icsEsc(e.summary));
      L.push('DESCRIPTION:' + icsEsc(e.desc + ' 来自喵记。'));
      L.push('BEGIN:VALARM');
      L.push('ACTION:DISPLAY');
      L.push('TRIGGER:-PT0M');
      L.push('DESCRIPTION:' + icsEsc(e.alarm));
      L.push('END:VALARM');
      L.push('END:VEVENT');
    });
    L.push('END:VCALENDAR');
    return L.map(icsFold).join('\r\n') + '\r\n';
  }

  function exportICS() {
    var evs = calendarEvents();
    if (!evs.length) { toast('现在没有可导出的日期，先记一次换砂或开一袋粮'); return; }
    var blob = new Blob([buildICS()], { type: 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '喵记提醒-' + todayISO() + '.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    toast('已导出 ' + evs.length + ' 个提醒，用华为日历打开这个 .ics 就能导入');
  }

  /* ================= toast ================= */
  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    requestAnimationFrame(function () { el.classList.add('show'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.hidden = true; }, 260);
    }, 2400);
  }

  /* ================= 事件 ================= */
  function goTab(tab) {
    if (UI.tab === tab) {
      var v = $('#view'); if (v) v.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    UI.scroll[UI.tab] = $('#view').scrollTop;
    UI.tab = tab;
    render();
  }

  document.addEventListener('click', function (e) {
    var t = e.target;

    // 单选 chip / 分段控件：全局委托，主页面和弹层都适用
    var chipBtn = t.closest('[data-group] [data-val]');
    if (chipBtn) {
      var grp = chipBtn.closest('[data-group]');
      $$('[data-val]', grp).forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
      chipBtn.setAttribute('aria-pressed', 'true');
      try {
        grp.dispatchEvent(new CustomEvent('groupchange', {
          bubbles: true, detail: { name: grp.getAttribute('data-group'), val: chipBtn.getAttribute('data-val') }
        }));
      } catch (err) { }
      return;
    }

    var tabBtn = t.closest('[data-tab]');
    if (tabBtn) { goTab(tabBtn.getAttribute('data-tab')); return; }

    var closeBtn = t.closest('[data-close]');
    if (closeBtn) { closeSheet(); return; }

    if (t.closest('[data-ftype]')) { UI.type = t.closest('[data-ftype]').getAttribute('data-ftype'); render(); return; }
    if (t.closest('[data-fcat]')) { UI.cat = t.closest('[data-fcat]').getAttribute('data-fcat'); render(); return; }

    var evBtn = t.closest('[data-ev]');
    if (evBtn) {
      var key = evBtn.getAttribute('data-ev');
      var kind = key[0], id = key.slice(1);
      if (kind === 'L') { var r = db.litters.filter(function (x) { return x.id === id; })[0]; if (r) sheetLitter(r); }
      else { var b = bagById(id); if (b) sheetBag(b); }
      return;
    }

    var pick = t.closest('[data-pickbag]');
    if (pick) { var pb = bagById(pick.getAttribute('data-pickbag')); closeSheet(); if (pb) sheetFinish(pb); return; }

    var act = t.closest('[data-act]');
    if (!act) return;
    var a = act.getAttribute('data-act');

    if (a === 'quick') { sheetQuick(); return; }
    if (a === 'quick-litter') { closeSheet(); setTimeout(function () { sheetLitter(null); }, 60); return; }
    if (a === 'quick-open') { closeSheet(); setTimeout(function () { sheetBag(null, null); }, 60); return; }
    if (a === 'quick-finish') { closeSheet(); setTimeout(sheetFinishPick, 60); return; }
    if (a === 'litter') { sheetLitter(null); return; }
    if (a === 'litter-edit') { sheetLitter(nearestLitterRec(act.getAttribute('data-box'))); return; }
    if (a === 'bag-new') { sheetBag(null, act.getAttribute('data-cat') || null); return; }
    if (a === 'finish') { var fb = bagById(act.getAttribute('data-bag')); if (fb) sheetFinish(fb); return; }
    if (a === 'box-new') { if (!db.boxes.length || true) sheetBox(null); return; }
    if (a === 'box-edit') { var bx = boxById(act.getAttribute('data-box')); if (bx) sheetBox(bx); return; }
    if (a === 'cat-new') { sheetCat(null); return; }
    if (a === 'cat-edit') { var c = catById(act.getAttribute('data-cat')); if (c) sheetCat(c); return; }
    if (a === 'toggle-notif') { toggleNotif(); return; }
    if (a === 'export') { exportData(); return; }
    if (a === 'ics') { exportICS(); return; }
    if (a === 'install-help') { toast('点浏览器右上角菜单 →「添加到桌面」，就能从桌面直接打开'); return; }
    if (a === 'import') { importData(); return; }
    if (a === 'clear') { clearAll(); return; }
    if (a === 'install') {
      if (!installEvt) return toast('在浏览器菜单里选「添加到主屏幕」也可以');
      installEvt.prompt();
      installEvt.userChoice && installEvt.userChoice.then(function () { installEvt = null; render(); });
      return;
    }
  });

  // 设置页的默认周期 chips
  document.addEventListener('groupchange', function (e) {
    if (e.detail && e.detail.name === 'defcycle') {
      db.prefs.defaultCycle = Number(e.detail.val) || 14;
      save(); toast('默认换砂周期改成 ' + db.prefs.defaultCycle + ' 天');
    }
  });

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && sheetRoot) closeSheet(); });

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); installEvt = e;
    if (UI.tab === 'settings') render();
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && db) {
      var t = todayISO();
      if (t !== UI.day) { UI.day = t; render(); }
      checkDue(true);
    }
  });

  setInterval(function () {
    if (!db) return;
    var t = todayISO();
    if (t !== UI.day) { UI.day = t; render(); }
  }, 60000);

  /* ================= 首次引导 ================= */
  function showOnboard() {
    var el = document.createElement('div');
    el.className = 'onboard';
    el.innerHTML = '<div class="ob-inner">' +
      '<div class="ob-logo"><svg viewBox="0 0 24 24" fill="#fff"><ellipse cx="12" cy="15.6" rx="5.4" ry="4.3"/><ellipse cx="4.9" cy="9.4" rx="2.5" ry="3"/><ellipse cx="9.9" cy="6.2" rx="2.5" ry="3"/><ellipse cx="14.1" cy="6.2" rx="2.5" ry="3"/><ellipse cx="19.1" cy="9.4" rx="2.5" ry="3"/></svg></div>' +
      '<h1>欢迎用喵记</h1>' +
      '<p class="ob-sub">专门记猫粮什么时候开、什么时候吃完，猫砂什么时候换、下次什么时候换。<br>先告诉我两只小猫的名字，之后随时能改。</p>' +
      '<label class="field"><span class="lbl">第一只猫</span><input class="input" data-ob="0" maxlength="12" placeholder="比如：大橘"></label>' +
      '<label class="field"><span class="lbl">第二只猫</span><input class="input" data-ob="1" maxlength="12" placeholder="比如：汤圆"></label>' +
      '<div class="field"><span class="lbl">猫砂盆</span><div class="chips" data-group="obbox">' +
      '<button class="chip" data-val="shared" aria-pressed="true">两只共用一个</button>' +
      '<button class="chip" data-val="each" aria-pressed="false">各用一个</button></div></div>' +
      '<button class="btn primary big block" data-ob-start="1">开始记录</button>' +
      '<p class="footnote" style="text-align:center">数据只存在这台手机里，不上传任何服务器</p>' +
      '</div>';
    document.body.appendChild(el);

    $('[data-ob-start]', el).addEventListener('click', function () {
      var inputs = $$('[data-ob]', el);
      var n1 = (inputs[0].value || '').trim() || '大橘';
      var n2 = (inputs[1].value || '').trim() || '汤圆';
      if (n1 === n2) n2 = n2 + '二号';
      var mode = groupVal(el, 'obbox') || 'shared';
      db = {
        v: 1,
        cats: [
          { id: uid(), name: n1, emoji: '🐱', color: COLORS[0] },
          { id: uid(), name: n2, emoji: '🐈', color: COLORS[1] }
        ],
        boxes: [],
        litters: [],
        bags: [],
        prefs: { defaultCycle: 14, notif: false, notified: {} }
      };
      if (mode === 'each') {
        db.boxes.push({ id: uid(), name: n1 + ' 的砂盆', catId: db.cats[0].id });
        db.boxes.push({ id: uid(), name: n2 + ' 的砂盆', catId: db.cats[1].id });
      } else {
        db.boxes.push({ id: uid(), name: '猫砂盆', catId: null });
      }
      save();
      el.remove();
      render();
      setTimeout(function () { toast('可以了，点右上角 ＋ 记第一笔'); }, 400);
    });
  }

  /* ================= 启动 ================= */
  function boot() {
    db = load();
    if (!db) {
      showOnboard();
      return;
    }
    UI.lastCatId = db.cats[0] && db.cats[0].id;
    render();
    setTimeout(function () { checkDue(false); }, 1200);

    // 长按图标出现的小快捷方式（?action=litter / ?action=openbag）
    var action = null;
    try { action = new URLSearchParams(location.search).get('action'); } catch (e) { action = null; }
    if (action) {
      try { history.replaceState(null, '', location.pathname); } catch (e) { }
      setTimeout(function () {
        if (action === 'litter') sheetLitter(null);
        else if (action === 'openbag') sheetBag(null, null);
      }, 260);
    }
  }

  if ('serviceWorker' in navigator &&
    (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { });
    });
  }

  boot();
})();
