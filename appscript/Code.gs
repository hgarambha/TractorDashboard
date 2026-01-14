/**
 * J1939 Tractor Data Logger - Google Apps Script
 * ===============================================
 * 
 * POST: Receives data from Raspberry Pi
 * GET: Serves data to the Dashboard (JSON)
 */

const SHEET_NAME = 'TractorData';
const HEADERS = [
  'Timestamp',
  'EngineSpeed',
  'EngineCoolantTemp', 
  'FuelLevel',
  'WheelBasedVehicleSpeed',
  'Latitude',
  'Longitude',
  'Heading',
  'GPSSpeed',
  'Altitude',
  'AmbientAirTemp',
  'EngineOilPressure',
  'EnginePercentTorque'
];

/**
 * Handle GET requests (Serving data to Dashboard)
 */
function doGet(e) {
  const action = e.parameter.action || 'view';
  
  if (action === 'view') {
    // Return recent data for the dashboard
    const hours = parseInt(e.parameter.hours) || 24;
    const data = getRecentData(hours);
    
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'ok',
        data: data
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  return ContentService
    .createTextOutput(JSON.stringify({
      status: 'ok',
      message: 'J1939 Logger API is running.'
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handle POST requests (Receive data from Pi)
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = getOrCreateSheet();
    const records = Array.isArray(data) ? data : [data];
    
    records.forEach(record => {
      const row = formatRow(record);
      sheet.appendRow(row);
    });
    
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'ok',
        message: `Added ${records.length} record(s)`
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'error',
        message: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Helper: Get recent data rows as JSON objects
 */
function getRecentData(hours) {
  const sheet = getOrCreateSheet();
  const lastRow = sheet.getLastRow();
  
  if (lastRow <= 1) return [];
  
  // Get up to last 1000 rows to keep it fast
  const startRow = Math.max(2, lastRow - 1000);
  const numRows = lastRow - startRow + 1;
  
  const values = sheet.getRange(startRow, 1, numRows, HEADERS.length).getValues();
  const result = [];
  
  // Apps Script dates need conversion
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

  // Iterate backwards (newest first)
  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    const timestamp = new Date(row[0]);
    
    if (timestamp >= cutoff) {
      const entry = {};
      HEADERS.forEach((header, index) => {
        entry[header] = row[index];
      });
      result.push(entry);
    } else {
      // Since we're going backwards, once we hit old data we can stop (if data is sorted)
      // But unsafe to assume sorted, so we'll check all in the range
    }
  }
  
  return result;
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
  }
  return sheet;
}

function formatRow(record) {
  const s = record.signals || record;
  return [
    record.timestamp || new Date().toISOString(),
    s.EngineSpeed, s.EngineCoolantTemp, s.FuelLevel, s.WheelBasedVehicleSpeed,
    s.Latitude, s.Longitude, s.Heading, s.GPSSpeed, s.Altitude,
    s.AmbientAirTemp, s.EngineOilPressure, s.EnginePercentTorque
  ];
}
