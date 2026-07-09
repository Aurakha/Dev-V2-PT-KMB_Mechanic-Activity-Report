/**
 * ============================================================================
 * BackupService.gs - Auto Backup Spreadsheet ke Google Drive
 * ============================================================================
 * 
 * Otomatis copy spreadsheet ke folder backup di Drive.
 * Jadwal: 06:00 dan 18:00 setiap hari (via time-driven trigger).
 * Retention: simpan 60 backup terakhir (≈30 hari), yang lebih lama dihapus otomatis.
 * 
 * Setup (1 kali saja):
 *   1. Paste file ini ke Apps Script
 *   2. Run setupBackupTriggers() sekali
 *   3. Selesai — backup jalan otomatis selamanya
 * ============================================================================
 */

var BACKUP_FOLDER_NAME = 'Backup_MechanicReport_KMB';
var BACKUP_RETENTION   = 60; // simpan 60 file terakhir (2x/hari × 30 hari)

/**
 * MAIN: Buat backup spreadsheet saat ini ke folder backup di Drive.
 * Dipanggil otomatis oleh trigger jam 06:00 dan 18:00.
 */
function runBackup() {
  var timer = Log.startTimer('runBackup');
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var folder = _getOrCreateBackupFolder();

    // Nama file: Backup_YYYY-MM-DD_HHmm
    var now = new Date();
    var timestamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmm');
    var backupName = 'Backup_' + timestamp;

    // Copy spreadsheet ke folder backup
    var file = DriveApp.getFileById(ss.getId());
    var copy = file.makeCopy(backupName, folder);

    Log.info('runBackup', '✅ Backup berhasil', {
      name: backupName,
      folder: folder.getName(),
      size: copy.getSize(),
      url: copy.getUrl()
    });

    // Cleanup: hapus backup lama
    _cleanupOldBackups(folder);

    timer.end('Backup complete', {name: backupName});
  } catch (e) {
    Log.exception('runBackup', e);
    timer.end('Failed');
  }
}

/**
 * Get atau buat folder backup di Google Drive.
 * Folder dibuat di root Drive dengan nama BACKUP_FOLDER_NAME.
 */
function _getOrCreateBackupFolder() {
  var folders = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  var folder = DriveApp.createFolder(BACKUP_FOLDER_NAME);
  Log.info('_getOrCreateBackupFolder', 'Folder baru dibuat: ' + BACKUP_FOLDER_NAME);
  return folder;
}

/**
 * Hapus backup lama yang melebihi BACKUP_RETENTION.
 * File diurutkan berdasarkan tanggal dibuat, yang paling lama dihapus duluan.
 */
function _cleanupOldBackups(folder) {
  try {
    var files = folder.getFiles();
    var fileList = [];

    while (files.hasNext()) {
      var f = files.next();
      fileList.push({file: f, created: f.getDateCreated().getTime()});
    }

    // Sort: terbaru di depan
    fileList.sort(function(a, b) { return b.created - a.created; });

    // Hapus yang melebihi retention
    var deleted = 0;
    for (var i = BACKUP_RETENTION; i < fileList.length; i++) {
      var oldFile = fileList[i].file;
      Log.info('_cleanupOldBackups', 'Menghapus backup lama: ' + oldFile.getName());
      oldFile.setTrashed(true);
      deleted++;
    }

    if (deleted > 0) {
      Log.info('_cleanupOldBackups', 'Cleanup selesai, ' + deleted + ' file lama dihapus');
    }
  } catch (e) {
    Log.warn('_cleanupOldBackups', 'Cleanup gagal (tidak fatal)', {error: e.message});
  }
}

// ============================================================================
// TRIGGER SETUP (run sekali saja)
// ============================================================================

/**
 * Setup 2 trigger: jam 06:00 dan jam 18:00 setiap hari.
 * JALANKAN FUNGSI INI SEKALI SAJA — setelah itu trigger aktif selamanya.
 * Aman dijalankan berulang (hapus trigger lama dulu sebelum buat baru).
 */
function setupBackupTriggers() {
  // Hapus trigger backup lama (kalau ada)
  var existingTriggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existingTriggers.length; i++) {
    if (existingTriggers[i].getHandlerFunction() === 'runBackup') {
      ScriptApp.deleteTrigger(existingTriggers[i]);
      Logger.log('Deleted old trigger: ' + existingTriggers[i].getUniqueId());
    }
  }

  // Trigger 1: Jam 06:00
  ScriptApp.newTrigger('runBackup')
    .timeBased()
    .atHour(6)
    .everyDays(1)
    .create();

  // Trigger 2: Jam 18:00
  ScriptApp.newTrigger('runBackup')
    .timeBased()
    .atHour(18)
    .everyDays(1)
    .create();

  Logger.log('═══════════════════════════════════════');
  Logger.log('✅ Backup triggers berhasil di-setup!');
  Logger.log('  → Trigger 1: Setiap hari jam 06:00');
  Logger.log('  → Trigger 2: Setiap hari jam 18:00');
  Logger.log('  → Folder: ' + BACKUP_FOLDER_NAME);
  Logger.log('  → Retention: ' + BACKUP_RETENTION + ' file');
  Logger.log('═══════════════════════════════════════');
}

/**
 * Test backup manual (jalankan kapan saja untuk cek apakah berfungsi)
 */
function testBackupNow() {
  Logger.log('=== TEST BACKUP MANUAL ===');
  runBackup();
  Logger.log('=== SELESAI — cek folder "' + BACKUP_FOLDER_NAME + '" di Google Drive ===');
}