// FinFry — интерфейс
import * as DB from './db.js';
import { calc, insights, deadlines, YEARS, C, INC_TYPES, PAY_TYPES, EXP_GROUPS, CAT_LABEL } from './tax.js';
import { FRY_SVG, MODELS, DEFAULT_MODEL, offlineAnswer, systemPrompt, chatTurn, readReceipt } from './assistant.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = n => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.round(n) || 0);
const eur2 = n => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n || 0);
const dmy = d => String(d || '').split('-').reverse().join('.');
const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const S = { profile: null, entries: [], docs: [], chat: [], year: YEARS[0], filter: 'all', settings: {}, apiHistory: [], busy: false, route: '' };

function loadSettings() { try { return JSON.parse(localStorage.getItem('finfry.settings')) || {}; } catch { return {}; } }
function saveSettings() { try { localStorage.setItem('finfry.settings', JSON.stringify(S.settings)); } catch { /* приватный режим */ } }
const R = () => calc(S.profile, S.entries, S.year);

let motion = null;
import('https://cdn.jsdelivr.net/npm/motion@11.11.13/+esm').then(m => { motion = m; }).catch(() => {});

function toast(text) {
  const t = $('#toast'); t.textContent = text; t.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
}
function md(text) {
  const lines = esc(text).split('\n'); let html = '', list = false;
  for (const raw of lines) {
    const line = raw.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
    const li = line.match(/^\s*[-•]\s+(.*)/);
    if (li) { if (!list) { html += '<ul>'; list = true; } html += '<li>' + li[1] + '</li>'; continue; }
    if (list) { html += '</ul>'; list = false; }
    html += line.trim() ? '<p>' + line.replace(/^#+\s*/, '') + '</p>' : '';
  }
  return html + (list ? '</ul>' : '');
}

// ───────── Экраны ─────────
function qrow(e, kind) {
  const type = e ? e.type : defaultType(kind);
  return `<div class="qrow${e ? '' : ' ghost'}" data-kind="${kind}" data-id="${e ? e.id : ''}">
    <select name="type" aria-label="Что это">${typeOptions(kind, type)}</select>
    <input name="desc" value="${esc(e ? e.desc : '')}" placeholder="Заметка (необязательно)" aria-label="Заметка">
    <input name="amount" type="number" step="0.01" min="0" inputmode="decimal" value="${e && Number(e.amount) ? e.amount : ''}" placeholder="0 €" aria-label="Сумма в евро">
    <label class="qbtn clip${e && e.docId ? ' on' : ''}" title="Прикрепить чек (необязательно)">📎<input type="file" name="qfile" accept="image/*,application/pdf" hidden></label>
    <button class="qbtn del" data-act="qdel" title="Удалить строку" aria-label="Удалить строку">×</button>
  </div>`;
}
const yearEntries = kind => S.entries.filter(e => e.kind === kind && String(e.date).slice(0, 4) === String(S.year) && !String(e.id).startsWith('paid-'));
const quickDate = () => String(S.year) === todayISO().slice(0, 4) ? todayISO() : S.year + '-12-31';
const paidId = () => 'paid-' + S.year;

function viewHome() {
  const p = S.profile, paid = S.entries.find(e => e.id === paidId());
  const who = [STATUS[p.status] || STATUS.angestellt, p.joint ? 'в браке' : 'без супруга', Number(p.kids) ? 'детей: ' + p.kids : 'без детей'].join(' · ');
  return `
  <header class="top"><div><p class="eyebrow">Налоговый год ${S.year}</p><h1>Впишите свои цифры</h1>
    <p class="muted">Суммы за год в евро. Расчёт обновляется сразу, чеки загружать не обязательно.</p></div></header>
  <div class="quick">
    <div class="stack">
      <section class="card"><h3>1. Доходы</h3>
        <div class="qrows">${yearEntries('inc').map(e => qrow(e, 'inc')).join('')}${qrow(null, 'inc')}</div>
        <p class="fine">Зарплату вписывайте брутто за год. Несколько источников — несколько строк.</p></section>
      <section class="card"><h3>2. Расходы</h3>
        <div class="qrows">${yearEntries('exp').map(e => qrow(e, 'exp')).join('')}${qrow(null, 'exp')}</div>
        <p class="fine">Выберите, на что потратили, и впишите сумму. Есть чек — нажмите 📎, но это по желанию.</p></section>
      <section class="card"><h3>3. Налог, который уже уплачен</h3>
        <label>Удержано с зарплаты и внесено авансами за год, €
          <input id="paidInput" type="number" step="0.01" min="0" inputmode="decimal" value="${paid && Number(paid.amount) ? paid.amount : ''}" placeholder="0 €"></label>
        <p class="fine">Для зарплаты — строки 4–6 в Lohnsteuerbescheinigung. Не знаете — оставьте пустым.</p></section>
      <p class="fine">Расчёт для: ${esc(who)}. <a href="#/profile">Изменить</a></p>
    </div>
    <aside id="result" class="result card" aria-live="polite">${resultHTML()}</aside>
  </div>`;
}
function resultHTML() {
  const r = R(), refund = r.balance < -1, due = r.balance > 1;
  if (!r.incTotal) return `<div class="fry">${FRY_SVG}</div><h2>Итог появится здесь</h2><p class="muted">Впишите хотя бы один доход слева — и я сразу посчитаю налог.</p>`;
  const tips = insights(S.profile, S.entries, S.year, r, eur).slice(1, 3);
  return `<p class="eyebrow">Итог за ${S.year} · оценка</p>
    <h2>${refund ? 'Вам должны вернуть' : due ? 'Нужно доплатить' : 'Вы в расчёте'}</h2>
    <div class="rbig ${refund ? 'good' : due ? 'due' : ''}">≈ ${eur(Math.abs(r.balance))}</div>
    <div class="mini"><span>Доходы</span><b>${eur(r.incTotal)}</b></div>
    <div class="mini"><span>Облагается налогом</span><b>${eur(r.zve)}</b></div>
    <div class="mini"><span>Налог за год</span><b>${eur(r.taxTotal)}</b></div>
    <div class="mini"><span>Уже уплачено</span><b>${eur(r.paidTotal)}</b></div>
    <details><summary>Как это посчитано</summary><table class="calc">${r.lines.filter(l => l.kind !== 'note').map(l => `<tr class="${l.kind}"><td>${esc(l.label)}</td><td>${l.value < 0 ? '− ' : ''}${eur(Math.abs(l.value))}</td></tr>`).join('')}</table></details>
    ${tips.length ? `<ul class="tips">${tips.map(t => `<li class="${t.level}"><b>${esc(t.title)}</b><span>${esc(t.text)}</span></li>`).join('')}</ul>` : ''}
    <a class="btn ghost" href="#/details">Подробный разбор и сроки</a>`;
}
const paintResult = () => { const el = $('#result'); if (el) el.innerHTML = resultHTML(); };
async function quickChange(row, forceCreate = false) {
  const amount = Number($('[name=amount]', row).value) || 0;
  let e = S.entries.find(x => x.id === row.dataset.id);
  if (!e) {
    if (!(amount > 0) && !forceCreate) return null;
    e = { id: row.dataset.id || DB.uid(), kind: row.dataset.kind, date: quickDate() };
    if (!row.dataset.id) { row.dataset.id = e.id; row.classList.remove('ghost'); row.insertAdjacentHTML('afterend', qrow(null, row.dataset.kind)); }
  }
  const saved = await saveEntry({ ...e, type: $('[name=type]', row).value, amount, desc: $('[name=desc]', row).value });
  paintResult();
  return saved;
}

const STATUS = { angestellt: 'Работаю по найму', selbst: 'Фрилансер (Freiberufler)', gewerbe: 'Свой бизнес (Gewerbe)', mix: 'Найм + своё дело', other: 'Другое: пенсия, пособие, аренда' };
const statusOptions = cur => Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${v}</option>`).join('');

function viewDetails() {
  const r = R(), p = S.profile, dl = deadlines(p, S.year), tips = insights(p, S.entries, S.year, r, eur);
  const refund = r.balance < -1, due = r.balance > 1;
  const title = !r.count ? 'Данных пока нет' : refund ? 'Вам должны вернуть' : due ? 'К доплате' : 'Вы в расчёте';
  const lead = tips[0];
  const maxG = Math.max(1, ...Object.values(r.groups));
  const groupTitle = { wk: 'Работа по найму', ba: 'Бизнес', sa: 'Страховки и пенсия', agb: 'Лечение и чрезвычайное', h35: 'Дом (§ 35a)', vm: 'Сдача жилья' };
  return `
  <header class="top"><div><p class="eyebrow">${p.name ? esc(p.name) + ', вот ваша' : 'Ваша'} налоговая ситуация</p><h1>Подробный разбор за ${S.year}</h1></div>
    <div class="actions no-print"><a class="btn ghost" href="#/entries">Все записи</a><button class="btn ghost" data-act="print">Отчёт для печати</button></div></header>
  <section class="hero ${refund ? 'good' : due ? 'due' : ''}">
    <div class="hero-main">
      <p class="eyebrow">Оценка по вашим данным</p>
      <h2>${title}</h2>
      <div class="big" data-count="${Math.abs(Math.round(r.balance))}">≈ ${eur(Math.abs(r.balance))}</div>
      <p class="sub">Налогов за год ${eur(r.taxTotal)} · уже уплачено ${eur(r.paidTotal)}</p>
    </div>
    <a class="hero-fry no-print" href="#/chat" aria-label="Открыть чат с FinFry">
      <div class="bubble"><b>${esc(lead.title)}</b><span>${esc(lead.text.split('. ')[0])}.</span></div>
      <div class="fry">${FRY_SVG}</div>
    </a>
  </section>
  <section class="kpis">
    ${kpi('Доходы', eur(r.incTotal), 'все источники')}
    ${kpi('Налогооблагаемый доход', eur(r.zve), 'zvE — с него считают налог')}
    ${kpi('Средняя ставка', (r.effective * 100).toFixed(1).replace('.', ',') + ' %', 'налог к доходу')}
    ${kpi('Предельная ставка', Math.round(r.marginal * 100) + ' %', '100 € расходов ≈ ' + eur(r.marginal * 100) + ' экономии')}
  </section>
  <div class="cols">
    <section class="card"><h3>Как получился результат</h3>
      <table class="calc">${r.lines.map(l => l.kind === 'note' ? `<tr class="note"><td colspan="2">${esc(l.label)}</td></tr>`
        : `<tr class="${l.kind}"><td>${esc(l.label)}</td><td>${l.value < 0 ? '− ' : ''}${eur(Math.abs(l.value))}</td></tr>`).join('')}</table>
    </section>
    <div class="stack">
      <section class="card"><h3>Что уменьшает налог</h3>
        ${Object.entries(r.groups).filter(([, v]) => v > 0).map(([k, v]) => `<div class="bar"><div class="bar-head"><span>${groupTitle[k]}</span><b>${eur(v)}</b></div><div class="bar-track"><i style="width:${Math.max(3, v / maxG * 100)}%"></i></div></div>`).join('') || '<p class="muted">Расходов пока нет. Добавьте первый — или загрузите чек.</p>'}
        ${r.hasLohn ? `<p class="fine">Дорога ${eur(r.wk.pendler)} · хоум-офис ${eur(r.wk.ho)} · чеки ${eur(r.wk.receipts)}. Учтено ${eur(r.wk.used)}${r.wk.sum <= r.wk.pausch ? ' — паушальная сумма' : ''}.</p>` : ''}
      </section>
      ${r.hasBiz ? `<section class="card"><h3>Ваше дело</h3>
        <div class="mini"><span>Оборот</span><b>${eur(r.umsatz)}</b></div>
        <div class="mini"><span>Прибыль</span><b>${eur(r.bizProfit)}</b></div>
        ${r.gewst ? `<div class="mini"><span>Gewerbesteuer (осталось уплатить)</span><b>${eur(r.gewstDue)}</b></div>` : ''}
        ${r.klein ? `<div class="bar"><div class="bar-head"><span>Лимит Kleinunternehmer</span><b>${eur(r.umsatz)} из ${eur(C.kleinPrev)}</b></div><div class="bar-track ${r.umsatz > C.kleinPrev ? 'over' : ''}"><i style="width:${Math.min(100, r.umsatz / C.kleinPrev * 100)}%"></i></div></div>`
          : `<div class="mini"><span>${r.ust.due < 0 ? 'НДС к возврату' : 'НДС к уплате'} (начислено ${eur(r.ust.out)}, вычет ${eur(r.ust.vor)})</span><b>${eur(Math.abs(r.ust.due))}</b></div>`}
      </section>` : ''}
    </div>
  </div>
  <div class="cols">
    <section class="card"><h3>Что стоит сделать</h3>
      <ul class="tips">${tips.map(t => `<li class="${t.level}"><b>${esc(t.title)}</b><span>${esc(t.text)}</span></li>`).join('')}</ul>
    </section>
    <section class="card"><h3>Ближайшие сроки</h3>
      <ul class="dates">${dl.map(d => `<li><time>${dmy(d.date)}</time><div><b>${esc(d.title)}</b><span>${esc(d.note)}</span></div><em class="${d.days <= 30 ? 'soon' : ''}">${d.days === 0 ? 'сегодня' : 'через ' + d.days + ' дн.'}</em></li>`).join('')}</ul>
    </section>
  </div>
  <p class="fine">FinFry считает по упрощённой модели немецкого подоходного налога за ${S.year} год. Это оценка для ориентира, а не налоговая консультация: итог определяет Finanzamt в Steuerbescheid.</p>`;
}
const kpi = (label, value, hint) => `<div class="kpi card"><span>${label}</span><b>${value}</b><small>${hint}</small></div>`;

function viewEntries() {
  const kinds = { all: 'Все', inc: 'Доходы', exp: 'Расходы', pay: 'Платежи' };
  const list = S.entries.filter(e => String(e.date).slice(0, 4) === String(S.year) && (S.filter === 'all' || e.kind === S.filter))
    .sort((a, b) => b.date.localeCompare(a.date));
  const sum = k => S.entries.filter(e => e.kind === k && String(e.date).slice(0, 4) === String(S.year)).reduce((s, e) => s + Number(e.amount), 0);
  return `
  <header class="top"><div><p class="eyebrow">Налоговый год ${S.year}</p><h1>Доходы и расходы</h1></div>
    <div class="actions"><button class="btn ghost" data-act="csv">Скачать CSV</button><button class="btn primary" data-act="add">+ Добавить</button></div></header>
  <section class="kpis three">
    ${kpi('Доходы', eur(sum('inc')), 'до вычетов')}${kpi('Расходы', eur(sum('exp')), 'по документам')}${kpi('Уплачено авансами', eur(sum('pay')), 'в Finanzamt')}
  </section>
  <div class="tabs" role="tablist">${Object.entries(kinds).map(([k, v]) => `<button role="tab" aria-selected="${S.filter === k}" data-act="filter" data-v="${k}">${v}</button>`).join('')}</div>
  <section class="card list">
    ${list.length ? list.map(e => `<button class="row" data-act="edit" data-id="${e.id}">
      <time>${dmy(e.date).slice(0, 5)}</time>
      <div><b>${esc(e.desc || CAT_LABEL[e.type] || '')}</b><span>${esc(CAT_LABEL[e.type] || e.type)}${e.docId ? ' · 📎 чек' : ''}${Number(e.vat) ? ' · НДС ' + e.vat + ' %' : ''}</span></div>
      <em class="${e.kind}">${e.kind === 'inc' ? '+' : '−'} ${eur2(Number(e.amount))}</em></button>`).join('')
      : `<div class="empty"><div class="fry">${FRY_SVG}</div><p>Здесь пока пусто. Добавьте запись вручную или загрузите чек в разделе «Документы».</p></div>`}
  </section>`;
}

function viewDocs() {
  const linked = id => S.entries.find(e => e.docId === id);
  return `
  <header class="top"><div><p class="eyebrow">Чеки, счета, справки</p><h1>Документы</h1></div>
    <label class="btn primary">+ Загрузить<input type="file" id="docInput" accept="image/*,application/pdf" multiple hidden></label></header>
  <label class="drop" id="drop" for="docInput"><b>Перетащите сюда файлы</b><span>или нажмите, чтобы выбрать. Фото чеков и PDF хранятся только в этом браузере.</span></label>
  <section class="docs">
    ${S.docs.length ? S.docs.slice().sort((a, b) => b.added.localeCompare(a.added)).map(d => { const e = linked(d.id); return `<article class="doc card">
      <button class="thumb" data-act="openDoc" data-id="${d.id}" aria-label="Открыть ${esc(d.name)}">${d.thumb ? `<img src="${d.thumb}" alt="">` : `<span>${d.type === 'application/pdf' ? 'PDF' : 'Файл'}</span>`}</button>
      <div class="doc-body"><b title="${esc(d.name)}">${esc(d.name)}</b>
        <span>${dmy(d.added.slice(0, 10))} · ${(d.size / 1024).toFixed(0)} КБ</span>
        ${e ? `<button class="chip ok" data-act="edit" data-id="${e.id}">✓ ${eur2(Number(e.amount))} · ${esc((CAT_LABEL[e.type] || '').split(':')[0].split('(')[0])}</button>`
            : `<div class="doc-actions"><button class="chip" data-act="scan" data-id="${d.id}">✨ Распознать</button><button class="chip" data-act="docEntry" data-id="${d.id}">Внести вручную</button></div>`}
      </div>
      <button class="x" data-act="delDoc" data-id="${d.id}" aria-label="Удалить документ">×</button></article>`; }).join('')
      : `<div class="empty card"><div class="fry">${FRY_SVG}</div><p>Сфотографируйте чек или загрузите PDF-счёт. Я помогу превратить его в запись о расходе.</p></div>`}
  </section>`;
}

function viewChat() {
  const online = !!S.settings.key;
  const chips = ['Сколько я верну?', 'Что можно списать?', 'Мои ближайшие сроки', 'Что такое Pendlerpauschale?', 'Как подать через ELSTER?'];
  const msgs = S.chat.length ? S.chat : [{ role: 'fry', text: 'Привет' + (S.profile.name ? ', ' + S.profile.name : '') + '! Я FinFry 🐟 Знаю ваши цифры за ' + S.year + ' и немецкие налоговые правила. Спрашивайте — или нажмите на подсказку ниже.' }];
  return `
  <section class="chat">
    <header class="chat-head"><div class="fry">${FRY_SVG}</div><div><b>FinFry</b><span class="${online ? 'on' : ''}">${online ? 'Claude подключён' : 'офлайн-режим: отвечаю по встроенным правилам'}</span></div>
      <button class="btn ghost" data-act="aiSettings" aria-label="Настройки помощника">⚙ Настройки</button></header>
    <div class="msgs" id="msgs">${msgs.map(m => `<div class="msg ${m.role}">${m.role === 'fry' ? md(m.text) : '<p>' + esc(m.text) + '</p>'}</div>`).join('')}
      ${S.busy ? '<div class="msg fry typing"><i></i><i></i><i></i></div>' : ''}</div>
    <div class="chips">${chips.map(c => `<button class="chip" data-act="ask" data-v="${esc(c)}">${c}</button>`).join('')}</div>
    <form id="chatForm" class="chat-form"><textarea name="q" rows="1" placeholder="Спросите о налогах или попросите записать расход…" aria-label="Сообщение" ${S.busy ? 'disabled' : ''}></textarea>
      <button class="btn primary" type="submit" ${S.busy ? 'disabled' : ''}>Отправить</button></form>
  </section>`;
}

function viewProfile() {
  const p = S.profile, v = k => esc(p[k] ?? '');
  return `
  <header class="top"><div><p class="eyebrow">От анкеты зависит весь расчёт</p><h1>Профиль</h1></div></header>
  <form id="profileForm" class="card">
    <h3>О вас</h3>
    <div class="grid2">
      <label>Имя<input name="name" value="${v('name')}"></label>
      <label>Чем вы зарабатываете<select name="status">${statusOptions(p.status)}</select></label>
      <label>Семейное положение<select name="joint"><option value="">Один / одна (Grundtarif)</option><option value="1"${p.joint ? ' selected' : ''}>В браке, общая декларация (Splitting)</option></select></label>
      <label>Детей с Kindergeld<input name="kids" type="number" min="0" max="12" value="${v('kids') || 0}" inputmode="numeric"></label>
      <label>Церковный налог<select name="church"><option value="0">Не плачу</option><option value="8"${p.church == 8 ? ' selected' : ''}>8 % — Бавария, Баден-Вюртемберг</option><option value="9"${p.church == 9 ? ' selected' : ''}>9 % — остальные земли</option></select></label>
      <label class="check"><input type="checkbox" name="single_parent"${p.single_parent ? ' checked' : ''}> Воспитываю детей один / одна</label>
    </div>
    <h3>Работа по найму</h3>
    <div class="grid3">
      <label>До работы, км в одну сторону<input name="km" type="number" min="0" step="1" value="${v('km')}" inputmode="numeric"></label>
      <label>Дней в офисе за год<input name="commuteDays" type="number" min="0" max="366" value="${v('commuteDays')}" inputmode="numeric"></label>
      <label>Дней работы из дома<input name="hoDays" type="number" min="0" max="366" value="${v('hoDays')}" inputmode="numeric"></label>
    </div>
    <h3>Своё дело</h3>
    <div class="grid2">
      <label class="check"><input type="checkbox" name="klein"${p.klein ? ' checked' : ''}> Я Kleinunternehmer (работаю без НДС, § 19 UStG)</label>
      <label>Hebesatz общины, % (для Gewerbesteuer)<input name="hebesatz" type="number" min="200" max="900" value="${v('hebesatz') || 400}" inputmode="numeric"></label>
    </div>
    <div class="actions"><button class="btn primary" type="submit">Сохранить</button></div>
  </form>
  <section class="card"><h3>Ваши данные</h3>
    <p class="muted">Всё хранится в этом браузере на этом устройстве: ${S.entries.length} записей, ${S.docs.length} документов. Чтобы не потерять данные при очистке браузера и перенести их на другое устройство, сохраняйте резервную копию.</p>
    <div class="actions"><button class="btn" data-act="export">Скачать резервную копию</button>
      <label class="btn">Восстановить из копии<input type="file" id="importInput" accept="application/json,.json" hidden></label>
      <button class="btn danger" data-act="wipe">Удалить всё</button></div>
  </section>`;
}

// ───────── Диалоги ─────────
const dlg = () => $('#dlg');
function openDialog(html) { const d = dlg(); d.innerHTML = html; if (!d.open) d.showModal(); }

function typeOptions(kind, cur) {
  const opt = ([k, v]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${esc(v)}</option>`;
  if (kind === 'inc') return Object.entries(INC_TYPES).map(opt).join('');
  if (kind === 'pay') return Object.entries(PAY_TYPES).map(opt).join('');
  return EXP_GROUPS.map(g => `<optgroup label="${esc(g.title)}">${Object.entries(g.cats).map(opt).join('')}</optgroup>`).join('');
}
function defaultType(kind) {
  const st = S.profile.status;
  if (kind === 'inc') return st === 'selbst' ? 'selbst' : st === 'gewerbe' ? 'gewerbe' : 'lohn';
  if (kind === 'pay') return 'est_vz';
  return st === 'selbst' || st === 'gewerbe' ? 'ba_buero' : 'wk_arbeitsmittel';
}
function openEntry(e = {}) {
  const kind = e.kind || 'exp', type = e.type || defaultType(kind);
  const doc = e.docId && S.docs.find(d => d.id === e.docId);
  openDialog(`<form id="entryForm" data-id="${e.id || ''}" data-doc="${e.docId || ''}">
    <h2>${e.id ? 'Изменить запись' : 'Новая запись'}</h2>
    <div class="seg">${[['exp', 'Расход'], ['inc', 'Доход'], ['pay', 'Платёж в Finanzamt']].map(([k, v]) => `<label><input type="radio" name="kind" value="${k}"${k === kind ? ' checked' : ''}><span>${v}</span></label>`).join('')}</div>
    <label>Категория<select name="type">${typeOptions(kind, type)}</select></label>
    <div class="grid2">
      <label>Сумма, €<input name="amount" type="number" step="0.01" min="0" required value="${e.amount ?? ''}" inputmode="decimal" placeholder="как в документе"></label>
      <label>Дата<input name="date" type="date" required value="${e.date || (String(S.year) === todayISO().slice(0, 4) ? todayISO() : S.year + '-12-31')}"></label>
    </div>
    <label>Описание<input name="desc" value="${esc(e.desc || '')}" placeholder="Например: ноутбук для работы"></label>
    <label data-row="vat">НДС в сумме<select name="vat">${[0, 7, 19].map(r => `<option value="${r}"${Number(e.vat) === r ? ' selected' : ''}>${r ? r + ' %' : 'Нет или не выделять'}</option>`).join('')}</select></label>
    <label data-row="withheld">Уже удержано налога, €<input name="withheld" type="number" step="0.01" min="0" value="${e.withheld ?? ''}" inputmode="decimal" placeholder="Lohnsteuer + Soli + Kirchensteuer"></label>
    <label data-row="person">Чей доход<select name="person"><option value="a">Мой</option><option value="b"${e.person === 'b' ? ' selected' : ''}>Супруга / супруги</option></select></label>
    <label data-row="file">Чек или счёт${doc ? `<span class="attached">📎 ${esc(doc.name)}</span>` : '<input name="file" type="file" accept="image/*,application/pdf">'}</label>
    <p class="hint" id="entryHint"></p>
    <div class="actions">${e.id ? '<button class="btn danger" type="button" data-act="delEntry" data-id="' + e.id + '">Удалить</button>' : ''}
      <span class="grow"></span><button class="btn ghost" type="button" data-act="close">Отмена</button><button class="btn primary" type="submit">Сохранить</button></div>
  </form>`);
  syncEntryForm();
}
const HINTS = {
  lohn: 'Годовую сумму брутто и удержанный налог возьмите из Lohnsteuerbescheinigung (строки 3, 4–7).',
  ba_fahrt: 'Поездки на личной машине: 0,30 € за км. Запишите сумму и километраж в описании.',
  ba_bewirtung: 'В налог пойдёт 70 % суммы. На чеке укажите повод и участников.',
  sa_kv: 'Только базовая страховка. Сумма за год — в Lohnsteuerbescheinigung (строки 25–26) или в справке страховой.',
  h35_handwerk: 'Впишите только стоимость работы и выезда, без материалов. Оплата — переводом.',
  wk_arbeitsmittel: 'Вещи до 800 € без НДС списываются сразу, дороже — по годам.',
  ba_buero: 'Вещи до 800 € без НДС списываются сразу, дороже — по годам.',
  agb_krank: 'Учитывается только часть сверх личного порога (zumutbare Belastung).',
  kapital: 'Первые 1 000 € в год не облагаются (Sparer-Pauschbetrag).',
  ersatz: 'Пособия не облагаются, но повышают ставку на остальной доход.',
};
function syncEntryForm() {
  const f = $('#entryForm'); if (!f) return;
  const kind = f.kind.value, type = f.type.value, show = (row, on) => { const el = $(`[data-row="${row}"]`, f); if (el) el.hidden = !on; };
  show('vat', !S.profile.klein && (type === 'selbst' || type === 'gewerbe' || type.startsWith('ba_')));
  show('withheld', type === 'lohn' || type === 'kapital');
  show('person', !!S.profile.joint && kind === 'inc');
  show('file', kind !== 'pay');
  $('#entryHint').textContent = HINTS[type] || '';
}
function formEntry(f) {
  return { id: f.dataset.id || undefined, docId: f.dataset.doc || undefined, kind: f.kind.value, type: f.type.value, amount: f.amount.value,
           date: f.date.value, desc: f.desc.value, vat: f.vat.value, withheld: f.withheld.value, person: f.person.value };
}

