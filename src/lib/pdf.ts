import jsPDF from "jspdf";
import { format, getISOWeek, addDays } from "date-fns";
import { de } from "date-fns/locale";
import type { Client, TimeEntry, Screenshot, Invoice, InvoicePosition } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDE(n: number, decimals = 2): string {
  return n.toFixed(decimals).replace(".", ",");
}

function minutesToHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}

function groupEntriesByDate(entries: TimeEntry[]): Map<string, TimeEntry[]> {
  const map = new Map<string, TimeEntry[]>();
  for (const e of entries) {
    const existing = map.get(e.date) ?? [];
    existing.push(e);
    map.set(e.date, existing);
  }
  return map;
}

function screenshotsForEntry(
  screenshots: Screenshot[],
  entryId: string
): Screenshot[] {
  return screenshots.filter((s) => s.time_entry_id === entryId);
}

// ---------------------------------------------------------------------------
// 1.  Weekly Report
// ---------------------------------------------------------------------------

export async function generateWeeklyReport(
  client: Client,
  entries: TimeEntry[],
  screenshots: Screenshot[],
  weekStart: Date,
  weekEnd: Date
): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const kw = getISOWeek(weekStart);
  const weekStartStr = format(weekStart, "dd.MM.yyyy", { locale: de });
  const weekEndStr = format(weekEnd, "dd.MM.yyyy", { locale: de });

  // --- Header ---
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("dental::21 \u2014 Wochenreport", margin, y);
  y += 10;

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(`Mandant: ${client.name}`, margin, y);
  y += 6;
  doc.text(`KW ${kw}, ${weekStartStr} \u2013 ${weekEndStr}`, margin, y);
  y += 10;

  // Divider
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // --- Entries grouped by date ---
  const grouped = groupEntriesByDate(entries);
  const sortedDates = Array.from(grouped.keys()).sort();
  let totalMinutes = 0;

  for (const dateStr of sortedDates) {
    const dayEntries = grouped.get(dateStr)!;
    const dayDate = new Date(dateStr);
    const dayLabel = format(dayDate, "EEEE, dd.MM.yyyy", { locale: de });

    if (y > 260) {
      doc.addPage();
      y = margin;
    }

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(dayLabel, margin, y);
    y += 6;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    let dayMinutes = 0;

    for (const entry of dayEntries) {
      const start = entry.start_time.substring(0, 5);
      const end = entry.end_time.substring(0, 5);
      const duration = minutesToHours(entry.duration_minutes);
      const line = `${start} \u2013 ${end}  (${duration} h)`;
      doc.text(line, margin + 4, y);

      if (entry.notes) {
        doc.setFont("helvetica", "italic");
        const notesLines = doc.splitTextToSize(entry.notes, contentWidth - 60);
        doc.text(notesLines, margin + 60, y);
        doc.setFont("helvetica", "normal");
      }

      dayMinutes += entry.duration_minutes;
      y += 5;

      // Screenshots info
      const entryScreenshots = screenshotsForEntry(screenshots, entry.id);
      if (entryScreenshots.length > 0) {
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text(
          `${entryScreenshots.length} Screenshot${entryScreenshots.length > 1 ? "s" : ""}`,
          margin + 8,
          y
        );
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        y += 5;
      }

      if (y > 270) {
        doc.addPage();
        y = margin;
      }
    }

    // Day subtotal
    doc.setFont("helvetica", "bold");
    doc.text(`Tagesgesamt: ${minutesToHours(dayMinutes)} h`, margin + 4, y);
    doc.setFont("helvetica", "normal");
    totalMinutes += dayMinutes;
    y += 8;
  }

  // --- Footer ---
  if (y > 250) {
    doc.addPage();
    y = margin;
  }

  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  const totalHours = totalMinutes / 60;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(`Gesamtstunden: ${formatDE(totalHours)} h`, margin, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Erstellt am ${format(new Date(), "dd.MM.yyyy", { locale: de })}`,
    margin,
    y
  );

  // Save
  const safeClientName = client.name.replace(/[^a-zA-Z0-9\u00e4\u00f6\u00fc\u00c4\u00d6\u00dc\u00df]/g, "_");
  const filename = `Wochenreport_${safeClientName}_KW${kw.toString().padStart(2, "0")}.pdf`;
  doc.save(filename);
}

// ---------------------------------------------------------------------------
// 2.  Invoice PDF
// ---------------------------------------------------------------------------

export function generateInvoicePdf(invoice: Invoice, client: Client): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = margin;

  // --- Company header ---
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("dental::21", margin, y);
  y += 7;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Patient 21 SE", margin, y);
  y += 5;
  doc.text("Musterstra\u00dfe 1, 12345 Musterstadt", margin, y);
  y += 5;
  doc.text("info@patient21.de | www.patient21.de", margin, y);
  y += 12;

  // --- Invoice meta (right-aligned) ---
  const metaX = pageWidth - margin;
  doc.setFontSize(10);
  doc.text(`Rechnungsnummer: ${invoice.invoice_number}`, metaX, y - 12, {
    align: "right",
  });
  const invoiceDate = format(new Date(invoice.created_at), "dd.MM.yyyy", {
    locale: de,
  });
  doc.text(`Datum: ${invoiceDate}`, metaX, y - 6, { align: "right" });

  const dueDate = format(
    addDays(new Date(invoice.created_at), invoice.payment_due_days),
    "dd.MM.yyyy",
    { locale: de }
  );
  doc.text(`F\u00e4llig bis: ${dueDate}`, metaX, y, { align: "right" });
  y += 4;

  // --- Client address ---
  doc.setFont("helvetica", "bold");
  doc.text(client.name, margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  if (client.address) {
    const addressLines = client.address.split("\n");
    for (const line of addressLines) {
      doc.text(line, margin, y);
      y += 5;
    }
  }
  y += 8;

  // --- Title ---
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Rechnung", margin, y);
  y += 4;

  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // --- Period ---
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const periodFrom = format(new Date(invoice.period_from), "dd.MM.yyyy", {
    locale: de,
  });
  const periodTo = format(new Date(invoice.period_to), "dd.MM.yyyy", {
    locale: de,
  });
  doc.text(`Leistungszeitraum: ${periodFrom} \u2013 ${periodTo}`, margin, y);
  y += 10;

  // --- Table header ---
  const colX = {
    datum: margin,
    beschreibung: margin + 24,
    stunden: margin + 100,
    einzelpreis: margin + 120,
    gesamt: margin + 148,
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Datum", colX.datum, y);
  doc.text("Beschreibung", colX.beschreibung, y);
  doc.text("Stunden", colX.stunden, y);
  doc.text("Einzelpreis", colX.einzelpreis, y);
  doc.text("Gesamt", colX.gesamt, y);
  y += 2;
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  // --- Table rows ---
  doc.setFont("helvetica", "normal");

  for (const pos of invoice.positions) {
    if (y > 255) {
      doc.addPage();
      y = margin;
    }

    const posDate = format(new Date(pos.date), "dd.MM.yyyy", { locale: de });
    doc.text(posDate, colX.datum, y);

    const descLines = doc.splitTextToSize(pos.description, 72);
    doc.text(descLines, colX.beschreibung, y);

    doc.text(formatDE(pos.hours), colX.stunden, y);
    doc.text(`${formatDE(pos.rate)} \u20ac`, colX.einzelpreis, y);
    doc.text(`${formatDE(pos.total)} \u20ac`, colX.gesamt, y);

    y += Math.max(descLines.length * 5, 6);
  }

  // --- Separator ---
  y += 2;
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // --- Summary ---
  const ust = invoice.total_gross - invoice.total_net;

  doc.setFont("helvetica", "normal");
  doc.text("Netto:", colX.einzelpreis, y);
  doc.text(`${formatDE(invoice.total_net)} \u20ac`, colX.gesamt, y);
  y += 6;

  doc.text("USt. 19%:", colX.einzelpreis, y);
  doc.text(`${formatDE(ust)} \u20ac`, colX.gesamt, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.text("Brutto:", colX.einzelpreis, y);
  doc.text(`${formatDE(invoice.total_gross)} \u20ac`, colX.gesamt, y);
  y += 14;

  // --- Payment info ---
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    `Zahlungsziel: ${invoice.payment_due_days} Tage (bis ${dueDate})`,
    margin,
    y
  );
  y += 6;

  doc.text("Bankverbindung:", margin, y);
  y += 5;
  doc.text("Patient 21 SE", margin + 4, y);
  y += 5;
  doc.text("IBAN: DE00 0000 0000 0000 0000 00", margin + 4, y);
  y += 5;
  doc.text("BIC: XXXXXXXXXXX", margin + 4, y);
  y += 12;

  // --- Footer ---
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  const footerY = doc.internal.pageSize.getHeight() - 15;
  doc.text(
    "Patient 21 SE | Steuernummer: 00/000/00000 | USt-IdNr.: DE000000000",
    pageWidth / 2,
    footerY,
    { align: "center" }
  );
  doc.setTextColor(0, 0, 0);

  // Save
  doc.save(`${invoice.invoice_number}.pdf`);
}
