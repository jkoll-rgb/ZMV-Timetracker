import { useState, useMemo } from "react";
import * as XLSX from "xlsx";

const AW = 4.333;
const eur = (v: number) => v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " \u20ac";
const num1 = (v: number) => v.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/* ------------------------------------------------------------------ */
/*  DEFAULT_SERVICES                                                   */
/* ------------------------------------------------------------------ */

const DEFAULT_SERVICES = [
  { id: 1, name: "HKP-Pr\u00fcfung & Nachverfolgung", eurPerH: 38, defaultH: 0 },
  { id: 2, name: "Mehrkostenvereinbarungen", eurPerH: 38, defaultH: 0 },
  { id: 3, name: "Recall-Management", eurPerH: 35, defaultH: 0 },
  { id: 4, name: "Bonusheft-Digitalisierung", eurPerH: 30, defaultH: 0 },
  { id: 5, name: "Gutachter-Vorbereitung", eurPerH: 42, defaultH: 0 },
];

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function Ampel({ val, lo, hi }: { val: number; lo: number; hi: number }) {
  if (val <= lo) return <span className="ml-2 text-xs font-semibold text-green-700 bg-green-100 rounded px-2 py-0.5">{"\ud83d\udfe2"} Plausibel</span>;
  if (val <= hi) return <span className="ml-2 text-xs font-semibold text-yellow-700 bg-yellow-100 rounded px-2 py-0.5">{"\ud83d\udfe1"} Grenzwertig</span>;
  return <span className="ml-2 text-xs font-semibold text-red-700 bg-red-100 rounded px-2 py-0.5">{"\ud83d\udd34"} Sehr hoch</span>;
}

