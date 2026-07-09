/**
 * ============================================================================
 * PayrollService.gs - Payroll Export Service
 * ============================================================================
 * v1.4 — Archive-aware: baca approved WO dari WorkOrders + WorkOrders_Archive
 * v1.3 — Scoring breakdown columns (Base×Unit×Kondisi×Waktu×Safety = WO Poin)
 *         untuk HR double-check di sheet Detail WO
 * v1.2 — Fix share 0% (baca percentage dari WorkOrderTeam, bukan MechanicPoints)
 *         Tambah kolom: Hour Meter, Kilometer, Safety Incident
 * v1.1 — IDR fix: pakai getIdrRate() dari ConfigService.gs
 * ============================================================================
 */

function generatePayrollReport(filterType, year, month, startDateStr, endDateStr) {
  var timer = Log.startTimer('generatePayrollReport');
  try {
    var authCheck = checkAuthorization([ROLES.SUPERVISOR, ROLES.SUPERINTENDENT]);
    if (isError(authCheck)) return authCheck;

    // ─── 1. DATE RANGE ────────────────────────────────────────────────────
    var startDate, endDate, periodLabel;
    if (filterType === 'month') {
      if (!year || !month) return errorResponse(ERROR_CODES.VALIDATION_REQUIRED, 'year dan month diperlukan');
      startDate = new Date(year, month - 1, 1, 0, 0, 0);
      endDate   = new Date(year, month, 0, 23, 59, 59);
      var monthNames = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
      periodLabel = monthNames[month - 1] + ' ' + year;
    } else {
      if (!startDateStr || !endDateStr) return errorResponse(ERROR_CODES.VALIDATION_REQUIRED, 'startDate dan endDate diperlukan');
      startDate = new Date(startDateStr + 'T00:00:00');
      endDate   = new Date(endDateStr + 'T23:59:59');
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return errorResponse(ERROR_CODES.VALIDATION_INVALID_DATE, 'Format tanggal tidak valid');
      if (startDate > endDate) return errorResponse(ERROR_CODES.VALIDATION_INVALID_DATE, 'startDate harus sebelum endDate');
      periodLabel = _formatDateId(startDate) + ' — ' + _formatDateId(endDate);
    }

    Log.info('generatePayrollReport', 'Period: ' + periodLabel);

    // ─── 2. IDR RATE ──────────────────────────────────────────────────────
    var idrRate = getIdrRate();
    Log.info('generatePayrollReport', 'IDR Rate: ' + idrRate);

    // ─── 3. APPROVED WOs IN DATE RANGE (archive-aware: WorkOrders + Archive) ─────
    var approvedWos = queryApprovedWorkOrders(function(wo) {
      var woDate = parseDate(wo.created_at);
      if (!woDate) return false;
      return woDate >= startDate && woDate <= endDate;
    });

    Log.info('generatePayrollReport', 'Approved WOs: ' + approvedWos.length);
    if (approvedWos.length === 0) return errorResponse('PAYROLL_NO_DATA', 'Tidak ada WO approved pada periode ' + periodLabel);

    var woMap = {};
    for (var i = 0; i < approvedWos.length; i++) woMap[approvedWos[i].id] = approvedWos[i];
    var woIds = Object.keys(woMap);

    // ─── 4. MECHANIC POINTS ───────────────────────────────────────────────
    var mpRows = queryRows(SHEETS.MECHANIC_POINTS, function(mp) {
      return woIds.indexOf(mp.wo_id) !== -1 && parseFloat(mp.points || 0) > 0;
    });

    // ─── 5. LOAD CONFIG + TEAM DATA ONCE ──────────────────────────────────
    var allMechanics = {};
    var mechList = getMechanicsByRole(ROLES.MECHANIC);
    for (var m = 0; m < mechList.length; m++) allMechanics[mechList[m].mechanic_id] = mechList[m];

    var compMap = {};
    var allComps = loadComponents();
    for (var c = 0; c < allComps.length; c++) compMap[allComps[c].component_no] = allComps[c];

    // (v1.3: team percentage sekarang dihitung dari data aktual, tidak perlu load WorkOrderTeam)

    // ── v1.3: Load ScoringSnapshots for breakdown columns ──
    var snapshotMap = {};
    var allSnaps = queryRows(SHEETS.SCORING_SNAPSHOTS, function() { return true; });
    for (var ss = 0; ss < allSnaps.length; ss++) {
      snapshotMap[allSnaps[ss].wo_id] = allSnaps[ss];
    }

    // ─── 6. BUILD DETAIL ROWS ─────────────────────────────────────────────
    var detailRows = [];
    var mechanicMap = {};

    for (var d = 0; d < mpRows.length; d++) {
      var mp = mpRows[d];
      var wo = woMap[mp.wo_id];
      if (!wo) continue;

      var mechanicId   = mp.mechanic_id;
      var points       = parseFloat(mp.points || 0);

      var mechInfo     = allMechanics[mechanicId];
      var mechanicName = mechInfo ? mechInfo.mechanic_name : mechanicId;
      var mechPosition = (mechInfo && mechInfo.position) ? String(mechInfo.position) : '';
      var mechRate     = getRateForMechanic(mechanicId);  // ← rate per jabatan
      var idr          = points * mechRate;

      var isOthers     = (wo.component_id === 'COM-OTHERS');
      var componentName;
      if (isOthers) {
        componentName = 'Others — ' + (wo.others_description || 'Custom Job');
      } else {
        var comp = compMap[wo.component_id];
        componentName = comp ? comp.component_name : wo.component_id;
      }

      var kondisi = wo.work_condition === 'normal'   ? 'Ringan' :
                    wo.work_condition === 'difficult' ? 'Sedang' :
                    wo.work_condition === 'extreme'   ? 'Berat'  : (wo.work_condition || '-');

      // ── v1.2: safety_incident flag ──
      var hasSafety = wo.safety_incident === true || wo.safety_incident === 'true' || wo.safety_incident === 'TRUE';

      // ── v1.3: Scoring breakdown from ScoringSnapshots ──
      var snap = snapshotMap[mp.wo_id];
      var snapBase   = snap ? parseFloat(snap.base_points || 0) : 0;
      var snapUnit   = snap ? parseFloat(snap.unit_factor || 1) : 1;
      var snapWC     = snap ? parseFloat(snap.work_condition_factor || 1) : 1;
      var snapTime   = snap ? parseFloat(snap.timeliness_factor || 1) : 1;
      var snapSafety = snap ? parseFloat(snap.safety_factor || 1) : (hasSafety ? 0 : 1);
      var snapMtbf   = snap ? parseFloat(snap.mtbf_factor || 1) : 1;
      var snapFinal  = snap ? parseFloat(snap.final_score || 0) : parseFloat(wo.final_points || 0);

      // ── v1.3 FIX: Hitung share% dari data aktual (bulletproof vs override) ──
      var percentage = (snapFinal > 0) ? Math.round((points / snapFinal) * 10000) / 100 : 0;

      detailRows.push({
        mechanic_id: mechanicId, mechanic_name: mechanicName,
        wo_number: wo.wo_number || wo.id, component: componentName,
        kondisi: kondisi, actual_hours: parseFloat(wo.actual_hours || 0),
        hour_meter: wo.hour_meter || '', kilometers: wo.kilometers || '',
        // scoring breakdown
        snap_base: snapBase, snap_unit: snapUnit, snap_wc: snapWC,
        snap_time: snapTime, snap_safety: snapSafety, snap_mtbf: snapMtbf, snap_wo_points: snapFinal,
        // mechanic share
        safety_incident: hasSafety,
        percentage: percentage, points: points, idr: idr,
        created_at: _formatDateId(parseDate(wo.created_at))
      });

      if (!mechanicMap[mechanicId]) {
        mechanicMap[mechanicId] = {mechanic_id: mechanicId, mechanic_name: mechanicName, position: mechPosition, rate: mechRate, wo_count: 0, total_points: 0, total_idr: 0};
      }
      mechanicMap[mechanicId].wo_count++;
      mechanicMap[mechanicId].total_points += points;
      mechanicMap[mechanicId].total_idr    += idr;
    }

    detailRows.sort(function(a, b) {
      if (a.mechanic_name < b.mechanic_name) return -1;
      if (a.mechanic_name > b.mechanic_name) return 1;
      if (a.wo_number < b.wo_number) return -1;
      if (a.wo_number > b.wo_number) return 1;
      return 0;
    });

    var summaryRows = [];
    for (var key in mechanicMap) {
      if (mechanicMap.hasOwnProperty(key)) summaryRows.push(mechanicMap[key]);
    }
    summaryRows.sort(function(a, b) { return b.total_points - a.total_points; });

    var grandTotalPoints = 0, grandTotalIdr = 0, grandTotalWos = 0;
    for (var s = 0; s < summaryRows.length; s++) {
      grandTotalPoints += summaryRows[s].total_points;
      grandTotalIdr    += summaryRows[s].total_idr;
      grandTotalWos    += summaryRows[s].wo_count;
    }

    // ─── 7. CREATE SPREADSHEET ────────────────────────────────────────────
    var filename = 'Payroll_' + periodLabel.replace(/[^a-zA-Z0-9]/g, '_');
    var newSS    = SpreadsheetApp.create(filename);
    var generatedAt = _formatDateId(new Date()) + ' ' + new Date().toLocaleTimeString('id-ID');

    var sheet1 = newSS.getActiveSheet();
    sheet1.setName('Ringkasan');
    _buildSummarySheet(sheet1, summaryRows, periodLabel, generatedAt, grandTotalPoints, grandTotalIdr, grandTotalWos, idrRate);

    var sheet2 = newSS.insertSheet('Detail WO');
    _buildDetailSheet(sheet2, detailRows, periodLabel, generatedAt);

    var ssId        = newSS.getId();
    var ssUrl       = newSS.getUrl();
    var downloadUrl = 'https://docs.google.com/spreadsheets/d/' + ssId + '/export?format=xlsx&id=' + ssId;

    timer.end('Payroll generated', {period: periodLabel, mechanics: summaryRows.length, wos: approvedWos.length, idrRate: idrRate});

    return successResponse({
      url: ssUrl, download_url: downloadUrl, filename: filename + '.xlsx', period: periodLabel,
      summary: {total_mechanics: summaryRows.length, total_wos: grandTotalWos, total_points: roundTo(grandTotalPoints, 2), total_idr: Math.round(grandTotalIdr)}
    });

  } catch (e) {
    Log.exception('generatePayrollReport', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

// ============================================================================
// SHEET BUILDERS
// ============================================================================

function _buildSummarySheet(sheet, summaryRows, periodLabel, generatedAt, grandTotalPoints, grandTotalIdr, grandTotalWos, idrRate) {
  sheet.getRange('A1').setValue('LAPORAN PAYROLL INSENTIF MEKANIK');
  sheet.getRange('A2').setValue('Periode: ' + periodLabel);
  sheet.getRange('A3').setValue('Dibuat: ' + generatedAt);
  sheet.getRange('A4').setValue('Rate per poin: bervariasi per jabatan (lihat kolom Rate/Poin)');

  sheet.getRange('A1:H1').merge();
  sheet.getRange('A1').setFontSize(14).setFontWeight('bold').setBackground('#f59e0b').setFontColor('white').setHorizontalAlignment('center');
  sheet.getRange('A2').setFontStyle('italic').setFontColor('#b45309 ');
  sheet.getRange('A3').setFontStyle('italic').setFontColor('#6b7280');
  sheet.getRange('A4').setFontStyle('italic').setFontColor('#6b7280');

  var headerRow = 6;
  var headers = ['No', 'Nama Mekanik', 'Jabatan', 'Mechanic ID', 'Total WO Selesai', 'Total Poin', 'Rate/Poin', 'Total IDR (Rp)'];
  for (var h = 0; h < headers.length; h++) sheet.getRange(headerRow, h + 1).setValue(headers[h]);
  sheet.getRange(headerRow, 1, 1, headers.length)
    .setFontWeight('bold').setBackground('#f59e0b').setFontColor('white')
    .setHorizontalAlignment('center').setBorder(true, true, true, true, true, true);

  for (var r = 0; r < summaryRows.length; r++) {
    var row = summaryRows[r];
    var rowNum = headerRow + 1 + r;
    var bg = r % 2 === 0 ? '#f8fafc' : 'white';
    sheet.getRange(rowNum, 1).setValue(r + 1);
    sheet.getRange(rowNum, 2).setValue(row.mechanic_name);
    sheet.getRange(rowNum, 3).setValue(row.position || '-');
    sheet.getRange(rowNum, 4).setValue(row.mechanic_id);
    sheet.getRange(rowNum, 5).setValue(row.wo_count);
    sheet.getRange(rowNum, 6).setValue(roundTo(row.total_points, 2));
    sheet.getRange(rowNum, 7).setValue(Math.round(row.rate || 0));
    sheet.getRange(rowNum, 8).setValue(Math.round(row.total_idr));
    sheet.getRange(rowNum, 1, 1, 8).setBackground(bg).setBorder(null, true, null, true, true, null, '#e5e7eb', SpreadsheetApp.BorderStyle.SOLID);
    sheet.getRange(rowNum, 6).setNumberFormat('#,##0.##');
    sheet.getRange(rowNum, 7).setNumberFormat('"Rp "#,##0');
    sheet.getRange(rowNum, 8).setNumberFormat('"Rp "#,##0');
  }

  var totalRow = headerRow + 1 + summaryRows.length;
  sheet.getRange(totalRow, 1, 1, 8).setBackground('#f59e0b').setFontColor('white').setFontWeight('bold');
  sheet.getRange(totalRow, 2).setValue('TOTAL');
  sheet.getRange(totalRow, 5).setValue(grandTotalWos);
  sheet.getRange(totalRow, 6).setValue(roundTo(grandTotalPoints, 2));
  sheet.getRange(totalRow, 8).setValue(Math.round(grandTotalIdr));
  sheet.getRange(totalRow, 8).setNumberFormat('"Rp "#,##0');
  sheet.getRange(totalRow, 6).setNumberFormat('#,##0.##');

  sheet.setColumnWidth(1, 40); sheet.setColumnWidth(2, 200); sheet.setColumnWidth(3, 120);
  sheet.setColumnWidth(4, 140); sheet.setColumnWidth(5, 120); sheet.setColumnWidth(6, 110);
  sheet.setColumnWidth(7, 100); sheet.setColumnWidth(8, 160);
  sheet.setFrozenRows(headerRow);
}

function _buildDetailSheet(sheet, detailRows, periodLabel, generatedAt) {
  // ── v1.4: 18 kolom dengan scoring breakdown + MTBF untuk HR double-check ──
  sheet.getRange('A1').setValue('DETAIL WO PER MEKANIK — ' + periodLabel);
  sheet.getRange('A1:R1').merge();
  sheet.getRange('A1').setFontSize(12).setFontWeight('bold').setBackground('#f59e0b').setFontColor('white').setHorizontalAlignment('center');
  sheet.getRange('A2').setValue('Dibuat: ' + generatedAt).setFontStyle('italic').setFontColor('#6b7280');
  sheet.getRange('A3').setValue('Formula: Base Pts × Unit × Kondisi × Waktu × Safety × MTBF = WO Poin → Share% → Poin Mekanik').setFontStyle('italic').setFontColor('#b45309 ').setFontSize(9);

  var headerRow = 5;
  var headers = ['No', 'Nama Mekanik', 'WO Number', 'Component', 'Kondisi', 'Actual Hours', 'HM', 'KM',
                 'Base Pts', '×Unit', '×Kondisi', '×Waktu', '×Safety', '×MTBF', 'WO Poin', 'Share %', 'Poin Mekanik', 'IDR (Rp)'];
  for (var h = 0; h < headers.length; h++) sheet.getRange(headerRow, h + 1).setValue(headers[h]);

  // Header styling: info columns blue, scoring columns green, result columns dark
  var colCount = headers.length;
  sheet.getRange(headerRow, 1, 1, colCount)
    .setFontWeight('bold').setFontColor('white').setHorizontalAlignment('center')
    .setBorder(true, true, true, true, true, true);
  sheet.getRange(headerRow, 1, 1, 8).setBackground('#f59e0b');   // info cols
  sheet.getRange(headerRow, 9, 1, 6).setBackground('#ad1457');   // scoring factors (green) — now 6 cols (incl MTBF)
  sheet.getRange(headerRow, 15, 1, 4).setBackground('#b45309 ');  // result cols (dark)

  var lastMechanicName = '';
  var bgA = '#f0f9ff', bgB = '#f9fafb';
  var currentBg = bgA;
  for (var r = 0; r < detailRows.length; r++) {
    var row = detailRows[r];
    var rowNum = headerRow + 1 + r;
    if (row.mechanic_name !== lastMechanicName) {
      currentBg = currentBg === bgA ? bgB : bgA;
      lastMechanicName = row.mechanic_name;
    }
    sheet.getRange(rowNum, 1).setValue(r + 1);
    sheet.getRange(rowNum, 2).setValue(row.mechanic_name);
    sheet.getRange(rowNum, 3).setValue(row.wo_number);
    sheet.getRange(rowNum, 4).setValue(row.component);
    sheet.getRange(rowNum, 5).setValue(row.kondisi);
    sheet.getRange(rowNum, 6).setValue(row.actual_hours);
    sheet.getRange(rowNum, 7).setValue(row.hour_meter || '');
    sheet.getRange(rowNum, 8).setValue(row.kilometers || '');
    // scoring breakdown
    sheet.getRange(rowNum, 9).setValue(row.snap_base);
    sheet.getRange(rowNum, 10).setValue(row.snap_unit);
    sheet.getRange(rowNum, 11).setValue(row.snap_wc);
    sheet.getRange(rowNum, 12).setValue(row.snap_time);
    sheet.getRange(rowNum, 13).setValue(row.snap_safety);
    sheet.getRange(rowNum, 14).setValue(row.snap_mtbf);
    sheet.getRange(rowNum, 15).setValue(row.snap_wo_points);
    // mechanic share
    sheet.getRange(rowNum, 16).setValue(row.percentage / 100);
    sheet.getRange(rowNum, 17).setValue(row.points);
    sheet.getRange(rowNum, 18).setValue(Math.round(row.idr));

    sheet.getRange(rowNum, 1, 1, colCount).setBackground(currentBg)
      .setBorder(null, true, null, true, true, null, '#e5e7eb', SpreadsheetApp.BorderStyle.SOLID);

    // Number formats
    sheet.getRange(rowNum, 6).setNumberFormat('#,##0.##');
    sheet.getRange(rowNum, 7).setNumberFormat('#,##0');
    sheet.getRange(rowNum, 8).setNumberFormat('#,##0');
    sheet.getRange(rowNum, 9).setNumberFormat('#,##0.##');
    sheet.getRange(rowNum, 10).setNumberFormat('0.00');
    sheet.getRange(rowNum, 11).setNumberFormat('0.00');
    sheet.getRange(rowNum, 12).setNumberFormat('0.00');
    sheet.getRange(rowNum, 13).setNumberFormat('0.0');
    sheet.getRange(rowNum, 14).setNumberFormat('0.00');
    sheet.getRange(rowNum, 15).setNumberFormat('#,##0.##');
    sheet.getRange(rowNum, 16).setNumberFormat('0.0%');
    sheet.getRange(rowNum, 17).setNumberFormat('#,##0.##');
    sheet.getRange(rowNum, 18).setNumberFormat('"Rp "#,##0');

    // Safety = 0 → red highlight (safety col 13, WO Poin col 15)
    if (row.snap_safety === 0) {
      sheet.getRange(rowNum, 13).setBackground('#fee2e2').setFontColor('#991b1b').setFontWeight('bold');
      sheet.getRange(rowNum, 15).setBackground('#fee2e2').setFontColor('#991b1b').setFontWeight('bold');
    }
  }

  sheet.setColumnWidth(1, 35); sheet.setColumnWidth(2, 180); sheet.setColumnWidth(3, 155);
  sheet.setColumnWidth(4, 200); sheet.setColumnWidth(5, 70); sheet.setColumnWidth(6, 85);
  sheet.setColumnWidth(7, 60); sheet.setColumnWidth(8, 60);
  sheet.setColumnWidth(9, 70); sheet.setColumnWidth(10, 55); sheet.setColumnWidth(11, 65);
  sheet.setColumnWidth(12, 60); sheet.setColumnWidth(13, 60); sheet.setColumnWidth(14, 55);
  sheet.setColumnWidth(15, 75); sheet.setColumnWidth(16, 60); sheet.setColumnWidth(17, 90);
  sheet.setColumnWidth(18, 120);
  sheet.setFrozenRows(headerRow);
}

// ============================================================================
// HELPERS
// ============================================================================

function _formatDateId(date) {
  if (!date) return '-';
  try {
    var d = new Date(date);
    if (isNaN(d.getTime())) return String(date);
    return d.toLocaleDateString('id-ID', {day: '2-digit', month: 'short', year: 'numeric'});
  } catch(e) { return String(date); }
}

function _formatNumber(num) {
  return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}