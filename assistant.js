// FinFry — помощник. Без ключа отвечает по встроенным правилам, с ключом — через Claude API.
import { C, PARAMS, CAT_LABEL, INC_TYPES, PAY_TYPES, EXP_GROUPS } from './tax.js';

export const MODELS = [
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5 — рекомендуется' },
  { id: 'claude-fable-5-2', name: 'Claude Fable 5.2 — самый сильный, дороже' },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5 — быстрее и дешевле' },
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5 — самый дешёвый' },
];
export const DEFAULT_MODEL = MODELS[0].id;

// Малёк золотой рыбки. fry — «малёк», Fin — и плавник, и Finanzen.
export const FRY_SVG = `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<path d="M34 52 C18 30 8 30 6 34 C12 44 12 60 6 70 C8 74 18 74 34 52Z" fill="#ff8a3d"/>
<path d="M60 22 C66 8 82 10 84 22Z" fill="#ff8a3d"/>
<ellipse cx="68" cy="52" rx="38" ry="29" fill="#ff9a3d"/>
<path d="M40 60 C52 78 86 78 100 60 C90 70 54 72 40 60Z" fill="#ffd9a0" opacity=".85"/>
<path d="M56 56 C46 62 46 74 58 72 C64 68 62 60 56 56Z" fill="#ff6a1f"/>
<circle cx="84" cy="44" r="10.5" fill="#fff"/><circle cx="86.5" cy="45" r="5.2" fill="#0c2a3a"/><circle cx="88.3" cy="43" r="1.7" fill="#fff"/>
<path d="M90 62 Q96 67 101 61" fill="none" stroke="#0c2a3a" stroke-width="2.4" stroke-linecap="round"/>
<circle cx="110" cy="26" r="4" fill="none" stroke="#3bb4c1" stroke-width="2"/><circle cx="103" cy="12" r="2.6" fill="none" stroke="#3bb4c1" stroke-width="1.8"/>
</svg>`;

const has = (q, ...words) => words.some(w => q.includes(w));

