/**
 * SplitJobsPrep (hapus).gs — SEKALI RUN, lalu HAPUS.
 * ① Pecah Config_Jobs → Config_Jobs_Field + Config_Jobs_Workshop (fisik terpisah)
 * ② Rename Config_Jobs → "Config_Jobs_OLD (hapus)" sebagai backup
 * ③ MechanicPoints: + kolom section, backfill dari WO (aktif & arsip)
 * Idempotent: aman di-run ulang.
 */
function runSplitJobsPrep() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var report = [];

  // ── ① & ② : pecah Config_Jobs ──
  var srcName = ss.getSheetByName('Config_Jobs') ? 'Config_Jobs' :
                (ss.getSheetByName('Config_Jobs_OLD (hapus)') ? 'Config_Jobs_OLD (hapus)' : null);
  if (!srcName) {
    report.push('❌ Config_Jobs / backup tidak ditemukan — split dilewati');
  } else if (ss.getSheetByName('Config_Jobs_Field') && ss.getSheetByName('Config_Jobs_Workshop')) {
    report.push('✓ Sheet split sudah ada — skip');
  } else {
    var src = ss.getSheetByName(srcName);
    var data = src.getDataRange().getValues();
    var headers = data[0];
    var umIdx = -1;
    for (var h = 0; h < headers.length; h++) {
      if (String(headers[h]).trim() === 'unit_model') umIdx = h;
    }
    if (umIdx === -1) {
      report.push('❌ kolom unit_model tidak ketemu — split dibatalkan');
    } else {
      var fieldRows = [headers], wsRows = [headers];
      for (var r = 1; r < data.length; r++) {
        if (!data[r][0]) continue;
        var isWs = String(data[r][umIdx] || '').toLowerCase().indexOf('comp ') === 0;
        (isWs ? wsRows : fieldRows).push(data[r]);
      }
      function writeSheet(name, rows) {
        var sh = ss.getSheetByName(name);
        if (!sh) sh = ss.insertSheet(name);
        sh.clearContents();
        sh.getRange(1, 1, rows.length, headers.length).setValues(rows);
        return rows.length - 1;
      }
      var nf = writeSheet('Config_Jobs_Field', fieldRows);
      var nw = writeSheet('Config_Jobs_Workshop', wsRows);
      report.push('➕ Config_Jobs_Field: ' + nf + ' job | Config_Jobs_Workshop: ' + nw + ' job');
      if (srcName === 'Config_Jobs') {
        src.setName('Config_Jobs_OLD (hapus)');
        report.push('➕ Config_Jobs di-rename → "Config_Jobs_OLD (hapus)" (hapus setelah yakin)');
      }
    }
  }

  // ── ③ : MechanicPoints.section + backfill ──
  var mp = ss.getSheetByName('MechanicPoints');
  if (!mp) {
    report.push('❌ MechanicPoints tidak ditemukan');
  } else {
    var mpLastCol = mp.getLastColumn();
    var mpHeaders = mp.getRange(1, 1, 1, mpLastCol).getValues()[0];
    var secIdx = -1, woIdx = -1;
    for (var m = 0; m < mpHeaders.length; m++) {
      var nm = String(mpHeaders[m]).trim();
      if (nm === 'section') secIdx = m + 1;
      if (nm === 'wo_id') woIdx = m + 1;
    }
    if (secIdx === -1) {
      mp.getRange(1, mpLastCol + 1).setValue('section');
      secIdx = mpLastCol + 1;
      report.push('➕ MechanicPoints.section dibuat di kolom ' + secIdx);
    } else {
      report.push('✓ MechanicPoints.section sudah ada (kolom ' + secIdx + ')');
    }
    // peta wo_id → section dari WO aktif + arsip
    var woSec = {};
    ['WorkOrders', 'WorkOrders_Archive'].forEach(function(nmSheet) {
      var sh = ss.getSheetByName(nmSheet);
      if (!sh || sh.getLastRow() < 2) return;
      var d = sh.getDataRange().getValues();
      var hd = d[0]; var idI = -1, scI = -1;
      for (var c = 0; c < hd.length; c++) {
        if (String(hd[c]).trim() === 'id') idI = c;
        if (String(hd[c]).trim() === 'section') scI = c;
      }
      if (idI === -1 || scI === -1) return;
      for (var rr = 1; rr < d.length; rr++) {
        if (d[rr][idI]) woSec[String(d[rr][idI])] = String(d[rr][scI] || '');
      }
    });
    var mpLastRow = mp.getLastRow();
    if (mpLastRow > 1 && woIdx > -1) {
      var mpData = mp.getRange(2, 1, mpLastRow - 1, Math.max(secIdx, mp.getLastColumn())).getValues();
      var filled = 0;
      for (var q = 0; q < mpData.length; q++) {
        if (!mpData[q][0]) continue;
        if (mpData[q][secIdx - 1] === '' || mpData[q][secIdx - 1] === null) {
          var sec = woSec[String(mpData[q][woIdx - 1])];
          mp.getRange(q + 2, secIdx).setValue(sec || 'tyreman');
          filled++;
        }
      }
      report.push('➕ MechanicPoints: ' + filled + ' baris section di-backfill');
    }
  }

  var out = report.join('\n');
  Logger.log('=== HASIL SPLIT JOBS PREP ===\n' + out);
  return out;
}