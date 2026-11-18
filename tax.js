// FinFry — налоговый движок (Германия, Einkommensteuer). Чистые функции, без DOM.
// Упрощённая модель: оценка, а не Steuerbescheid. Параметры по годам — в PARAMS.

export const YEARS = [2026, 2025, 2024];

// §32a EStG: gfb — Grundfreibetrag; z1,z2,z3 — границы зон; a,b,c,d,e — коэффициенты формулы
export const PARAMS = {
  2024: { gfb: 11784, z1: 17005, z2: 66760, z3: 277825, a: 954.80, b: 181.19, c: 991.21, d: 10636.31, e: 18971.06,
          soliFrei: 18130, pendler1: 0.30, pendler2: 0.38, kfb: 9540, kindergeld: 3000, rvMax: 27566, kbPct: 2 / 3, kbMax: 4000 },
  2025: { gfb: 12096, z1: 17443, z2: 68480, z3: 277825, a: 932.30, b: 176.64, c: 1015.13, d: 10911.92, e: 19246.67,
          soliFrei: 19950, pendler1: 0.30, pendler2: 0.38, kfb: 9600, kindergeld: 3060, rvMax: 29344, kbPct: 0.8, kbMax: 4800 },
  2026: { gfb: 12348, z1: 17799, z2: 69878, z3: 277825, a: 914.51, b: 173.10, c: 1034.87, d: 11135.63, e: 19470.38,
          soliFrei: 20350, pendler1: 0.38, pendler2: 0.38, kfb: 9756, kindergeld: 3108, rvMax: 30826, kbPct: 0.8, kbMax: 4800 },
};
// Общие для всех лет
export const C = { anp: 1230, hoDay: 6, hoMax: 1260, sparer: 1000, saPausch: 36, entl: 4260, entlKid: 240,
                   gewFrei: 24500, gewMess: 0.035, kleinPrev: 25000, kleinNow: 100000, gwgNetto: 800 };

export const INC_TYPES = {
  lohn: 'Зарплата брутто (Bruttolohn)',
  selbst: 'Фриланс (Freiberufler)',
  gewerbe: 'Бизнес (Gewerbe)',
  kapital: 'Проценты и дивиденды (Kapitalerträge)',
  miete: 'Сдача жилья (Vermietung)',
  ersatz: 'Пособия: ALG I, Elterngeld, Krankengeld',
  sonst: 'Прочие доходы',
};
export const PAY_TYPES = {
  est_vz: 'Аванс подоходного налога (ESt-Vorauszahlung)',
  gewst_vz: 'Аванс Gewerbesteuer',
  ust_vz: 'НДС, перечисленный в Finanzamt (USt)',
};
export const EXP_GROUPS = [
  { id: 'wk', title: 'Расходы по найму (Werbungskosten)', cats: {
    wk_arbeitsmittel: 'Рабочие средства: ноутбук, стол, инструмент',
    wk_fortbildung: 'Обучение и курсы (Fortbildung)',
    wk_bewerbung: 'Поиск работы (Bewerbung)',
    wk_reise: 'Командировки (Reisekosten)',
    wk_telefon: 'Телефон и интернет',
    wk_beitrag: 'Профсоюз, проф. объединения',
    wk_sonst: 'Прочие Werbungskosten' } },
  { id: 'ba', title: 'Расходы бизнеса (Betriebsausgaben)', cats: {
    ba_buero: 'Офис, техника, канцтовары',
    ba_waren: 'Товары и материалы',
    ba_fahrt: 'Поездки и авто',
    ba_werbung: 'Реклама и маркетинг',
    ba_software: 'Софт и подписки',
    ba_telefon: 'Телефон и интернет',
    ba_beratung: 'Steuerberater, юрист, бухгалтерия',
    ba_versicherung: 'Бизнес-страховки',
    ba_bewirtung: 'Деловые обеды (Bewirtung, 70 %)',
    ba_raum: 'Аренда, рабочая комната',
    ba_fortbildung: 'Обучение',
    ba_sonst: 'Прочие Betriebsausgaben' } },
  { id: 'sa', title: 'Особые расходы (Sonderausgaben)', cats: {
    sa_kv: 'Мед. и страхование по уходу (Kranken-/Pflegeversicherung)',
    sa_rente: 'Пенсионные взносы (Rentenversicherung, Rürup)',
    sa_vers: 'Прочие страховки: Haftpflicht, BU, Unfall',
    sa_spenden: 'Пожертвования (Spenden)',
    sa_kirche: 'Уплаченный церковный налог',
    sa_kita: 'Детский сад, няня (Kinderbetreuung)' } },
  { id: 'agb', title: 'Чрезвычайные расходы (Außergewöhnliche Belastungen)', cats: {
    agb_krank: 'Лечение, лекарства, очки, зубы',
    agb_sonst: 'Прочее: уход, похороны' } },
  { id: 'h35', title: 'Дом и хозяйство (§ 35a)', cats: {
    h35_dienst: 'Услуги по дому: уборка, сад, Nebenkosten',
    h35_handwerk: 'Мастера: работа без материалов (Handwerker)' } },
  { id: 'vm', title: 'Сдача жилья', cats: {
    vm_kosten: 'Расходы по сдаваемому жилью' } },
];
export const CAT_LABEL = Object.assign({}, INC_TYPES, PAY_TYPES, ...EXP_GROUPS.map(g => g.cats));
export const groupOf = cat => (EXP_GROUPS.find(g => cat in g.cats) || {}).id;