function openAiSettings() {
  openDialog(`<form id="aiForm">
    <h2>Настройки FinFry</h2>
    <p class="muted">Без ключа я отвечаю по встроенным правилам. С ключом Claude API понимаю любые вопросы, читаю чеки и сам записываю расходы.</p>
    <label>Ключ Claude API<input name="key" type="password" autocomplete="off" value="${esc(S.settings.key || '')}" placeholder="sk-ant-…"></label>
    <label>Модель<select name="model">${MODELS.map(m => `<option value="${m.id}"${m.id === (S.settings.model || DEFAULT_MODEL) ? ' selected' : ''}>${m.name}</option>`).join('')}</select></label>
    <p class="fine">Ключ создаётся на platform.claude.com и хранится только в этом браузере. С ключом ваши вопросы и цифры из приложения (без имени) отправляются в Anthropic для ответа; запросы оплачиваются с вашего аккаунта. На чужом компьютере ключ не вводите.</p>
    <div class="actions"><button class="btn danger" type="button" data-act="clearChat">Очистить переписку</button><span class="grow"></span>
      <button class="btn ghost" type="button" data-act="close">Отмена</button><button class="btn primary" type="submit">Сохранить</button></div>
  </form>`);
}

// ───────── Действия ─────────
async function saveEntry(e) {
  const entry = { id: e.id || DB.uid(), kind: e.kind, type: e.type, amount: Math.round(Number(e.amount) * 100) / 100, date: e.date, desc: (e.desc || '').trim(),
                  vat: Number(e.vat) || 0, withheld: Number(e.withheld) || 0, person: e.person === 'b' ? 'b' : 'a', docId: e.docId || undefined };
  const i = S.entries.findIndex(x => x.id === entry.id);
  if (i >= 0) S.entries[i] = entry; else S.entries.push(entry);
  await DB.put('entries', entry);
  return entry;
}
async function addDoc(file) {
  const doc = { id: DB.uid(), name: file.name, type: file.type || 'application/octet-stream', size: file.size, added: new Date().toISOString(), thumb: '' };
  if (file.type.startsWith('image/')) doc.thumb = await scaleImage(file, 320, 0.7).catch(() => '');
  await DB.put('blobs', { id: doc.id, blob: file });
  await DB.put('docs', doc);
  S.docs.push(doc);
  return doc;
}
async function scaleImage(blob, max, quality) {
  const bmp = await createImageBitmap(blob), k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}
