/**
 * Migration: Add location column to WorkOrders sheet
 * Run ONCE from Apps Script editor
 */
function migrationAddLocation_v1() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var woSheet = ss.getSheetByName('WorkOrders');
  
  if (!woSheet) {
    Logger.log('❌ WorkOrders sheet not found');
    return;
  }
  
  var headers = woSheet.getRange(1, 1, 1, woSheet.getLastColumn()).getValues()[0];
  
  // Check if location already exists
  if (headers.indexOf('location') !== -1) {
    Logger.log('⚠️ location column already exists at index: ' + (headers.indexOf('location') + 1));
    return;
  }
  
  // Add location column at the end
  var newCol = woSheet.getLastColumn() + 1;
  woSheet.getRange(1, newCol).setValue('location');
  
  Logger.log('✅ Added location column at column ' + newCol);
  Logger.log('✅ Migration complete. Existing WOs will have empty location (treated as workshop).');
}