const BIZ_INC = new Set(['selbst', 'gewerbe']);

function tariff(zve, P) {
  const x = Math.floor(Math.max(0, zve));
  let t;
  if (x <= P.gfb) t = 0;
  else if (x <= P.z1) { const y = (x - P.gfb) / 10000; t = (P.a * y + 1400) * y; }
  else if (x <= P.z2) { const z = (x - P.z1) / 10000; t = (P.b * z + 2397) * z + P.c; }
  else if (x <= P.z3) t = 0.42 * x - P.d;
  else t = 0.45 * x - P.e;
  return Math.floor(t);
}
/** Подоходный налог: Grundtarif или Splitting для супругов */
export function incomeTax(zve, year, joint = false) {
  const P = PARAMS[year];
  return joint ? 2 * tariff(zve / 2, P) : tariff(zve, P);
}

function zumutbar(gde, joint, kids) {
  const p = kids >= 3 ? [1, 1, 2] : kids >= 1 ? [2, 3, 4] : joint ? [4, 5, 6] : [5, 6, 7];
  const g = Math.max(0, gde);
  return (p[0] * Math.min(g, 15340) + p[1] * Math.min(Math.max(g - 15340, 0), 35790) + p[2] * Math.max(g - 51130, 0)) / 100;
}

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Главный расчёт. profile — анкета, entries — операции, year — налоговый год */
export function calc(profile, entries, year) {
  const p = profile || {};
  const P = PARAMS[year];
  const joint = !!p.joint, n = joint ? 2 : 1, kids = Math.max(0, Math.floor(num(p.kids)));
  const klein = !!p.klein;
  const E = (entries || []).filter(e => String(e.date || '').slice(0, 4) === String(year));

  const inc = { lohn: 0, selbst: 0, gewerbe: 0, kapital: 0, miete: 0, ersatz: 0, sonst: 0 };
  const byCat = {}, lohnBy = { a: 0, b: 0 };
  const paid = { lohn: 0, kap: 0, vz: 0, gewst: 0, ust: 0 };
  const ust = { out: 0, vor: 0 };
  let umsatz = 0;

  for (const e of E) {
    const amt = num(e.amount), rate = num(e.vat) / 100;
    if (e.kind === 'inc') {
      let net = amt;
      if (BIZ_INC.has(e.type)) {
        if (!klein && rate > 0) { net = amt / (1 + rate); ust.out += amt - net; }
        umsatz += net;
      }
      if (e.type in inc) inc[e.type] += net;
      if (e.type === 'lohn') { lohnBy[e.person === 'b' ? 'b' : 'a'] += amt; paid.lohn += num(e.withheld); }
      if (e.type === 'kapital') paid.kap += num(e.withheld);
    } else if (e.kind === 'exp') {
      let net = amt;
      if (String(e.type).startsWith('ba_') && !klein && rate > 0) { net = amt / (1 + rate); ust.vor += amt - net; }
      byCat[e.type] = (byCat[e.type] || 0) + net;
    } else if (e.kind === 'pay') {
      if (e.type === 'est_vz') paid.vz += amt;
      else if (e.type === 'gewst_vz') paid.gewst += amt;
      else if (e.type === 'ust_vz') paid.ust += amt;
    }
  }
  const sumGroup = id => Object.entries(byCat).filter(([k]) => k.startsWith(id + '_')).reduce((s, [, v]) => s + v, 0);
  const cat = k => byCat[k] || 0;

  // Наёмный труд
  const nLohn = (lohnBy.a > 0) + (lohnBy.b > 0);
  const km = num(p.km), days = num(p.commuteDays);
  const pendler = days * (Math.min(km, 20) * P.pendler1 + Math.max(km - 20, 0) * P.pendler2);
  const ho = Math.min(num(p.hoDays) * C.hoDay, C.hoMax);
  const wkSum = sumGroup('wk') + pendler + ho;
  const wkPausch = C.anp * nLohn;
  const wkUsed = nLohn ? Math.max(wkSum, wkPausch) : 0;
  const lohnEink = Math.max(0, inc.lohn - wkUsed);

  // Бизнес
  const baRaw = sumGroup('ba');
  const ba = baRaw - 0.3 * cat('ba_bewirtung');
  const bizInc = inc.selbst + inc.gewerbe;
  const bizProfit = bizInc - ba;
  const gewProfit = bizInc > 0 ? inc.gewerbe - ba * (inc.gewerbe / bizInc) : 0;

  const mieteEink = inc.miete - cat('vm_kosten');
  let gde = lohnEink + bizProfit + mieteEink + inc.sonst;
  const entl = p.single_parent && kids > 0 && !joint ? C.entl + C.entlKid * (kids - 1) : 0;
  gde -= entl;

  // Sonderausgaben
  const sa = {};
  sa.kv = cat('sa_kv');
  sa.rente = Math.min(cat('sa_rente'), P.rvMax * n);
  const versCap = (nLohn ? 1900 : 2800) * n;
  sa.vers = Math.min(cat('sa_vers'), Math.max(0, versCap - sa.kv));
  const kita = Math.min(cat('sa_kita') * P.kbPct, P.kbMax * kids);
  const spenden = Math.min(cat('sa_spenden'), 0.2 * Math.max(0, gde));
  sa.other = Math.max(cat('sa_kirche') + spenden + kita, C.saPausch * n);
  sa.total = sa.kv + sa.rente + sa.vers + sa.other;

  // Außergewöhnliche Belastungen
  const agbSum = sumGroup('agb');
  const agbZumutbar = zumutbar(gde, joint, kids);
  const agbUsed = Math.max(0, agbSum - agbZumutbar);

  const zve = Math.max(0, Math.floor(gde - sa.total - agbUsed));

  // Тариф с Progressionsvorbehalt (пособия повышают ставку, но сами не облагаются)
  const T = z => {
    z = Math.max(0, z);
    if (!inc.ersatz) return incomeTax(z, year, joint);
    const full = z + inc.ersatz;
    return full > 0 ? Math.floor(z * incomeTax(full, year, joint) / full) : 0;
  };

  // Дети: Kindergeld или Kinderfreibetrag (Günstigerprüfung)
  const share = joint ? 1 : 0.5;
  const kfbTotal = kids * P.kfb * share, kgTotal = kids * P.kindergeld * share;
  const taxPlain = T(zve), taxKfb = T(zve - kfbTotal);
  const kfbBetter = kids > 0 && taxPlain - taxKfb > kgTotal;
  const tariffTax = kfbBetter ? taxKfb + kgTotal : taxPlain;

  // Gewerbesteuer и её зачёт (§ 35 EStG)
  const hebesatz = num(p.hebesatz) || 400;
  const messbetrag = gewProfit > C.gewFrei ? Math.floor((gewProfit - C.gewFrei) / 100) * 100 * C.gewMess : 0;
  const gewst = messbetrag * hebesatz / 100;
  const credit35 = Math.min(messbetrag * 4, gewst, tariffTax);

  // § 35a: прямое уменьшение налога
  const red35a = Math.min(Math.min(cat('h35_dienst') * 0.2, 4000) + Math.min(cat('h35_handwerk') * 0.2, 1200),
                          Math.max(0, tariffTax - credit35));
  const est = Math.max(0, tariffTax - credit35 - red35a);

  // Soli и церковный налог считаются от налога с учётом Kinderfreibetrag
  const base = Math.max(0, taxKfb - credit35 - red35a);
  const soliFrei = P.soliFrei * n;
  const soli = base <= soliFrei ? 0 : Math.min(base * 0.055, (base - soliFrei) * 0.119);
  const church = num(p.church) ? base * num(p.church) / 100 : 0;

  // Доходы с капитала: Abgeltungsteuer 25 % + Soli
  const kapTaxable = Math.max(0, inc.kapital - C.sparer * n);
  const kapTax = kapTaxable * 0.25 * 1.055;

  const taxTotal = est + soli + church + kapTax;
  const paidTotal = paid.lohn + paid.kap + paid.vz;
  const balance = taxTotal - paidTotal; // > 0 доплата, < 0 возврат

  const incTotal = Object.values(inc).reduce((s, v) => s + v, 0);
  const marginal = (T(zve + 1000) - T(zve)) / 1000;
  const groups = {};
  for (const g of EXP_GROUPS) groups[g.id] = sumGroup(g.id);
  groups.wk += pendler + ho;

  const lines = [];
  const L = (label, value, kind = '') => lines.push({ label, value, kind });
  if (inc.lohn) { L('Зарплата брутто', inc.lohn); L(wkSum > wkPausch ? 'Werbungskosten (по факту)' : 'Werbungskosten (Pauschbetrag)', -wkUsed); }
  if (bizInc || baRaw) { L('Доходы бизнеса / фриланса', bizInc); L('Betriebsausgaben', -ba); }
  if (inc.miete || cat('vm_kosten')) L('Сдача жилья (чистыми)', mieteEink);
  if (inc.sonst) L('Прочие доходы', inc.sonst);
  if (entl) L('Вычет для одиноких родителей', -entl);
  L('Сумма доходов (Gesamtbetrag der Einkünfte)', gde, 'sum');
  L('Sonderausgaben: страховки, пенсия, пожертвования', -sa.total);
  if (agbUsed) L('Außergewöhnliche Belastungen (сверх порога)', -agbUsed);
  L('Налогооблагаемый доход (zvE)', zve, 'sum');
  L(joint ? 'Подоходный налог по Splittingtarif' : 'Подоходный налог по тарифу', tariffTax);
  if (kfbBetter) L('в т. ч. выгоднее Kinderfreibetrag вместо Kindergeld', 0, 'note');
  if (credit35) L('Зачёт Gewerbesteuer (§ 35)', -credit35);
  if (red35a) L('Вычет за услуги по дому (§ 35a)', -red35a);
  if (soli) L('Solidaritätszuschlag', soli);
  if (church) L('Церковный налог (Kirchensteuer)', church);
  if (kapTax) L('Налог с капитала (Abgeltungsteuer)', kapTax);
  L('Всего налогов за год', taxTotal, 'sum');
  if (paid.lohn) L('Уже удержано с зарплаты (Lohnsteuer)', -paid.lohn);
  if (paid.kap) L('Уже удержано банком', -paid.kap);
  if (paid.vz) L('Уже внесено авансами', -paid.vz);
  L(balance > 0 ? 'К доплате' : 'К возврату', Math.abs(balance), 'total');

  return {
    year, joint, kids, klein, count: E.length, hasLohn: nLohn > 0, hasBiz: bizInc > 0 || baRaw > 0,
    inc, incTotal, lohnEink, bizInc, bizProfit, gewProfit, mieteEink, gde, zve,
    wk: { sum: wkSum, pendler, ho, pausch: wkPausch, used: wkUsed, receipts: sumGroup('wk') },
    ba, sa, agb: { sum: agbSum, zumutbar: agbZumutbar, used: agbUsed },
    kfbBetter, tariffTax, est, soli, church, kapTax, credit35, red35a, taxTotal,
    gewst, messbetrag, gewstDue: gewst - paid.gewst,
    paid, paidTotal, balance, marginal, effective: gde > 0 ? (est + soli + church) / gde : 0,
    ust: { out: ust.out, vor: ust.vor, due: ust.out - ust.vor - paid.ust }, umsatz,
    byCat, groups, lines,
  };
}