async function scanDoc(id) {
  const doc = S.docs.find(d => d.id === id);
  if (!S.settings.key) { toast('Для распознавания нужен ключ Claude API'); openAiSettings(); return; }
  const rec = await DB.get('blobs', id); if (!rec) return toast('Файл не найден');
  let file;
  if (doc.type === 'application/pdf') {
    const url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(rec.blob); });
    file = { media_type: 'application/pdf', data: url.split(',')[1] };
  } else if (doc.type.startsWith('image/')) {
    file = { media_type: 'image/jpeg', data: (await scaleImage(rec.blob, 1568, 0.85)).split(',')[1] };
  } else return toast('Распознаю только фото и PDF');
  toast('FinFry читает документ…');
  try {
    const d = await readReceipt({ key: S.settings.key, model: S.settings.model || DEFAULT_MODEL, file, year: S.year });
    openEntry({ kind: d.kind || 'exp', type: d.type, amount: d.amount ?? '', date: d.date || undefined, desc: d.description || doc.name, vat: d.vat || 0, withheld: d.withheld || '', docId: id });
    toast('Проверьте данные и сохраните');
  } catch (e) { toast(e.message); }
}
async function ask(text) {
  text = text.trim(); if (!text || S.busy) return;
  const push = async (role, t) => { const m = { id: DB.uid(), t: Date.now(), role, text: t }; S.chat.push(m); await DB.put('chat', m); };
  await push('user', text); S.busy = true; render();
  const r = R(), dl = deadlines(S.profile, S.year);
  let reply;
  if (S.settings.key) {
    try {
      reply = await chatTurn({ key: S.settings.key, model: S.settings.model || DEFAULT_MODEL, history: S.apiHistory, userText: text,
        system: systemPrompt({ r, profile: S.profile, year: S.year, entries: S.entries.filter(e => String(e.date).slice(0, 4) === String(S.year)), dl, today: todayISO() }),
        runTool: async (name, input) => {
          if (name !== 'add_entry') throw new Error('Неизвестный инструмент');
          if (!(input.type in CAT_LABEL) || !(Number(input.amount) > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(input.date || '')) throw new Error('Неверные данные записи: нужны категория из списка, сумма больше нуля и дата ГГГГ-ММ-ДД');
          const kind = input.type in INC_TYPES ? 'inc' : input.type in PAY_TYPES ? 'pay' : 'exp';
          const e = await saveEntry({ kind, type: input.type, amount: input.amount, date: input.date, desc: input.description, vat: input.vat });
          const nr = calc(S.profile, S.entries, S.year);
          return 'Записано: ' + CAT_LABEL[e.type] + ', ' + e.amount + ' €, ' + e.date + '. Новый баланс за ' + S.year + ': ' + Math.round(nr.balance) + ' € (плюс — доплата, минус — возврат).';
        } });
    } catch (e) {
      S.apiHistory = [];
      reply = '⚠️ ' + e.message + '\n\nПока отвечу по встроенным правилам:\n\n' + offlineAnswer(text, { r, year: S.year, fmt: eur, dl });
    }
  } else {
    await new Promise(res => setTimeout(res, 350));
    reply = offlineAnswer(text, { r, year: S.year, fmt: eur, dl });
  }
  await push('fry', reply); S.busy = false; render();
}
function download(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const ACT = {
  add: () => openEntry({ kind: S.filter === 'all' ? 'exp' : S.filter }),
  edit: el => openEntry(S.entries.find(e => e.id === el.dataset.id)),
  close: () => dlg().close(),
  filter: el => { S.filter = el.dataset.v; render(); },
  async qdel(el) {
    const row = el.closest('.qrow'), id = row.dataset.id;
    if (!id) return;
    S.entries = S.entries.filter(e => e.id !== id); await DB.del('entries', id); row.remove(); paintResult();
  },
  print: () => window.print(),
  ask: el => ask(el.dataset.v),
  aiSettings: openAiSettings,
  scan: el => scanDoc(el.dataset.id),
  docEntry: el => { const d = S.docs.find(x => x.id === el.dataset.id); openEntry({ kind: 'exp', docId: d.id, desc: d.name.replace(/\.[^.]+$/, '') }); },
  async delEntry(el) { if (!confirm('Удалить эту запись?')) return; await DB.del('entries', el.dataset.id); S.entries = S.entries.filter(e => e.id !== el.dataset.id); dlg().close(); render(); },
  async openDoc(el) { const rec = await DB.get('blobs', el.dataset.id); if (!rec) return toast('Файл не найден'); const url = URL.createObjectURL(rec.blob); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000); },
  async delDoc(el) {
    const id = el.dataset.id; if (!confirm('Удалить документ? Запись о расходе останется.')) return;
    await DB.del('docs', id); await DB.del('blobs', id); S.docs = S.docs.filter(d => d.id !== id);
    for (const e of S.entries.filter(x => x.docId === id)) { e.docId = undefined; await DB.put('entries', e); }
    render();
  },
  async clearChat() { if (!confirm('Очистить переписку с FinFry?')) return; await DB.clear('chat'); S.chat = []; S.apiHistory = []; dlg().close(); render(); },
  csv() {
    const rows = S.entries.filter(e => String(e.date).slice(0, 4) === String(S.year)).sort((a, b) => a.date.localeCompare(b.date))
      .map(e => [e.date, { inc: 'Доход', exp: 'Расход', pay: 'Платёж' }[e.kind], CAT_LABEL[e.type] || e.type, String(e.amount).replace('.', ','), e.vat || 0, (e.desc || '').replace(/"/g, '""')].map(v => '"' + v + '"').join(';'));
    download('finfry-' + S.year + '.csv', '﻿"Дата";"Вид";"Категория";"Сумма";"НДС %";"Описание"\n' + rows.join('\n'), 'text/csv');
  },
  async export() { download('finfry-backup-' + todayISO() + '.json', JSON.stringify(await DB.exportAll()), 'application/json'); toast('Копия сохранена в загрузки'); },
  async wipe() {
    if (!confirm('Удалить профиль, все записи, документы и переписку? Это нельзя отменить.')) return;
    await DB.wipe(); S.profile = { ...DEFAULT_PROFILE }; S.entries = []; S.docs = []; S.chat = []; S.apiHistory = []; location.hash = '#/home'; render(true);
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = ACT[el.dataset.act]; if (fn) { e.preventDefault(); Promise.resolve(fn(el)).catch(err => toast(err.message || 'Ошибка')); }
});
document.addEventListener('input', e => {
  const t = e.target, row = t.closest && t.closest('.qrow');
  if (row && t.name !== 'qfile') quickChange(row).catch(err => toast(err.message));
  else if (t.id === 'paidInput') saveEntry({ id: paidId(), kind: 'pay', type: 'est_vz', amount: Number(t.value) || 0, date: S.year + '-12-31', desc: 'Уже уплачено за год' }).then(paintResult);
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.name === 'qfile' && t.files[0]) {
    const row = t.closest('.qrow'), entry = await quickChange(row, true), doc = await addDoc(t.files[0]);
    const name = doc.name.replace(/\.[^.]+$/, '');
    await saveEntry({ ...entry, docId: doc.id, desc: entry.desc || name });
    if (!$('[name=desc]', row).value) $('[name=desc]', row).value = name;
    $('.clip', row).classList.add('on'); toast('Чек прикреплён'); return;
  }
  if (t.closest && t.closest('.qrow')) return;
  if (t.id === 'year') { S.year = Number(t.value); S.settings.year = S.year; saveSettings(); render(true); }
  else if (t.id === 'docInput') { for (const f of t.files) await addDoc(f); toast('Загружено: ' + t.files.length); render(); }
  else if (t.id === 'importInput' && t.files[0]) {
    if (!confirm('Заменить текущие данные данными из копии?')) return;
    try { await DB.importAll(JSON.parse(await t.files[0].text())); await load(); render(true); toast('Данные восстановлены'); } catch (err) { toast(err.message || 'Не удалось прочитать файл'); }
  } else if (t.form && t.form.id === 'entryForm') {
    if (t.name === 'kind') { const cur = formEntry(t.form); cur.type = undefined; openEntry(cur); } else if (t.name === 'type') syncEntryForm();
  }
});
document.addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target, fd = Object.fromEntries(new FormData(f));
  if (f.id === 'profileForm') {
    S.profile = { ...(S.profile || { hebesatz: 400 }), name: (fd.name || '').trim(), status: fd.status, joint: !!fd.joint, kids: Number(fd.kids) || 0 };
    if (f.id === 'profileForm') Object.assign(S.profile, { church: Number(fd.church) || 0, single_parent: !!fd.single_parent, km: Number(fd.km) || 0, commuteDays: Number(fd.commuteDays) || 0,
      hoDays: Number(fd.hoDays) || 0, klein: !!fd.klein, hebesatz: Number(fd.hebesatz) || 400 });
    await DB.put('kv', S.profile, 'profile');
    render(); toast('Профиль сохранён');
  } else if (f.id === 'entryForm') {
    const cur = formEntry(f);
    if (!(Number(cur.amount) > 0)) return toast('Введите сумму больше нуля');
    if (f.file && f.file.files[0]) cur.docId = (await addDoc(f.file.files[0])).id;
    await saveEntry(cur); dlg().close(); render(); toast('Сохранено');
  } else if (f.id === 'aiForm') {
    S.settings.key = (fd.key || '').trim(); S.settings.model = fd.model; saveSettings(); S.apiHistory = []; dlg().close(); render();
    toast(S.settings.key ? 'Claude подключён' : 'Работаю в офлайн-режиме');
  } else if (f.id === 'chatForm') ask(fd.q || '');
});
document.addEventListener('keydown', e => {
  if (e.target.name === 'q' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.target.form.requestSubmit(); }
});
for (const ev of ['dragover', 'drop']) document.addEventListener(ev, async e => {
  if (!e.target.closest || !e.target.closest('#drop')) return;
  e.preventDefault();
  if (ev === 'drop') { for (const f of e.dataTransfer.files) await addDoc(f); toast('Загружено: ' + e.dataTransfer.files.length); render(); }
});
dlg().addEventListener('click', e => { if (e.target === dlg()) dlg().close(); });

// ───────── Отрисовка ─────────
const DEFAULT_PROFILE = { name: '', status: 'angestellt', joint: false, kids: 0, church: 0, hebesatz: 400 };
const VIEWS = { home: viewHome, details: viewDetails, entries: viewEntries, docs: viewDocs, chat: viewChat, profile: viewProfile };
function render(animate = false) {
  let route = location.hash.replace(/^#\//, '') || 'home';
  if (!VIEWS[route]) route = 'home';
  const welcome = false;
  document.body.dataset.route = route;
  const changed = route !== S.route; S.route = route;
  $('#view').innerHTML = VIEWS[route]();
  document.querySelectorAll('.nav a').forEach(a => a.setAttribute('aria-current', a.getAttribute('href') === '#/' + route ? 'page' : 'false'));
  $('#year').value = S.year;
  if (route === 'chat') { const m = $('#msgs'); if (m) m.scrollTop = m.scrollHeight; if (!S.busy && matchMedia('(min-width: 800px)').matches) $('#chatForm textarea')?.focus(); }
  if ((changed || animate) && !reduced) {
    if (!welcome) scrollTo(0, 0);
    if (motion) motion.animate('#view > *', { opacity: [0, 1], y: [10, 0] }, { delay: motion.stagger(0.045), duration: 0.32, ease: 'easeOut' });
    const big = $('.big[data-count]');
    if (big) { const to = Number(big.dataset.count), t0 = performance.now();
      const step = t => { const k = Math.min(1, (t - t0) / 700), v = to * (1 - Math.pow(1 - k, 3)); big.textContent = '≈ ' + eur(v); if (k < 1 && big.isConnected) requestAnimationFrame(step); };
      requestAnimationFrame(step); }
  }
}
async function load() {
  S.profile = (await DB.get('kv', 'profile')) || { ...DEFAULT_PROFILE };
  S.entries = await DB.all('entries');
  // Убираем записи старого встроенного примера, если он был загружен
  const DEMO = ['Зарплата за год, Muster GmbH', 'Комиссия, 1-й квартал', 'Комиссия, 2-й квартал', 'Комиссия, 3-й квартал', 'Проценты и дивиденды', 'Ноутбук Lenovo', 'Курс немецкого C1', 'Подписки: CRM и облако', 'Реклама в соцсетях', 'Поездки к клиентам: 4 200 км × 0,30 €', 'Обеды с клиентами', 'Steuerberater', 'Kranken- и Pflegeversicherung', 'Rentenversicherung', 'Haftpflicht и Unfall', 'Пожертвование', 'Детский сад', 'Стоматолог, доплата', 'Nebenkosten: уборка и сад', 'Vorauszahlung'];
  if (S.profile.name === 'Алекс' && S.entries.some(e => e.desc === DEMO[0])) {
    for (const e of S.entries.filter(x => DEMO.includes(x.desc))) await DB.del('entries', e.id);
    S.entries = S.entries.filter(x => !DEMO.includes(x.desc));
    S.profile = { ...DEFAULT_PROFILE }; await DB.put('kv', S.profile, 'profile');
  } S.docs = await DB.all('docs');
  S.chat = (await DB.all('chat')).sort((a, b) => a.t - b.t);
}
async function boot() {
  S.settings = loadSettings();
  S.year = YEARS.includes(S.settings.year) ? S.settings.year : YEARS[0];
  $('#year').innerHTML = YEARS.map(y => `<option value="${y}">${y}</option>`).join('');
  document.querySelectorAll('[data-fry]').forEach(el => { el.innerHTML = FRY_SVG; });
  S.profile = { ...DEFAULT_PROFILE };
  try { await load(); } catch { toast('Браузер не дал доступ к хранилищу. Данные не сохранятся.'); }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  addEventListener('hashchange', () => render());
  render(true);
}
boot();
