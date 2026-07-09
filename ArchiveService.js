/**
 * ============================================================================
 * ArchiveService.gs - WorkOrder Archiving Engine
 * ============================================================================
 * v1.0 — Keep "hot" WorkOrders sheet small by moving approved WOs to archive.
 *
 * KONSEP:
 * - WorkOrders        = sheet PANAS (pending + aktif). Dibaca tiap doGet/submit/approve.
 * - WorkOrders_Archive = sheet DINGIN (approved). Dibaca hanya untuk view approved & payroll.
 *
 * SAFETY (sistem uang):
 * - archiveWorkOrder: APPEND ke arsip → VERIFIKASI ada di arsip → BARU hapus dari WorkOrders.
 *   Kalau append/verify gagal → TIDAK menghapus. WO tetap utuh & berfungsi di WorkOrders.
 * - Semua jalur baca approved pakai queryApprovedWorkOrders() yang membaca DUA sheet (union),
 *   jadi walau ada WO yang belum/ gagal terarsip, tetap ketemu. Tidak ada WO "hilang".
 *
 * PRASYARAT MANUAL:
 * - Buat sheet bernama "WorkOrders_Archive" dengan HEADER PERSIS SAMA seperti WorkOrders
 *   (urutan kolom boleh beda, yang penting nama header sama — objectToArray map by name).
 * ============================================================================
 */

var WORKORDERS_ARCHIVE_SHEET = 'WorkOrders_Archive';

/**
 * Pindahkan 1 WO dari WorkOrders ke WorkOrders_Archive (aman).
 * @return {boolean} true jika berhasil dipindah & dihapus dari WorkOrders.
 *                   false jika tidak (WO tetap di WorkOrders — aman).
 */
function archiveWorkOrder(woId) {
  var timer = Log.startTimer('archiveWorkOrder');
  try {
    if (!sheetExists(WORKORDERS_ARCHIVE_SHEET)) {
      Log.warn('archiveWorkOrder', 'Archive sheet belum ada — skip (WO tetap di WorkOrders)', {woId: woId});
      timer.end('No archive sheet');
      return false;
    }

    var wo = getRowById(SHEETS.WORK_ORDERS, woId, 'id');
    if (!wo) {
      // Sudah tidak di WorkOrders (mungkin sudah terarsip) — anggap selesai
      Log.info('archiveWorkOrder', 'WO tidak ada di WorkOrders (mungkin sudah terarsip)', {woId: woId});
      timer.end('Not in hot sheet');
      return false;
    }

    // 1. APPEND ke arsip
    var rowNum = appendRow(WORKORDERS_ARCHIVE_SHEET, wo);
    if (!rowNum) {
      Log.error('archiveWorkOrder', 'Append ke arsip GAGAL — WO TETAP di WorkOrders', {woId: woId});
      timer.end('Append failed');
      return false;
    }

    // 2. VERIFIKASI ada di arsip sebelum hapus
    var check = getRowById(WORKORDERS_ARCHIVE_SHEET, woId, 'id');
    if (!check) {
      Log.error('archiveWorkOrder', 'Verifikasi arsip GAGAL — WO TETAP di WorkOrders', {woId: woId});
      timer.end('Verify failed');
      return false;
    }

    // 3. Aman → hapus dari WorkOrders
    var deleted = deleteRow(SHEETS.WORK_ORDERS, woId, 'id');
    if (!deleted) {
      // Arsip sudah ada tapi hapus gagal → ada duplikat (di arsip & WorkOrders).
      // queryApprovedWorkOrders pakai dedup by id, jadi tidak dobel. Log untuk audit.
      Log.warn('archiveWorkOrder', 'Sudah di arsip tapi gagal hapus dari WorkOrders (duplikat sementara)', {woId: woId});
      timer.end('Delete failed (archived OK)');
      return true;
    }

    Log.info('archiveWorkOrder', 'WO diarsipkan', {woId: woId});
    timer.end('Archived');
    return true;
  } catch (e) {
    Log.exception('archiveWorkOrder', e, {woId: woId});
    timer.end('Failed');
    return false;
  }
}

/**
 * Cari WO di WorkOrders dulu, lalu fallback ke arsip.
 * @return {Object|null} {wo: {...}, sheet: 'WorkOrders'|'WorkOrders_Archive'} atau null.
 */
function getWorkOrderByIdAnySheet(woId) {
  if (!woId) return null;
  var wo = getRowById(SHEETS.WORK_ORDERS, woId, 'id');
  if (wo) return {wo: wo, sheet: SHEETS.WORK_ORDERS};
  if (sheetExists(WORKORDERS_ARCHIVE_SHEET)) {
    wo = getRowById(WORKORDERS_ARCHIVE_SHEET, woId, 'id');
    if (wo) return {wo: wo, sheet: WORKORDERS_ARCHIVE_SHEET};
  }
  return null;
}

/**
 * Ambil SEMUA WO (semua status) dari DUA sheet (WorkOrders + Archive), dedup by id.
 * Dipakai untuk statistik dashboard yang butuh hitungan lintas-history.
 * @return {Array} array objek WO.
 */
function readAllWorkOrdersBothSheets() {
  var seen = {};
  var all = [];
  function collect(rows) {
    for (var i = 0; i < rows.length; i++) {
      if (!seen[rows[i].id]) { seen[rows[i].id] = true; all.push(rows[i]); }
    }
  }
  collect(queryRows(SHEETS.WORK_ORDERS, function() { return true; }));
  if (sheetExists(WORKORDERS_ARCHIVE_SHEET)) {
    collect(queryRows(WORKORDERS_ARCHIVE_SHEET, function() { return true; }));
  }
  return all;
}

/**
 * Ambil semua WO approved dari DUA sheet (WorkOrders + Archive), dedup by id.
 * @param {Function} [extraFilter] - filter tambahan opsional (mis. by tanggal).
 * @return {Array} array objek WO approved.
 */
function queryApprovedWorkOrders(extraFilter) {
  var seen = {};
  var result = [];

  function collect(rows) {
    for (var i = 0; i < rows.length; i++) {
      var wo = rows[i];
      if (wo.status !== WO_STATUS.APPROVED) continue;
      if (seen[wo.id]) continue;          // dedup (jika sempat dobel)
      if (extraFilter && !extraFilter(wo)) continue;
      seen[wo.id] = true;
      result.push(wo);
    }
  }

  // Arsip dulu (mayoritas approved ada di sini), lalu WorkOrders (yang belum/gagal terarsip)
  if (sheetExists(WORKORDERS_ARCHIVE_SHEET)) {
    collect(queryRows(WORKORDERS_ARCHIVE_SHEET, function() { return true; }));
  }
  collect(queryRows(SHEETS.WORK_ORDERS, function() { return true; }));

  return result;
}