/** Персональные подсказки по результату расчёта */
export function insights(profile, entries, year, r, fmt = n => Math.round(n) + ' €') {
  const out = [], p = profile || {};
  const add = (level, title, text) => out.push({ level, title, text });
  const E = (entries || []).filter(e => String(e.date || '').slice(0, 4) === String(year));
  if (!E.length) {
    add('info', 'Пока нет данных за ' + year, 'Добавьте доходы и расходы или загрузите чеки — и картина по налогам появится сразу.');
    return out;
  }
  if (r.balance < -1) add('good', 'Похоже, вам вернут ' + fmt(-r.balance), 'Подайте декларацию (Steuererklärung) — деньги возвращают только по заявлению. Добровольно это можно сделать в течение 4 лет.');
  else if (r.balance > 1) add('warn', 'Ожидается доплата ' + fmt(r.balance), 'Отложите эту сумму заранее. Каждые 100 € подтверждённых расходов уменьшают налог примерно на ' + fmt(r.marginal * 100) + '.');
  if (r.hasLohn && r.wk.sum < r.wk.pausch)
    add('info', 'Чеки по работе пока не влияют', 'Набрано ' + fmt(r.wk.sum) + ' из ' + fmt(r.wk.pausch) + ' Arbeitnehmer-Pauschbetrag. Пока сумма ниже порога, Finanzamt учтёт паушальную сумму автоматически. Ещё ' + fmt(r.wk.pausch - r.wk.sum) + ' — и каждый чек начнёт экономить налог.');
  if (r.hasLohn && !Number(p.km) && !Number(p.hoDays))
    add('info', 'Не указаны дорога и хоум-офис', 'В профиле впишите километры до работы и дни в офисе и дома: Pendlerpauschale и Homeoffice-Pauschale (6 € в день, до 1 260 €) часто дают больше, чем все чеки вместе.');
  if (!r.sa.kv)
    add('info', 'Нет взносов на медстраховку', 'Kranken- и Pflegeversicherung — обычно самый крупный вычет. Сумму за год возьмите из Lohnsteuerbescheinigung (строки 25–26) или из справки страховой.');
  if (r.hasBiz && r.klein) {
    if (r.umsatz > C.kleinNow) add('warn', 'Лимит Kleinunternehmer превышен', 'Оборот ' + fmt(r.umsatz) + ' больше 100 000 € — режим без НДС прекращается сразу, с момента превышения.');
    else if (r.umsatz > C.kleinPrev) add('warn', 'Со следующего года — с НДС', 'Оборот ' + fmt(r.umsatz) + ' превысил 25 000 €. В следующем году Kleinunternehmerregelung уже не действует.');
    else add('info', 'Запас по Kleinunternehmer', 'До порога 25 000 € осталось ' + fmt(C.kleinPrev - r.umsatz) + '.');
  }
  if (r.gewProfit > C.gewFrei) add('info', 'Появился Gewerbesteuer', 'Прибыль Gewerbe выше 24 500 €: налог около ' + fmt(r.gewst) + ', из них ' + fmt(r.credit35) + ' засчитывается в подоходный.');
  if (r.hasBiz && !r.paid.vz && r.balance > 400) add('info', 'Ждите авансовые платежи', 'При доплате от 400 € Finanzamt назначает Vorauszahlungen — четыре раза в год (10 марта, июня, сентября, декабря).');
  const big = E.filter(e => e.kind === 'exp' && ['wk_arbeitsmittel', 'ba_buero'].includes(e.type) && Number(e.amount) > 952);
  if (big.length) add('warn', 'Дорогая покупка: ' + (big[0].desc || 'техника'), 'Вещи дороже 800 € без НДС списываются по годам (AfA), а не сразу. Здесь они учтены целиком — реальный вычет за этот год будет меньше.');
  if (r.byCat.ba_bewirtung) add('info', 'Деловые обеды — только 70 %', 'Из ' + fmt(r.byCat.ba_bewirtung) + ' учтено 70 %. На чеке нужны повод и участники.');
  if (!r.groups.h35) add('info', 'Проверьте Nebenkostenabrechnung', 'Уборка подъезда, дворник, сад, трубочист из счёта за жильё — это § 35a: 20 % затрат вычитаются прямо из налога.');
  const noDoc = E.filter(e => e.kind === 'exp' && !e.docId).length;
  if (noDoc) add('info', noDoc + ' расход(ов) без чека', 'Finanzamt может запросить подтверждение. Прикрепите фото или PDF, пока документы под рукой.');
  if (r.kfbBetter) add('good', 'Kinderfreibetrag выгоднее Kindergeld', 'Finanzamt сам применит выгодный вариант — проверьте, что дети указаны в декларации (Anlage Kind).');
  return out;
}

