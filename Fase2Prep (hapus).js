function runFase2Prep() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var report = [];
  ['WorkOrders', 'WorkOrders_Archive'].forEach(function(nm) {
    var sh = ss.getSheetByName(nm);
    if (!sh) { report.push('❌ ' + nm + ' tidak ada'); return; }
    ['keterangan', 'part_category'].forEach(function(hd) {
      var lastCol = sh.getLastColumn();
      var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
      for (var i = 0; i < headers.length; i++) {
        if (String(headers[i]).trim() === hd) { report.push('✓ ' + nm + '.' + hd + ' sudah ada'); return; }
      }
      sh.getRange(1, lastCol + 1).setValue(hd);
      report.push('➕ ' + nm + '.' + hd + ' dibuat di kolom ' + (lastCol + 1));
    });
  });
  Logger.log(report.join('\n'));
  return report.join('\n');
}