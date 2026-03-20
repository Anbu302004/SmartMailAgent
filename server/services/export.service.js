'use strict';

const ExcelJS    = require('exceljs');
const EmailModel = require('../models/email.model');

// ─── Style constants ──────────────────────────────────────────────────────────

const HEADER_FILL = {
  type: 'pattern', pattern: 'solid',
  fgColor: { argb: 'FF1F3864' },   // dark navy
};
const HEADER_FONT   = { name: 'Calibri', bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
const ROW_FONT      = { name: 'Calibri', size: 10 };
const BORDER_STYLE  = { style: 'thin', color: { argb: 'FFD0D0D0' } };
const CELL_BORDER   = { top: BORDER_STYLE, left: BORDER_STYLE, bottom: BORDER_STYLE, right: BORDER_STYLE };

const COLUMNS = [
  { header: 'Company',     key: 'company_name',     width: 20 },
  { header: 'Sender',      key: 'sender',            width: 32 },
  { header: 'Subject',     key: 'subject',           width: 40 },
  { header: 'Date',        key: 'email_date',        width: 20 },
  { header: 'Attachments', key: 'attachment_names',  width: 30 },
  { header: 'Description', key: 'description',       width: 50 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format email_date as "DD/MM/YYYY HH:MM" for readability.
 */
function formatDate(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d)) return String(raw);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Flatten attachment_names JSON column to a comma-separated string.
 * Handles string (raw DB value), array, or null gracefully.
 */
function formatAttachments(raw) {
  if (!raw) return '';
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr.join(', ') : String(raw);
  } catch {
    return String(raw);
  }
}

/**
 * Strip HTML tags from description if the body was stored as HTML.
 */
function stripHtml(text) {
  if (!text) return '';
  return String(text).replace(/<[^>]*>/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

// ─── Service ──────────────────────────────────────────────────────────────────

const ExportService = {
  /**
   * Build an Excel workbook buffer for all emails belonging to a user.
   * Optionally scoped to a single company folder via `companyId`.
   *
   * @param {number}      userId
   * @param {number|null} companyId   - optional company filter
   * @returns {Promise<{ buffer: Buffer, filename: string, rowCount: number }>}
   */
  generateExcel: async (userId, companyId = null) => {
    const emails = await EmailModel.findForExport(userId, companyId);

    const workbook  = new ExcelJS.Workbook();
    workbook.creator  = 'SmartMail Agent';
    workbook.created  = new Date();

    const sheet = workbook.addWorksheet('Emails', {
      views: [{ state: 'frozen', ySplit: 1 }],   // freeze header row
    });

    // ── Columns ────────────────────────────────────────────────────────────
    sheet.columns = COLUMNS;

    // ── Header styling ─────────────────────────────────────────────────────
    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.fill   = HEADER_FILL;
      cell.font   = HEADER_FONT;
      cell.border = CELL_BORDER;
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
    });
    headerRow.height = 22;

    // ── Data rows ──────────────────────────────────────────────────────────
    emails.forEach((email, idx) => {
      const row = sheet.addRow({
        company_name:     email.company_name,
        sender:           email.sender,
        subject:          email.subject,
        email_date:       formatDate(email.email_date),
        attachment_names: formatAttachments(email.attachment_names),
        description:      stripHtml(email.description),
      });

      // Alternate row shading for readability
      const bgColor = idx % 2 === 0 ? 'FFFAFAFA' : 'FFEEEEEE';
      row.eachCell((cell) => {
        cell.font      = ROW_FONT;
        cell.border    = CELL_BORDER;
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        cell.alignment = { vertical: 'top', wrapText: true };
      });

      row.height = 18;
    });

    // ── Auto-filter on header ──────────────────────────────────────────────
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to:   { row: 1, column: COLUMNS.length },
    };

    // ── Build filename: SmartMail_Export_2026-03-19.xlsx ──────────────────
    const today    = new Date().toISOString().slice(0, 10);
    const filename = `SmartMail_Export_${today}.xlsx`;

    const buffer = await workbook.xlsx.writeBuffer();
    return { buffer, filename, rowCount: emails.length };
  },
};

module.exports = ExportService;