const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
function workday(y, m, d) { // перенос с выходных на понедельник
  const dt = new Date(y, m - 1, d);
  while (dt.getDay() === 0 || dt.getDay() === 6) dt.setDate(dt.getDate() + 1);
  return iso(dt);
}
/** Ближайшие сроки. today — Date */
export function deadlines(profile, year, today = new Date()) {
  const p = profile || {}, list = [];
  const biz = ['selbst', 'gewerbe', 'mix'].includes(p.status);
  list.push({ date: workday(year + 1, 7, 31), title: 'Декларация за ' + year + ' — срок без консультанта', note: 'Если подавать обязаны (Pflichtveranlagung)' });
  list.push({ date: year === 2024 ? '2026-04-30' : workday(year + 2, 3, 0), title: 'Декларация за ' + year + ' — через Steuerberater', note: 'Продлённый срок' });
  list.push({ date: workday(year + 4, 12, 31), title: 'Последний день добровольной подачи за ' + year, note: 'Позже возврат пропадает' });
  for (const y of [today.getFullYear(), today.getFullYear() + 1]) {
    if (biz) for (const m of [3, 6, 9, 12]) list.push({ date: workday(y, m, 10), title: 'Аванс подоходного налога', note: 'ESt-Vorauszahlung, если назначен' });
    if (p.status === 'gewerbe' || p.status === 'mix') for (const m of [2, 5, 8, 11]) list.push({ date: workday(y, m, 15), title: 'Аванс Gewerbesteuer', note: 'Если назначен общиной' });
    if (biz && !p.klein) for (const m of [1, 4, 7, 10]) list.push({ date: workday(y, m, 10), title: 'НДС за квартал', note: 'Umsatzsteuer-Voranmeldung' });
  }
  const t = iso(today);
  const future = list.filter(d => d.date >= t).sort((a, b) => a.date.localeCompare(b.date));
  const filing = future.filter(d => d.title.includes('за ' + year)); // сроки декларации показываем всегда
  return [...filing, ...future.filter(d => !filing.includes(d)).slice(0, 4)].sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({ ...d, days: Math.round((new Date(d.date) - new Date(t)) / 864e5) }));
}