/** Ответ без интернета: по ключевым словам и цифрам пользователя */
export function offlineAnswer(question, ctx) {
  const q = question.toLowerCase(), { r, year, fmt, dl } = ctx, P = PARAMS[year];
  if (has(q, 'привет', 'здравств', 'кто ты', 'hallo', 'что ты умеешь'))
    return 'Привет! Я **FinFry** — малёк золотой рыбки и ваш налоговый штурман 🐟\n\nСпросите меня, например:\n- сколько налога я заплачу или верну\n- что можно списать\n- что такое Pendlerpauschale, Homeoffice, Kleinunternehmer, § 35a\n- какие у меня ближайшие сроки';
  if (has(q, 'сколько', 'верн', 'возврат', 'доплат', 'налог за', 'итог', 'ситуац', 'erstattung', 'nachzahlung')) {
    if (!r.count) return 'За ' + year + ' год пока нет ни одной операции. Добавьте доходы и расходы — и я сразу посчитаю.';
    return 'Картина за **' + year + '**:\n- налогооблагаемый доход (zvE): **' + fmt(r.zve) + '**\n- подоходный налог: ' + fmt(r.est) + (r.soli ? ', Soli ' + fmt(r.soli) : '') + (r.church ? ', церковный ' + fmt(r.church) : '') +
      '\n- уже уплачено: ' + fmt(r.paidTotal) + '\n\n' + (r.balance < 0 ? 'Ожидаемый **возврат ≈ ' + fmt(-r.balance) + '** 🎉' : 'Ожидаемая **доплата ≈ ' + fmt(r.balance) + '**') +
      '\n\nПредельная ставка ' + Math.round(r.marginal * 100) + ' %: каждые 100 € расходов экономят около ' + fmt(r.marginal * 100) + '.';
  }
  if (has(q, 'срок', 'frist', 'когда пода', 'дедлайн', 'до какого'))
    return dl.length ? 'Ближайшие сроки:\n' + dl.slice(0, 5).map(d => '- **' + d.date.split('-').reverse().join('.') + '** — ' + d.title + ' (через ' + d.days + ' дн.)').join('\n') : 'Ближайших сроков не нашёл.';
  if (has(q, 'pendler', 'дорог', 'проезд', 'до работы', 'километр'))
    return '**Pendlerpauschale** — вычет за дорогу до работы, считается за километр в одну сторону за каждый рабочий день в офисе, транспорт не важен.\n\nВ ' + year + ' году: ' + (P.pendler1 === P.pendler2 ? P.pendler1.toFixed(2) + ' € за каждый км' : P.pendler1.toFixed(2) + ' € за первые 20 км и ' + P.pendler2.toFixed(2) + ' € с 21-го') +
      '.\n\n' + (r.wk.pendler ? 'У вас сейчас набегает **' + fmt(r.wk.pendler) + '**.' : 'Впишите километры и дни в профиле — посчитаю автоматически.');
  if (has(q, 'homeoffice', 'хоум', 'из дома', 'удалён', 'home office'))
    return '**Homeoffice-Pauschale** — 6 € за каждый день работы из дома, максимум 210 дней (1 260 € в год). Отдельная комната не нужна. За один и тот же день нельзя получить и Homeoffice, и Pendlerpauschale.\n\n' + (r.wk.ho ? 'У вас учтено ' + fmt(r.wk.ho) + '.' : 'Укажите число дней в профиле.');
  if (has(q, 'klein', 'кляйн', 'малый предприн', 'без ндс'))
    return '**Kleinunternehmerregelung** (§ 19 UStG): вы не начисляете НДС и не сдаёте Voranmeldung, но и входящий НДС не возвращаете.\n\nУсловия с 2025 года: оборот прошлого года до **25 000 €** и текущего — до **100 000 €** (при превышении 100 000 € режим прекращается сразу).\n\n' + (r.hasBiz ? 'Ваш оборот за ' + year + ': **' + fmt(r.umsatz) + '**.' : '');
  if (has(q, 'ндс', 'umsatzsteuer', 'mwst', 'vorsteuer', 'ust'))
    return '**Umsatzsteuer (НДС)**: 19 % обычная ставка, 7 % льготная. Вы платите в Finanzamt разницу: НДС с ваших счетов минус НДС из ваших расходов (Vorsteuer).\n\n' + (r.klein ? 'У вас включён режим Kleinunternehmer — НДС не считается.' : 'У вас за ' + year + ': начислено ' + fmt(r.ust.out) + ', к вычету ' + fmt(r.ust.vor) + ', **к уплате ' + fmt(r.ust.due) + '**.') +
      '\n\nКомиссии за страховое и финансовое посредничество освобождены от НДС (§ 4 Nr. 8 и 11 UStG) — такие доходы вносите со ставкой 0 %.';
  if (has(q, 'gewerbesteuer', 'геверб', 'gewst', 'промыслов'))
    return '**Gewerbesteuer** платят только Gewerbetreibende (не Freiberufler). Первые 24 500 € прибыли свободны, дальше 3,5 % × Hebesatz вашей общины. Большая часть налога засчитывается в подоходный (§ 35 EStG).\n\n' + (r.gewst ? 'У вас: ≈ ' + fmt(r.gewst) + ', зачёт ' + fmt(r.credit35) + '.' : 'По вашим данным Gewerbesteuer сейчас не возникает.');
  if (has(q, 'ноутбук', 'компьютер', 'телефон', 'gwg', 'техник', 'afa', 'амортиз'))
    return 'Рабочая техника списывается так:\n- до **800 € без НДС** (952 € с НДС) — целиком в год покупки (GWG)\n- дороже — по годам (AfA); для компьютеров и софта допускается срок 1 год\n- если пользуетесь и лично — списывается только рабочая доля (без доказательств обычно принимают 50 %)';
  if (has(q, '35a', 'уборк', 'handwerk', 'мастер', 'nebenkosten', 'ремонт', 'по дому'))
    return '**§ 35a EStG** уменьшает сам налог, а не доход:\n- услуги по дому (уборка, сад, уход, позиции из Nebenkostenabrechnung): 20 %, до 4 000 € в год\n- работа мастеров (без материалов): 20 %, до 1 200 € в год\n\nНужен счёт и оплата переводом — наличные не принимаются.' + (r.red35a ? '\n\nУ вас это уже экономит ' + fmt(r.red35a) + '.' : '');
  if (has(q, 'ребён', 'ребен', 'дети', 'kindergeld', 'kinder', 'садик', 'kita'))
    return 'По детям:\n- **Kindergeld** ' + Math.round(P.kindergeld / 12) + ' € в месяц или **Kinderfreibetrag** ' + fmt(P.kfb) + ' на ребёнка — Finanzamt сам выбирает выгодное\n- **Kinderbetreuung** (садик, няня): ' + Math.round(P.kbPct * 100) + ' % расходов, до ' + fmt(P.kbMax) + ' на ребёнка, до 14 лет\n- одиноким родителям — Entlastungsbetrag 4 260 € (+240 € за каждого следующего ребёнка)' + (r.kids ? '\n\nВ вашем расчёте выгоднее ' + (r.kfbBetter ? 'Kinderfreibetrag.' : 'Kindergeld.') : '');
  if (has(q, 'страхов', 'versicherung', 'kranken', 'пенси', 'rürup', 'rente', 'riester'))
    return 'Страховки — это **Sonderausgaben**:\n- Kranken- и Pflegeversicherung (базовая часть) — полностью\n- пенсионные взносы (gesetzliche RV, Rürup) — 100 %, до ' + fmt(P.rvMax) + ' в год\n- Haftpflicht, Unfall, BU — в общем лимите 1 900 € (наёмные) / 2 800 € (самозанятые), который обычно уже исчерпан медстраховкой\n\n' + (r.sa.total > 100 ? 'У вас учтено ' + fmt(r.sa.total) + '.' : 'У вас страховки пока не внесены — это обычно самый крупный вычет.');
  if (has(q, 'steuerklasse', 'класс', 'steuerklassen'))
    return '**Steuerklasse** влияет только на то, сколько удерживают с зарплаты каждый месяц. Итоговый налог за год от класса не зависит — всё выравнивается в декларации. Для супругов: 4/4 при похожих доходах, 3/5 при сильно разных (но тогда декларация обязательна).';
  if (has(q, 'elster', 'как пода', 'декларац', 'steuererklärung', 'anlage'))
    return 'Декларацию подают онлайн через **ELSTER** (elster.de, бесплатно). Основные формы:\n- Hauptvordruck — общие данные\n- Anlage N — работа по найму\n- Anlage S или G + EÜR — фриланс или Gewerbe\n- Anlage Vorsorgeaufwand — страховки\n- Anlage Kind — дети\n- Anlage Haushaltsnahe Aufwendungen — § 35a\n\nНа обзоре есть кнопка «Отчёт для печати» — удобно переносить цифры или отдать Steuerberater.';
  if (has(q, 'списать', 'вычет', 'что можно', 'absetz', 'расход', 'чек', 'сэконом', 'уменьш')) {
    const top = Object.entries(r.byCat).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => '- ' + CAT_LABEL[k] + ': ' + fmt(v)).join('\n');
    return 'Что уменьшает налог:\n- **работа по найму**: дорога, хоум-офис, техника, курсы, профсоюз (первые 1 230 € учитываются и без чеков)\n- **бизнес**: всё, что нужно для дохода — техника, софт, реклама, поездки, Steuerberater\n- **страховки и пенсия**\n- **лечение** сверх личного порога\n- **услуги по дому и мастера** (§ 35a)\n- **пожертвования, садик**' + (top ? '\n\nВаши крупнейшие статьи за ' + year + ':\n' + top : '');
  }
  if (has(q, 'ключ', 'api', 'умнее', 'настро', 'подключ'))
    return 'Сейчас я отвечаю по встроенным правилам. Чтобы я понимал любые вопросы, читал чеки и сам записывал расходы, вставьте ключ Claude API в настройках чата (кнопка ⚙). Ключ хранится только в этом браузере.';
  return 'На этот вопрос у меня нет готового ответа в офлайн-режиме 🫧\n\nЯ умею: итог по налогу, сроки, что можно списать, Pendlerpauschale, Homeoffice, Kleinunternehmer, НДС, Gewerbesteuer, § 35a, дети, страховки, ELSTER.\n\nЧтобы я отвечал на любые вопросы и читал чеки — подключите ключ Claude API в настройках чата (⚙).';
}

