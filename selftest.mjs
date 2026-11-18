// node selftest.mjs — проверка налогового движка
import { incomeTax, calc, deadlines, PARAMS } from './tax.js';

let fail = 0;
const eq = (name, got, want, tol = 0.5) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) fail++;
  console.log((ok ? 'ok   ' : 'FAIL ') + name + ': ' + got + (ok ? '' : ' (ожидалось ' + want + ')'));
};

// Тариф: значения посчитаны вручную по формуле § 32a EStG
eq('2025 Grundfreibetrag', incomeTax(12096, 2025), 0);
eq('2025 zvE 40000', incomeTax(40000, 2025), 7320, 1);
eq('2025 zvE 100000', incomeTax(100000, 2025), 31088, 1);
eq('2026 zvE 12348', incomeTax(12348, 2026), 0);
eq('2026 zvE 100000', incomeTax(100000, 2026), 30864, 1);
eq('2024 zvE 300000', incomeTax(300000, 2024), 116028, 1);
eq('Splitting = 2×T(x/2)', incomeTax(80000, 2025, true), 2 * incomeTax(40000, 2025));
// Непрерывность тарифа на границах зон
for (const y of [2024, 2025, 2026]) {
  const P = PARAMS[y];
  for (const z of [P.z1, P.z2, P.z3]) eq(y + ' непрерывность на ' + z, incomeTax(z + 1, y) - incomeTax(z, y), 0.35, 0.65);
}

const E = [
  { kind: 'inc', type: 'lohn', amount: 42000, withheld: 6200, date: '2025-12-31' },
  { kind: 'exp', type: 'wk_arbeitsmittel', amount: 400, date: '2025-03-01' },
  { kind: 'exp', type: 'sa_kv', amount: 4000, date: '2025-12-31' },
  { kind: 'exp', type: 'sa_rente', amount: 3906, date: '2025-12-31' },
];
let r = calc({}, E, 2025);
eq('WK = Pauschbetrag 1230', r.wk.used, 1230);
eq('zvE наёмного', r.zve, 42000 - 1230 - 4000 - 3906 - 36);
eq('баланс = налог − удержано', r.balance, r.est + r.soli - 6200, 0.01);

r = calc({ km: 30, commuteDays: 200, hoDays: 20 }, E, 2025);
eq('Pendler 2025: 20×0.30+10×0.38', r.wk.pendler, 200 * (20 * 0.30 + 10 * 0.38));
eq('WK по факту', r.wk.used, 400 + 1960 + 120);
r = calc({ km: 30, commuteDays: 200 }, E.map(e => ({ ...e, date: e.date.replace('2025', '2026') })), 2026);
eq('Pendler 2026: 0.38 с первого км', r.wk.pendler, 200 * 30 * 0.38);

// Бизнес с НДС и Gewerbesteuer
const B = [
  { kind: 'inc', type: 'gewerbe', amount: 119000, vat: 19, date: '2025-06-01' },
  { kind: 'exp', type: 'ba_buero', amount: 11900, vat: 19, date: '2025-06-01' },
  { kind: 'exp', type: 'ba_bewirtung', amount: 1000, vat: 0, date: '2025-06-01' },
];
r = calc({ hebesatz: 400 }, B, 2025);
eq('НДС к уплате', r.ust.due, 19000 - 1900);
eq('Прибыль (Bewirtung 70 %)', r.bizProfit, 100000 - 10000 - 700);
eq('Gewerbesteuer', r.gewst, Math.floor((89300 - 24500) / 100) * 100 * 0.035 * 4);
eq('Зачёт § 35 = GewSt при Hebesatz 400', r.credit35, r.gewst);
r = calc({ klein: true }, B, 2025);
eq('Kleinunternehmer: без НДС', r.ust.due, 0);
eq('Kleinunternehmer: оборот брутто', r.umsatz, 119000);

// Soli: ниже Freigrenze — ноль
eq('Soli = 0 при zvE 60000', calc({}, [{ kind: 'inc', type: 'sonst', amount: 60000, date: '2025-01-01' }], 2025).soli, 0);
// Капитал: Sparer-Pauschbetrag
eq('Капитал 3000 €', calc({}, [{ kind: 'inc', type: 'kapital', amount: 3000, date: '2025-01-01' }], 2025).kapTax, 2000 * 0.25 * 1.055, 0.01);
// Progressionsvorbehalt повышает налог
const base = [{ kind: 'inc', type: 'sonst', amount: 30000, date: '2025-01-01' }];
const withErs = calc({}, [...base, { kind: 'inc', type: 'ersatz', amount: 10000, date: '2025-01-01' }], 2025).est;
eq('Progressionsvorbehalt > обычного', withErs > calc({}, base, 2025).est ? 1 : 0, 1);
// Дети: при высоком доходе Kinderfreibetrag выгоднее
eq('Kinderfreibetrag при 150000', calc({ joint: true, kids: 2 }, [{ kind: 'inc', type: 'sonst', amount: 150000, date: '2025-01-01' }], 2025).kfbBetter ? 1 : 0, 1);
eq('Kindergeld при 40000', calc({ joint: true, kids: 2 }, [{ kind: 'inc', type: 'sonst', amount: 40000, date: '2025-01-01' }], 2025).kfbBetter ? 1 : 0, 0);

const d = deadlines({ status: 'gewerbe' }, 2025, new Date(2026, 10, 18));
eq('Сроки: есть ближайшие', d.length > 3 ? 1 : 0, 1);
console.log(d.map(x => x.date + ' ' + x.title).join('\n'));
const d26 = deadlines({}, 2026, new Date(2026, 10, 18));
eq('Срок за 2026 → 2 августа 2027 (31.07 — суббота)', d26[0].date === '2027-08-02' ? 1 : 0, 1);

console.log(fail ? '\n' + fail + ' проверок не прошло' : '\nВсе проверки пройдены');
process.exit(fail ? 1 : 0);