function InputNum({ label, value, onChange, unit, step = 1, min = 0, hint, small }: any) {
  return (
    <div className={small ? "mb-2" : "mb-3"}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input type="number" value={value} min={min} step={step}
          onChange={(e: any) => onChange(parseFloat(e.target.value) || 0)}
          className={`border-2 border-brand-300 rounded-lg px-3 py-1.5 text-sm font-mono text-right bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-400 ${small ? "w-24" : "w-32"}`} />
        <span className="text-sm text-gray-500">{unit}</span>
      </div>
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function Row({ label, value, highlight, sub, border }: any) {
  return (
    <div className={`flex justify-between items-center py-2 px-3 rounded-lg mb-1
      ${highlight ? "bg-brand-600 text-white font-bold" : border ? "bg-white border border-gray-200" : "bg-gray-50"}`}>
      <span className={`text-sm ${sub ? "pl-3 text-gray-400" : highlight ? "text-white" : "text-gray-600"}`}>{label}</span>
      <span className={`font-mono text-sm ${highlight ? "text-white text-base" : "text-gray-800"}`}>{value}</span>
    </div>
  );
}

function Divider({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 my-3">
      <div className="flex-1 border-t border-gray-200" />
      {label && <span className="text-xs text-gray-400">{label}</span>}
      <div className="flex-1 border-t border-gray-300" />
    </div>
  );
}

function CompareBar({ labelL, labelR, valL, valR }: { labelL: string; labelR: string; valL: number; valR: number }) {
  const total = valL + valR;
  const pL = total > 0 ? (valL / total) * 100 : 50;
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs text-gray-500 mb-1"><span>{labelL}</span><span>{labelR}</span></div>
      <div className="flex rounded-full overflow-hidden h-5">
        <div className="bg-brand-500 flex items-center justify-center text-white text-xs font-bold transition-all" style={{ width: `${pL}%` }}>
          {pL > 15 ? eur(valL) : ""}
        </div>
        <div className="bg-orange-400 flex items-center justify-center text-white text-xs font-bold transition-all" style={{ width: `${100 - pL}%` }}>
          {(100 - pL) > 15 ? eur(valR) : ""}
        </div>
      </div>
    </div>
  );
}

function TabBtn({ active, label, onClick, badge }: any) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 rounded-t-lg text-sm font-semibold transition-all border-b-2
        ${active
          ? "border-brand-600 text-brand-700 bg-white"
          : "border-transparent text-gray-400 hover:text-gray-600"}`}>
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="ml-1.5 bg-purple-600 text-white text-xs rounded-full px-1.5 py-0.5">{badge}</span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Calc helpers                                                       */
/* ------------------------------------------------------------------ */

function calcBase(lohn: number, stdWoche: number, fix: number, marge: number) {
  const stdMon = stdWoche * AW;
  const pk = stdMon * lohn;
  const gk = pk + fix;
  const preis = gk / (1 - marge / 100);
  return { stdMon, pk, gk, preis };
}

function calcStunden(stdWoche: number, behandler: number, lohn: number, fix: number, marge: number,
  gkv: number, pkv: number, minGKV: number, minPKV: number, minBEL: number) {
  const base = calcBase(lohn, stdWoche, fix, marge);
  const sph = behandler > 0 ? stdWoche / behandler : 0;
  const bel = Math.max(0, 100 - gkv - pkv);
  const gwMin = (gkv / 100) * minGKV + (pkv / 100) * minPKV + (bel / 100) * minBEL;
  const maxFWo = gwMin > 0 ? (base.stdMon * 60) / gwMin / AW : 0;
  return { ...base, sph, maxFWo };
}

function calcFaelle(faelleWoche: number, behandler: number, lohn: number, fix: number, marge: number,
  gkv: number, pkv: number, minGKV: number, minPKV: number, minBEL: number) {
  const bel = Math.max(0, 100 - gkv - pkv);
  const gwMin = (gkv / 100) * minGKV + (pkv / 100) * minPKV + (bel / 100) * minBEL;
  const fMon = faelleWoche * AW;
  const stdWoche = (fMon * gwMin) / 60 / AW;
  const base = calcBase(lohn, stdWoche, fix, marge);
  const sph = behandler > 0 ? stdWoche / behandler : 0;
  return { ...base, sph, stdWoche };
}


/* ------------------------------------------------------------------ */
/*  Excel export                                                       */
/* ------------------------------------------------------------------ */

function exportXlsx(
  tab: string,
  settings: any,
  weg1: any,
  weg2: any,
  bookedServices: any[],
  zusatzSumme: number,
  zusatzStundenGesamt: number,
  inputs: any,
) {
  const wb = XLSX.utils.book_new();

  /* Sheet 1 - Einstellungen */
  const sRows: any[][] = [
    ["Einstellung", "Wert"],
    ["Stundenlohn (\u20ac)", settings.lohn],
    ["Fixkosten / Monat (\u20ac)", settings.fix],
    ["Marge (%)", settings.marge],
    ["GKV (%)", settings.gkv],
    ["PKV (%)", settings.pkv],
    ["BEL (%)", Math.max(0, 100 - settings.gkv - settings.pkv)],
    ["Min GKV (Min.)", settings.minGKV],
    ["Min PKV (Min.)", settings.minPKV],
    ["Min BEL (Min.)", settings.minBEL],
    ["ZMV Lohn (\u20ac)", settings.zmvLohn],
    ["ZMV Wochenstd.", settings.zmvWochenstd],
    ["ZMV Urlaub (Tage)", settings.zmvUrlaub],
    ["ZMV Krank (Tage)", settings.zmvKrank],
    ["Ampel Gr\u00fcn bis", settings.ampelGruen],
    ["Ampel Gelb bis", settings.ampelGelb],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(sRows);
  ws1["!cols"] = [{ wch: 26 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws1, "Einstellungen");

  /* Sheet 2 - Zusatzleistungen */
  const zRows: any[][] = [
    ["Leistung", "Std./Woche", "\u20ac/Std.", "Summe/Monat"],
    ...bookedServices.map((s: any) => [s.name, s.hours, s.eurPerH, +(s.hours * AW * s.eurPerH).toFixed(2)]),
    [],
    ["Gesamt Zusatz / Monat", "", "", +zusatzSumme.toFixed(2)],
    ["Gesamt Zusatz-Stunden / Monat", "", "", +zusatzStundenGesamt.toFixed(1)],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(zRows);
  ws2["!cols"] = [{ wch: 30 }, { wch: 12 }, { wch: 10 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Zusatzleistungen");

  /* Sheet 3 - Weg 1 */
  const w1 = weg1;
  const w1Rows: any[][] = [
    ["Weg 1: Behandler & Stunden"],
    [],
    ["Service-Std./Woche", inputs.stdWoche],
    ["Behandler", inputs.behandler],
    ["Std./Behandler/Wo.", +w1.sph.toFixed(1)],
    [],
    ["Service-Std./Monat", +w1.stdMon.toFixed(1)],
    ["Personalkosten/Monat", +w1.pk.toFixed(2)],
    ["Fixkosten/Monat", settings.fix],
    ["Gesamtkosten/Monat", +w1.gk.toFixed(2)],
    ["Basispreis/Monat", +w1.preis.toFixed(2)],
    [],
    ["+ Zusatzleistungen/Monat", +zusatzSumme.toFixed(2)],
    ["= Gesamtpreis/Monat", +(w1.preis + zusatzSumme).toFixed(2)],
    [],
    ["Max. F\u00e4lle/Woche", Math.round(w1.maxFWo)],
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(w1Rows);
  ws3["!cols"] = [{ wch: 28 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws3, "Weg 1");

  /* Sheet 4 - Weg 2 */
  const w2 = weg2;
  const w2Rows: any[][] = [
    ["Weg 2: Fallzahlen"],
    [],
    ["F\u00e4lle/Woche", inputs.faelleWoche],
    ["Behandler", inputs.behandler],
    ["Std./Behandler/Wo.", +w2.sph.toFixed(1)],
    [],
    ["Ben\u00f6tigte Std./Woche", +w2.stdWoche.toFixed(1)],
    ["Service-Std./Monat", +(w2.stdWoche * AW).toFixed(1)],
    ["Personalkosten/Monat", +w2.pk.toFixed(2)],
    ["Fixkosten/Monat", settings.fix],
    ["Gesamtkosten/Monat", +w2.gk.toFixed(2)],
    ["Basispreis/Monat", +w2.preis.toFixed(2)],
    [],
    ["+ Zusatzleistungen/Monat", +zusatzSumme.toFixed(2)],
    ["= Gesamtpreis/Monat", +(w2.preis + zusatzSumme).toFixed(2)],
  ];
  const ws4 = XLSX.utils.aoa_to_sheet(w2Rows);
  ws4["!cols"] = [{ wch: 28 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws4, "Weg 2");

  /* Apply some header styling */
  const headerStyle = { font: { bold: true }, fill: { fgColor: { rgb: "0D9488" } } };
  if (ws1["A1"]) ws1["A1"].s = headerStyle;
  if (ws1["B1"]) ws1["B1"].s = headerStyle;
  if (ws2["A1"]) ws2["A1"].s = headerStyle;
  if (ws2["B1"]) ws2["B1"].s = headerStyle;
  if (ws2["C1"]) ws2["C1"].s = headerStyle;
  if (ws2["D1"]) ws2["D1"].s = headerStyle;
  if (ws3["A1"]) ws3["A1"].s = { font: { bold: true, sz: 14 } };
  if (ws4["A1"]) ws4["A1"].s = { font: { bold: true, sz: 14 } };

  /* Highlight total rows */
  const priceStyle = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "0D9488" } } };
  if (ws3["A14"]) ws3["A14"].s = priceStyle;
  if (ws3["B14"]) ws3["B14"].s = priceStyle;
  if (ws4["A15"]) ws4["A15"].s = priceStyle;
  if (ws4["B15"]) ws4["B15"].s = priceStyle;

  XLSX.writeFile(wb, "ZMV_Kalkulation.xlsx");
}


/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function Offers() {
  const [tab, setTab] = useState<"weg1" | "weg2" | "zusatz" | "settings">("weg1");

  /* Settings */
  const [lohn, setLohn] = useState(35);
  const [fix, setFix] = useState(200);
  const [marge, setMarge] = useState(30);
  const [gkv, setGkv] = useState(65);
  const [pkv, setPkv] = useState(25);
  const [minGKV, setMinGKV] = useState(8);
  const [minPKV, setMinPKV] = useState(10);
  const [minBEL, setMinBEL] = useState(10);
  const [zmvLohn, setZmvLohn] = useState(35);
  const [zmvWochenstd, setZmvWochenstd] = useState(40);
  const [zmvUrlaub, setZmvUrlaub] = useState(30);
  const [zmvKrank, setZmvKrank] = useState(15);
  const [ampelGruen, setAmpelGruen] = useState(6);
  const [ampelGelb, setAmpelGelb] = useState(10);

  /* Inputs */
  const [stdWoche, setStdWoche] = useState(20);
  const [faelleWoche, setFaelleWoche] = useState(80);
  const [behandler, setBehandler] = useState(3);

  /* Zusatzleistungen */
  const [serviceHours, setServiceHours] = useState<Record<number, number>>({});

  const bel = Math.max(0, 100 - gkv - pkv);

  const bookedServices = useMemo(() =>
    DEFAULT_SERVICES.filter((s) => (serviceHours[s.id] || 0) > 0).map((s) => ({
      ...s,
      hours: serviceHours[s.id] || 0,
    })),
    [serviceHours]
  );

  const zusatzSumme = useMemo(() =>
    bookedServices.reduce((acc, s) => acc + s.hours * AW * s.eurPerH, 0),
    [bookedServices]
  );

  const zusatzStundenGesamt = useMemo(() =>
    bookedServices.reduce((acc, s) => acc + s.hours * AW, 0),
    [bookedServices]
  );

  /* Weg 1 */
  const weg1 = useMemo(() => calcStunden(stdWoche, behandler, lohn, fix, marge, gkv, pkv, minGKV, minPKV, minBEL),
    [stdWoche, behandler, lohn, fix, marge, gkv, pkv, minGKV, minPKV, minBEL]);

  /* Weg 2 */
  const weg2 = useMemo(() => calcFaelle(faelleWoche, behandler, lohn, fix, marge, gkv, pkv, minGKV, minPKV, minBEL),
    [faelleWoche, behandler, lohn, fix, marge, gkv, pkv, minGKV, minPKV, minBEL]);

  /* ZMV */
  const zmvProdWo = 52 - zmvUrlaub / 5 - zmvKrank / 5;
  const zmvMonat = zmvWochenstd * AW * zmvLohn;

  const settings = { lohn, fix, marge, gkv, pkv, minGKV, minPKV, minBEL, zmvLohn, zmvWochenstd, zmvUrlaub, zmvKrank, ampelGruen, ampelGelb };
  const inputs = { stdWoche, faelleWoche, behandler };

  /* ZusatzBlock */
  function ZusatzBlock({ s }: { s: typeof DEFAULT_SERVICES[number] }) {
    const h = serviceHours[s.id] || 0;
    const mon = h * AW * s.eurPerH;
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3">
        <div className="flex justify-between items-start mb-2">
          <div>
            <span className="font-semibold text-sm text-gray-800">{s.name}</span>
            <span className="ml-2 text-xs text-gray-400">{eur(s.eurPerH)}/Std.</span>
          </div>
          {h > 0 && <span className="text-xs font-bold text-purple-700 bg-purple-100 rounded px-2 py-0.5">{eur(mon)}/Mon.</span>}
        </div>
        <InputNum label="Stunden / Woche" value={h} onChange={(v: number) => setServiceHours((prev: any) => ({ ...prev, [s.id]: v }))}
          unit="Std./Wo." step={0.5} small />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-brand-700 to-brand-600 rounded-2xl p-6 mb-6 text-white shadow-lg">
        <h1 className="text-2xl font-bold">{"\ud83e\uddb7"} ZMV Abrechnungsservice {"\u2013"} Angebotskalkulator</h1>
        <p className="text-brand-100 mt-1 text-sm">Monatspreis berechnen & mit angestellter ZMV vergleichen</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        <TabBtn active={tab === "weg1"} label={"\ud83d\udcc8 Weg 1"} onClick={() => setTab("weg1")} />
        <TabBtn active={tab === "weg2"} label={"\ud83d\udcc9 Weg 2"} onClick={() => setTab("weg2")} />
        <TabBtn active={tab === "zusatz"} label={"\u2795 Zusatz"} onClick={() => setTab("zusatz")} badge={bookedServices.length} />
        <TabBtn active={tab === "settings"} label={"\u2699\ufe0f Einstellungen"} onClick={() => setTab("settings")} />
      </div>

      {/* ================= WEG 1 ================= */}
      {tab === "weg1" && (
        <div className="space-y-2">
          <div className="bg-brand-50 rounded-xl p-4 mb-2">
            <h2 className="font-bold text-brand-700 mb-3">{"\ud83d\udcc8"} Weg 1: Behandler & Stunden</h2>
            <InputNum label="Service-Stunden / Woche" value={stdWoche} onChange={setStdWoche} unit="Std." step={0.5} />
            <InputNum label="Behandler in der Praxis" value={behandler} onChange={(v: number) => setBehandler(Math.max(1, Math.round(v)))} unit="Behandler" min={1} />
          </div>

          <Row label={"\u00d8 Std. pro Behandler / Woche"} value={num1(weg1.sph) + " Std."} border />
          <div className="flex items-center">
            <span className="text-sm text-gray-500">{"Plausibilit\u00e4t"}</span>
            <Ampel val={weg1.sph} lo={ampelGruen} hi={ampelGelb} />
          </div>

          <Divider label="Kalkulation" />
          <Row label="Service-Std. / Monat" value={num1(weg1.stdMon) + " Std."} />
          <Row label="Personalkosten / Monat" value={eur(weg1.pk)} />
          <Row label="Fixkosten / Monat" value={eur(fix)} sub />
          <Row label="Gesamtkosten / Monat" value={eur(weg1.gk)} border />
          <Row label={"\ud83c\udff7\ufe0f Basispreis / Monat (inkl. " + marge + "% Marge)"} value={eur(weg1.preis)} highlight />

          {zusatzSumme > 0 && (
            <>
              <Divider label="Zusatzleistungen" />
              <Row label="+ Zusatzleistungen / Monat" value={eur(zusatzSumme)} border />
              <Row label="= Gesamtpreis / Monat" value={eur(weg1.preis + zusatzSumme)} highlight />
            </>
          )}

          <Divider />
          <Row label="Stundensatz" value={weg1.stdMon > 0 ? eur(weg1.preis / weg1.stdMon) + " / Std." : "\u2013"} />
          <Row label={"Max. bearbeitbare F\u00e4lle / Woche"} value={Math.round(weg1.maxFWo) + " F\u00e4lle"} />

          <Divider label="Vergleich" />
          <CompareBar labelL={"\ud83d\udce6 Service"} labelR={"\ud83d\udc69\u200d\u2695\ufe0f Angestellte ZMV"} valL={weg1.preis + zusatzSumme} valR={zmvMonat} />
          <Row label="Monatspreis Service" value={eur(weg1.preis + zusatzSumme)} border />
          <Row label="Fixkosten ZMV / Monat" value={eur(zmvMonat)} border />
          {zmvMonat > weg1.preis + zusatzSumme ? (
            <div className="bg-green-100 text-green-800 rounded-lg p-3 text-sm font-bold text-center mt-2">
              {"\u2705"} Ersparnis: {eur(zmvMonat - weg1.preis - zusatzSumme)} / Monat = {eur((zmvMonat - weg1.preis - zusatzSumme) * 12)} / Jahr
            </div>
          ) : (
            <div className="bg-red-100 text-red-800 rounded-lg p-3 text-sm font-bold text-center mt-2">
              {"\u26a0\ufe0f"} Mehrkosten: {eur(weg1.preis + zusatzSumme - zmvMonat)} / Monat
            </div>
          )}

          <div className="mt-4 bg-gray-50 rounded-xl p-4">
            <h3 className="text-sm font-bold text-gray-600 mb-2">Weitere Vorteile</h3>
            <div className="grid grid-cols-2 gap-1 text-sm text-gray-500">
              <span>{"\u2705"} Kein Ausfall bei Urlaub/Krankheit</span>
              <span>{"\u2705"} Keine Lohnfortzahlung bei Ausfall</span>
              <span>{"\u2705"} Keine Einarbeitungskosten</span>
              <span>{"\u2705"} Flexibel skalierbar</span>
            </div>
          </div>
        </div>
      )}

      {/* ================= WEG 2 ================= */}
      {tab === "weg2" && (
        <div className="space-y-2">
          <div className="bg-brand-50 rounded-xl p-4 mb-2">
            <h2 className="font-bold text-brand-700 mb-3">{"\ud83d\udcc9"} Weg 2: Fallzahlen / Woche</h2>
            <InputNum label={"F\u00e4lle pro Woche"} value={faelleWoche} onChange={(v: number) => setFaelleWoche(Math.max(0, Math.round(v)))} unit={"F\u00e4lle"} min={0} />
            <InputNum label="Behandler in der Praxis" value={behandler} onChange={(v: number) => setBehandler(Math.max(1, Math.round(v)))} unit="Behandler" min={1} />
            <p className="text-xs text-gray-400">{"\u2248"} {Math.round(faelleWoche * gkv / 100)} GKV {"\u00b7"} {Math.round(faelleWoche * pkv / 100)} PKV {"\u00b7"} {Math.max(0, faelleWoche - Math.round(faelleWoche * gkv / 100) - Math.round(faelleWoche * pkv / 100))} BEL</p>
          </div>

          <Row label={"\u00d8 Std. pro Behandler / Woche"} value={num1(weg2.sph) + " Std."} border />
          <div className="flex items-center">
            <span className="text-sm text-gray-500">{"Plausibilit\u00e4t"}</span>
            <Ampel val={weg2.sph} lo={ampelGruen} hi={ampelGelb} />
          </div>

          <Divider label="Kalkulation" />
          <Row label={"Ben\u00f6tigte Service-Std. / Woche"} value={num1(weg2.stdWoche) + " Std."} />
          <Row label="Service-Std. / Monat" value={num1(weg2.stdWoche * AW) + " Std."} />
          <Row label="Personalkosten / Monat" value={eur(weg2.pk)} />
          <Row label="Fixkosten / Monat" value={eur(fix)} sub />
          <Row label="Gesamtkosten / Monat" value={eur(weg2.gk)} border />
          <Row label={"\ud83c\udff7\ufe0f Basispreis / Monat (inkl. " + marge + "% Marge)"} value={eur(weg2.preis)} highlight />

          {zusatzSumme > 0 && (
            <>
              <Divider label="Zusatzleistungen" />
              <Row label="+ Zusatzleistungen / Monat" value={eur(zusatzSumme)} border />
              <Row label="= Gesamtpreis / Monat" value={eur(weg2.preis + zusatzSumme)} highlight />
            </>
          )}

          <Divider />
          <Row label="Stundensatz" value={weg2.stdWoche * AW > 0 ? eur(weg2.preis / (weg2.stdWoche * AW)) + " / Std." : "\u2013"} />

          <Divider label="Vergleich" />
          <CompareBar labelL={"\ud83d\udce6 Service"} labelR={"\ud83d\udc69\u200d\u2695\ufe0f Angestellte ZMV"} valL={weg2.preis + zusatzSumme} valR={zmvMonat} />
          <Row label="Monatspreis Service" value={eur(weg2.preis + zusatzSumme)} border />
          <Row label="Fixkosten ZMV / Monat" value={eur(zmvMonat)} border />
          {zmvMonat > weg2.preis + zusatzSumme ? (
            <div className="bg-green-100 text-green-800 rounded-lg p-3 text-sm font-bold text-center mt-2">
              {"\u2705"} Ersparnis: {eur(zmvMonat - weg2.preis - zusatzSumme)} / Monat = {eur((zmvMonat - weg2.preis - zusatzSumme) * 12)} / Jahr
            </div>
          ) : (
            <div className="bg-red-100 text-red-800 rounded-lg p-3 text-sm font-bold text-center mt-2">
              {"\u26a0\ufe0f"} Mehrkosten: {eur(weg2.preis + zusatzSumme - zmvMonat)} / Monat
            </div>
          )}

          <div className="mt-4 bg-gray-50 rounded-xl p-4">
            <h3 className="text-sm font-bold text-gray-600 mb-2">Weitere Vorteile</h3>
            <div className="grid grid-cols-2 gap-1 text-sm text-gray-500">
              <span>{"\u2705"} Kein Ausfall bei Urlaub/Krankheit</span>
              <span>{"\u2705"} Keine Lohnfortzahlung bei Ausfall</span>
              <span>{"\u2705"} Keine Einarbeitungskosten</span>
              <span>{"\u2705"} Flexibel skalierbar</span>
            </div>
          </div>
        </div>
      )}

      {/* ================= ZUSATZ ================= */}
      {tab === "zusatz" && (
        <div>
          <h2 className="font-bold text-brand-700 mb-3">{"\u2795"} Zusatzleistungen</h2>
          <p className="text-sm text-gray-500 mb-4">{"W\u00e4hlen Sie optionale Zusatzleistungen und geben Sie die gew\u00fcnschten Stunden pro Woche ein."}</p>
          {DEFAULT_SERVICES.map((s) => <ZusatzBlock key={s.id} s={s} />)}

          {bookedServices.length > 0 && (
            <div className="mt-4 bg-purple-50 rounded-xl p-4">
              <div className="flex justify-between mb-1">
                <span className="text-sm font-bold text-purple-800">Zusatz gesamt / Monat</span>
                <span className="font-mono font-bold text-purple-800">{eur(zusatzSumme)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-purple-500">Zusatz-Stunden / Monat</span>
                <span className="font-mono text-xs text-purple-500">{num1(zusatzStundenGesamt)} Std.</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= SETTINGS ================= */}
      {tab === "settings" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="font-bold text-gray-700 mb-3">{"\u2699\ufe0f"} Kalkulationsparameter</h2>
            <div className="grid grid-cols-2 gap-x-4">
              <InputNum label="Stundenlohn Service (AG)" value={lohn} onChange={setLohn} unit={"\u20ac"} step={0.5} />
              <InputNum label="Fixkosten / Monat" value={fix} onChange={setFix} unit={"\u20ac"} />
              <InputNum label="Ziel-Marge" value={marge} onChange={setMarge} unit="%" />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="font-bold text-gray-700 mb-3">{"\ud83e\ude7a"} Patientenmix</h2>
            <div className="grid grid-cols-3 gap-x-4">
              <InputNum label="GKV (%)" value={gkv} onChange={setGkv} unit="%" />
              <InputNum label="PKV (%)" value={pkv} onChange={setPkv} unit="%" />
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">BEL (%)</label>
                <div className="border-2 border-gray-200 rounded-lg px-3 py-1.5 text-sm font-mono text-right bg-gray-100 w-32">{bel}</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="font-bold text-gray-700 mb-3">{"\u23f1\ufe0f"} Bearbeitungszeiten (Min./Fall)</h2>
            <div className="grid grid-cols-3 gap-x-4">
              <InputNum label="GKV" value={minGKV} onChange={setMinGKV} unit="Min." min={1} />
              <InputNum label="PKV" value={minPKV} onChange={setMinPKV} unit="Min." min={1} />
              <InputNum label="BEL" value={minBEL} onChange={setMinBEL} unit="Min." min={1} />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="font-bold text-gray-700 mb-3">{"\ud83d\udc69\u200d\u2695\ufe0f"} Angestellte ZMV (Vergleichswerte)</h2>
            <div className="grid grid-cols-2 gap-x-4">
              <InputNum label="Stundenlohn ZMV" value={zmvLohn} onChange={setZmvLohn} unit={"\u20ac"} step={0.5} />
              <InputNum label="Wochenstunden" value={zmvWochenstd} onChange={setZmvWochenstd} unit="Std." min={1} />
              <InputNum label="Urlaubstage / Jahr" value={zmvUrlaub} onChange={(v: number) => setZmvUrlaub(Math.round(v))} unit="Tage" />
              <InputNum label="Krankheitstage / Jahr" value={zmvKrank} onChange={(v: number) => setZmvKrank(Math.round(v))} unit="Tage" />
            </div>
            <Divider />
            <Row label="Produktive Wochen / Jahr" value={num1(zmvProdWo)} />
            <Row label="Fixkosten ZMV / Monat" value={eur(zmvMonat)} border />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="font-bold text-gray-700 mb-3">{"\ud83d\udea6"} {"Plausibilit\u00e4ts-Ampel"}</h2>
            <div className="grid grid-cols-2 gap-x-4">
              <InputNum label={"Gr\u00fcn bis (Std./Behandler/Wo.)"} value={ampelGruen} onChange={setAmpelGruen} unit="Std." />
              <InputNum label="Gelb bis (Std./Behandler/Wo.)" value={ampelGelb} onChange={setAmpelGelb} unit="Std." />
            </div>
          </div>
        </div>
      )}

      {/* ================= EXCEL DOWNLOAD ================= */}
      <div className="mt-6">
        <button
          onClick={() => exportXlsx(tab, settings, weg1, weg2, bookedServices, zusatzSumme, zusatzStundenGesamt, inputs)}
          className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-sm transition-all shadow">
          {"\ud83d\udce5"} Kalkulation als Excel herunterladen
        </button>
      </div>
    </div>
  );
}