// ───────── Claude API ─────────
const API_URL = 'https://api.anthropic.com/v1/messages';

async function post(key, body, withFallback) {
  const headers = { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2026-10-21',
                    'anthropic-dangerous-direct-browser-access': 'true' };
  const payload = { ...body };
  if (withFallback) { headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; payload.fallbacks = 'default'; }
  let res;
  try { res = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify(payload) }); }
  catch { throw new Error('Нет связи с Claude API. Проверьте интернет.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.error && data.error.message) || '';
    const err = new Error(res.status === 401 ? 'Ключ API не принят. Проверьте его в настройках чата.'
      : res.status === 429 ? 'Слишком много запросов или исчерпан лимит. Попробуйте чуть позже.'
      : res.status === 529 || res.status >= 500 ? 'Сервис Claude сейчас перегружен. Попробуйте через минуту.'
      : 'Ошибка Claude API (' + res.status + '): ' + msg);
    err.status = res.status; err.detail = msg;
    throw err;
  }
  return data;
}
/** Один запрос. Отказоустойчивость по отказам модели включена там, где API её поддерживает. */
async function request(key, body) {
  const wantFallback = !/haiku/.test(body.model);
  try { return await post(key, body, wantFallback); }
  catch (e) {
    if (wantFallback && e.status === 400 && /fallback|beta/i.test(e.detail || '')) return post(key, body, false);
    throw e;
  }
}
const textOf = msg => (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();

const TOOLS = [{
  name: 'add_entry',
  description: 'Записать в учёт пользователя доход, расход или платёж в Finanzamt. Вызывай, когда пользователь просит что-то записать или добавить и названа сумма. Если категория неочевидна, выбери ближайшую и скажи, какую выбрал.',
  input_schema: {
    type: 'object', additionalProperties: false, required: ['kind', 'type', 'amount', 'date', 'description'],
    properties: {
      kind: { type: 'string', enum: ['inc', 'exp', 'pay'], description: 'inc — доход, exp — расход, pay — платёж в Finanzamt' },
      type: { type: 'string', enum: Object.keys(CAT_LABEL), description: 'Код категории из списка в системной подсказке' },
      amount: { type: 'number', description: 'Сумма в евро, как в документе (брутто)' },
      date: { type: 'string', description: 'Дата в формате ГГГГ-ММ-ДД' },
      description: { type: 'string', description: 'Короткое описание по-русски' },
      vat: { type: 'number', enum: [0, 7, 19], description: 'Ставка НДС, если это доход или расход бизнеса; иначе 0' },
    },
  },
}];

const catalog = () => 'Доходы (kind=inc): ' + Object.entries(INC_TYPES).map(([k, v]) => k + ' — ' + v).join('; ') +
  '\nРасходы (kind=exp): ' + EXP_GROUPS.map(g => g.title + ': ' + Object.entries(g.cats).map(([k, v]) => k + ' — ' + v).join('; ')).join('\n') +
  '\nПлатежи (kind=pay): ' + Object.entries(PAY_TYPES).map(([k, v]) => k + ' — ' + v).join('; ');

export function systemPrompt(ctx) {
  const { r, profile, year, entries, dl, today } = ctx;
  const { name, ...anon } = profile || {};
  const data = {
    сегодня: today, налоговый_год: year, профиль: anon,
    расчёт: { доходы: r.inc, zvE: r.zve, сумма_доходов_GdE: Math.round(r.gde), подоходный: Math.round(r.est), soli: Math.round(r.soli), церковный: Math.round(r.church),
      налог_с_капитала: Math.round(r.kapTax), всего_налогов: Math.round(r.taxTotal), уже_уплачено: r.paid, баланс_плюс_доплата_минус_возврат: Math.round(r.balance),
      предельная_ставка: r.marginal, werbungskosten: r.wk, betriebsausgaben: Math.round(r.ba), прибыль_бизнеса: Math.round(r.bizProfit),
      sonderausgaben: r.sa, gewerbesteuer: Math.round(r.gewst), ндс: r.ust, оборот: Math.round(r.umsatz), расходы_по_категориям: r.byCat },
    сроки: dl,
    операции: entries.slice(-60).map(e => ({ дата: e.date, вид: e.kind, категория: e.type, сумма: e.amount, описание: e.desc, чек: !!e.docId })),
  };
  return `Ты — FinFry, малёк золотой рыбки и налоговый штурман в одноимённом приложении. Ты помогаешь русскоязычным людям в Германии понять их налоговую ситуацию: Einkommensteuer, Gewerbesteuer, Umsatzsteuer, вычеты, сроки, ELSTER.

Характер: тёплый, бодрый, говоришь просто и по делу, иногда с лёгкой морской ноткой, без сюсюканья. Отвечаешь по-русски. Немецкие термины оставляешь в оригинале и коротко поясняешь при первом упоминании — человеку потом искать их в письмах Finanzamt и в ELSTER. Ответы короткие: суть и цифры сначала, детали по запросу. Это чат на телефоне, поэтому без таблиц и заголовков; списки и **жирный** — можно.

Цифры пользователя лежат в блоке ДАННЫЕ ниже — опирайся на них и называй конкретные суммы. Их посчитало приложение по упрощённой модели (без AfA по годам, без точного разделения супругов, без частных случаев), поэтому это оценка, а не Steuerbescheid; говори об этом, когда вывод зависит от деталей. Если для ответа не хватает данных — спроси или скажи, что стоит внести в приложение. Нормы и суммы, в которых не уверен, не выдумывай: скажи, что это надо проверить.

Ты не Steuerberater и не заменяешь его. В запутанных случаях (доходы из-за рубежа, недвижимость, продажа бизнеса, спор с Finanzamt, проверка) посоветуй Steuerberater или Lohnsteuerhilfeverein. Помогаешь платить меньше только законными способами.

Когда пользователь просит что-то записать («добавь расход 45 € на канцтовары»), вызывай add_entry и потом одной фразой подтверди, что и куда записал. Категории:
${catalog()}

Справка ${year}: Grundfreibetrag ${PARAMS[year].gfb} €, Arbeitnehmer-Pauschbetrag ${C.anp} €, Homeoffice ${C.hoDay} € в день до ${C.hoMax} €, GWG до ${C.gwgNetto} € нетто, Kleinunternehmer ${C.kleinPrev} € / ${C.kleinNow} €, Gewerbesteuer-Freibetrag ${C.gewFrei} €.

ДАННЫЕ:
${JSON.stringify(data)}`;
}

/** Ход диалога с инструментами. history — массив сообщений API (изменяется на месте). */
export async function chatTurn({ key, model, system, history, userText, runTool }) {
  history.push({ role: 'user', content: userText });
  for (let i = 0; i < 6; i++) {
    const msg = await request(key, { model, max_tokens: 16000, system, tools: TOOLS, messages: history });
    if (msg.stop_reason === 'refusal') { history.pop(); return 'На этот запрос я ответить не могу. Попробуйте переформулировать.'; }
    history.push({ role: 'assistant', content: msg.content });
    if (msg.stop_reason !== 'tool_use') return textOf(msg) || (msg.stop_reason === 'max_tokens' ? 'Ответ получился слишком длинным — спросите более узко.' : '…');
    const results = [];
    for (const b of msg.content) {
      if (b.type !== 'tool_use') continue;
      let content, is_error = false;
      try { content = await runTool(b.name, b.input); } catch (e) { content = String(e.message || e); is_error = true; }
      results.push({ type: 'tool_result', tool_use_id: b.id, content, is_error });
    }
    history.push({ role: 'user', content: results });
  }
  return 'Что-то я закружился на месте. Попробуйте ещё раз.';
}

/** Распознать чек или счёт. file — { media_type, data(base64) } */
export async function readReceipt({ key, model, file, year }) {
  const isPdf = file.media_type === 'application/pdf';
  const block = isPdf ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.data } }
                      : { type: 'image', source: { type: 'base64', media_type: file.media_type, data: file.data } };
  const prompt = `Это чек, счёт или справка из Германии. Извлеки данные для налогового учёта и верни только JSON без пояснений:
{"kind":"exp|inc|pay","type":"код категории","amount":число (итог брутто в евро),"date":"ГГГГ-ММ-ДД","description":"продавец и что куплено, коротко по-русски","vat":0|7|19,"withheld":число или 0 (удержанный налог, если это справка о зарплате)}
Если поле прочитать не удалось — поставь null. Текущий налоговый год пользователя: ${year}.
Категории:
${catalog()}`;
  const msg = await request(key, { model, max_tokens: 4000, messages: [{ role: 'user', content: [block, { type: 'text', text: prompt }] }] });
  if (msg.stop_reason === 'refusal') throw new Error('Модель отказалась читать этот документ.');
  const m = textOf(msg).match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Не удалось разобрать документ. Внесите данные вручную.');
  const d = JSON.parse(m[0]);
  if (!(d.type in CAT_LABEL)) d.type = d.kind === 'inc' ? 'sonst' : 'wk_sonst';
  return d;
}
