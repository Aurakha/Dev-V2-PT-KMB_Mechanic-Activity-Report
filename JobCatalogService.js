/**
 * JobCatalogService.gs - Katalog Job 3-Section (v2: master FISIK terpisah)
 * 
 *   field    → Config_Jobs_Field
 *   workshop → Config_Jobs_Workshop
 *   tyreman  → Config_Components (alur lama, tidak lewat sini)
 * 
 * Section sebuah job = sheet asalnya. Tidak ada lagi deteksi prefix.
 * Dependencies: Constants.gs, Logger.gs, Sheets.gs, ResponseHelper.gs
 */

function _jobSheetForSection(section) {
  if (section === SECTIONS.FIELD) return SHEETS.CONFIG_JOBS_FIELD;
  if (section === SECTIONS.WORKSHOP) return SHEETS.CONFIG_JOBS_WORKSHOP;
  return null;
}

/**
 * Katalog flat untuk cascade UI.
 * Client: google.script.run.getJobCatalog('field'|'workshop')
 */
function getJobCatalog(section) {
  var timer = Log.startTimer('getJobCatalog');
  try {
    section = String(section || '').toLowerCase();
    var sheetName = _jobSheetForSection(section);
    if (!sheetName) {
      return errorResponse(ERROR_CODES.VALIDATION_INVALID_FORMAT,
        'Section tidak valid untuk katalog job: ' + section + ' (hanya field/workshop)');
    }
    
    var all = readSheetAsObjects(sheetName);
    var jobs = [];
    
    for (var i = 0; i < all.length; i++) {
      var j = all[i];
      if (!j.job_id) continue;
      if (j.is_active === false || String(j.is_active).toLowerCase() === 'false') continue;
      
      jobs.push({
        job_id: String(j.job_id),
        unit_model: String(j.unit_model || ''),
        component: String(j.component || ''),
        sub_component: String(j.sub_component || ''),
        job_description: String(j.job_description || ''),
        plan_hours: parseFloat(j.plan_hours) || 0,
        base_point: parseFloat(j.base_point) || 0,
        job_type: String(j.job_type || '')
      });
    }
    
    timer.end('Catalog loaded', {section: section, count: jobs.length});
    return successResponse({section: section, jobs: jobs});
    
  } catch (e) {
    Log.exception('getJobCatalog', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, 'Gagal memuat katalog job: ' + e.message);
  }
}

/**
 * Cari job di kedua sheet. @return {job, section} | null
 */
function getJobRecord(jobId) {
  if (!jobId) return null;
  var pairs = [
    [SHEETS.CONFIG_JOBS_FIELD, SECTIONS.FIELD],
    [SHEETS.CONFIG_JOBS_WORKSHOP, SECTIONS.WORKSHOP]
  ];
  for (var p = 0; p < pairs.length; p++) {
    var all = readSheetAsObjects(pairs[p][0]);
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].job_id) === String(jobId)) {
        return {job: all[i], section: pairs[p][1]};S
      }
    }
  }
  return null;
}

/** Kompatibilitas: dipakai ScoringService & MechanicService. */
function getJobById(jobId) {
  var rec = getJobRecord(jobId);
  return rec ? rec.job : null;
}

/**
 * Validasi job ↔ unit ↔ section saat create WO.
 * Section job = sheet asalnya; job cluster lain DITOLAK.
 */
function validateJobForSection(jobId, unitId, section) {
  var rec = getJobRecord(jobId);
  if (!rec) return {valid: false, error: 'Job tidak ditemukan: ' + jobId, job: null};
  var job = rec.job;
  if (job.is_active === false || String(job.is_active).toLowerCase() === 'false') {
    return {valid: false, error: 'Job tidak aktif: ' + jobId, job: null};
  }
  
  section = String(section || '').toLowerCase();
  if (rec.section !== section) {
    return {valid: false, error: 'Job ' + jobId + ' milik cluster ' + rec.section + ', bukan ' + section, job: null};
  }
  
  if (section === SECTIONS.WORKSHOP) {
    return {valid: true, error: null, job: job};
  }
  
  if (section === SECTIONS.FIELD) {
    if (!unitId) return {valid: false, error: 'Section field wajib memilih unit', job: null};
    
    var unit = getRowById(SHEETS.CONFIG_UNITS, unitId, 'unit_id');
    if (!unit) return {valid: false, error: 'Unit tidak ditemukan: ' + unitId, job: null};
    
    var unitModel = String(unit.unit_model || '').toLowerCase().trim();
    var jobModel = String(job.unit_model || '').toLowerCase().trim();
    if (unitModel !== jobModel) {
      return {valid: false, error: 'Job "' + job.job_description + '" (' + jobModel + 
              ') tidak cocok dengan unit ' + unitId + ' (' + (unitModel || 'tanpa model') + ')', job: null};
    }
    return {valid: true, error: null, job: job};
  }
  
  return {valid: false, error: 'Section tidak valid: ' + section, job: null};
}