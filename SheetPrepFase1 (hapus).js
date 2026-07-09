/**
 * SheetPrepFase1 (hapus).gs — SEKALI RUN, lalu HAPUS file ini.
 * 
 * Menjalankan checklist prep Fase 1:
 *  ① WorkOrders        : + kolom section, job_id
 *  ② WorkOrders_Archive: + kolom section, job_id (header harus identik dgn WorkOrders)
 *  ③ Config_Mechanics  : + kolom section, auto-isi 'tyreman' utk role=mechanic yang kosong
 *  ④ Config_Jobs       : perbaiki typo unit_model 'comp final drive rebuiled' → '...rebuild'
 *  ⑤ Config_Components : COM-005 base_points 0.75 → 0.625 (hanya jika nilainya 0.75)
 * 
 * Cara pakai: pilih fungsi runSheetPrepFase1 → Run → buka Executions/Log,
 * copy hasil lognya untuk verifikasi.
 * Idempotent: run kedua tidak merusak apa pun.
 */
function runSheetPrepFase1() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var report = [];

  // ── helper: pastikan kolom header ada; return index kolom (1-based) ──
  function ensureColumn(sheetName, headerName) {
    var sh = ss.getSheetByName(sheetName);
    if (!sh) { report.push('❌ ' + sheetName + ': sheet TIDAK DITEMUKAN'); return -1; }
    var lastCol = sh.getLastColumn();
    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    for (var i = 0; i < headers.length; i++) {
      if (String(headers[i]).trim() === headerName) {
        report.push('✓ ' + sheetName + '.' + headerName + ' sudah ada (kolom ' + (i + 1) + ') — skip');
        return i + 1;
      }
    }
    sh.getRange(1, lastCol + 1).setValue(headerName);
    report.push('➕ ' + sheetName + '.' + headerName + ' dibuat di kolom ' + (lastCol + 1));
    return lastCol + 1;
  }

  // ── ① & ② : kolom section + job_id ──
  ensureColumn('WorkOrders', 'section');
  ensureColumn('WorkOrders', 'job_id');
  ensureColumn('WorkOrders_Archive', 'section');
  ensureColumn('WorkOrders_Archive', 'job_id');

  // ── ③ : Config_Mechanics.section + auto-isi mekanik ──
  var secCol = ensureColumn('Config_Mechanics', 'section');
  if (secCol > 0) {
    var msh = ss.getSheetByName('Config_Mechanics');
    var mLastRow = msh.getLastRow();
    if (mLastRow > 1) {
      var mHeaders = msh.getRange(1, 1, 1, msh.getLastColumn()).getValues()[0];
      var roleIdx = -1, idIdx = -1;
      for (var h = 0; h < mHeaders.length; h++) {
        if (String(mHeaders[h]).trim() === 'role') roleIdx = h;
        if (String(mHeaders[h]).trim() === 'mechanic_id') idIdx = h;
      }
      if (roleIdx === -1 || idIdx === -1) {
        report.push('❌ Config_Mechanics: kolom role/mechanic_id tidak ketemu — isi section manual');
      } else {
        var mData = msh.getRange(2, 1, mLastRow - 1, msh.getLastColumn()).getValues();
        var filled = 0;
        for (var r = 0; r < mData.length; r++) {
          if (!mData[r][idIdx]) continue;
          var curSec = mData[r][secCol - 1];
          if ((curSec === '' || curSec === null) &&
              String(mData[r][roleIdx]).toLowerCase().trim() === 'mechanic') {
            msh.getRange(r + 2, secCol).setValue('tyreman');
            filled++;
          }
        }
        report.push('➕ Config_Mechanics: ' + filled + ' mekanik diisi section=tyreman ' +
                    '(role approver sengaja dibiarkan kosong — mereka lihat semua section)');
      }
    }
  }

  // ── ④ : typo unit_model di Config_Jobs (batch, 1x setValues) ──
  var jsh = ss.getSheetByName('Config_Jobs');
  if (!jsh) {
    report.push('❌ Config_Jobs: sheet TIDAK DITEMUKAN');
  } else {
    var jHeaders = jsh.getRange(1, 1, 1, jsh.getLastColumn()).getValues()[0];
    var umIdx = -1;
    for (var jh = 0; jh < jHeaders.length; jh++) {
      if (String(jHeaders[jh]).trim() === 'unit_model') umIdx = jh + 1;
    }
    if (umIdx === -1) {
      report.push('❌ Config_Jobs: kolom unit_model tidak ketemu');
    } else {
      var jLastRow = jsh.getLastRow();
      var umRange = jsh.getRange(2, umIdx, jLastRow - 1, 1);
      var umVals = umRange.getValues();
      var fixCount = 0;
      for (var jr = 0; jr < umVals.length; jr++) {
        if (String(umVals[jr][0]).toLowerCase().trim() === 'comp final drive rebuiled') {
          umVals[jr][0] = 'comp final drive rebuild';
          fixCount++;
        }
      }
      if (fixCount > 0) {
        umRange.setValues(umVals);
        report.push('➕ Config_Jobs: ' + fixCount + ' baris typo "rebuiled" diperbaiki → "rebuild"');
      } else {
        report.push('✓ Config_Jobs: tidak ada typo "rebuiled" — skip');
      }
    }
  }

  // ── ⑤ : COM-005 base_points 0.75 → 0.625 (guarded) ──
  var csh = ss.getSheetByName('Config_Components');
  if (!csh) {
    report.push('❌ Config_Components: sheet TIDAK DITEMUKAN');
  } else {
    var cHeaders = csh.getRange(1, 1, 1, csh.getLastColumn()).getValues()[0];
    var noIdx = -1, bpIdx = -1;
    for (var ch = 0; ch < cHeaders.length; ch++) {
      var chName = String(cHeaders[ch]).trim();
      if (chName === 'component_no') noIdx = ch;
      if (chName === 'base_points') bpIdx = ch;
    }
    if (noIdx === -1 || bpIdx === -1) {
      report.push('❌ Config_Components: kolom component_no/base_points tidak ketemu');
    } else {
      var cData = csh.getRange(2, 1, csh.getLastRow() - 1, csh.getLastColumn()).getValues();
      var found = false;
      for (var cr = 0; cr < cData.length; cr++) {
        if (String(cData[cr][noIdx]).trim() === 'COM-005') {
          found = true;
          var curBp = parseFloat(cData[cr][bpIdx]);
          if (Math.abs(curBp - 0.625) < 0.0001) {
            report.push('✓ COM-005 base_points sudah 0.625 — skip');
          } else if (Math.abs(curBp - 0.75) < 0.0001) {
            csh.getRange(cr + 2, bpIdx + 1).setValue(0.625);
            report.push('➕ COM-005 base_points: 0.75 → 0.625');
          } else {
            report.push('⚠️ COM-005 base_points = ' + curBp + ' (bukan 0.75 / 0.625) — TIDAK diubah, cek manual!');
          }
          break;
        }
      }
      if (!found) report.push('❌ COM-005 tidak ditemukan di Config_Components');
    }
  }

  var out = report.join('\n');
  Logger.log('=== HASIL SHEET PREP FASE 1 ===\n' + out);
  return out;
}