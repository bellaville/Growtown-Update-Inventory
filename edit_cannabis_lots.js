/**
 * Add a new lot to Bulk Inventory from the Work Log App
 */
function addLotToBulkInventory(lotNumber, strain, reportingLotType, cannabisForm, inputIds, notes, craCategory, lotOwner, location, date) {

    try {
        const workLog = SpreadsheetApp.openById(
            PropertiesService.getScriptProperties().getProperty('BULK_INVENTORY')
        );

        const lock = LockService.getScriptLock(); // get a lock for this script to avoid race conditions
        lock.waitLock(60000); // wait up to 60 seconds

        try {
            const inventorySheet = workLog.getSheetByName(INVENTORY_SHEET_NAME);

            // 1. Try to find existing lotNumber in LOT_ID_ROW column
            const existingRow = findRowByLotId(inventorySheet, LOT_ID_ROW, lotNumber);

            // 2. If not found, use next empty row
            const targetRow = existingRow !== null ? existingRow : getNextEmptyRowForColumn(inventorySheet, LOT_ID_ROW);

            console.log("Target row:", targetRow, existingRow ? "(updated)" : "(new)");

            // Now set each column individually in that row.
            // Only these cells are touched; all other columns in the row remain unchanged.
            inventorySheet.getRange(targetRow, STRAIN_ROW).setValue(strain);
            inventorySheet.getRange(targetRow, LOT_ID_ROW).setValue(lotNumber);
            inventorySheet.getRange(targetRow, REPORTING_LOT_TYPE_ROW).setValue(reportingLotType);
            inventorySheet.getRange(targetRow, CANNABIS_FORM_ROW).setValue(cannabisForm);
            inventorySheet.getRange(targetRow, INPUT_IDS_ROW).setValue(inputIds);
            inventorySheet.getRange(targetRow, NOTES_ROW).setValue(notes);
            inventorySheet.getRange(targetRow, CRA_CATEGORY_ROW).setValue(craCategory);
            inventorySheet.getRange(targetRow, LOT_OWNER_ROW).setValue(lotOwner);
            inventorySheet.getRange(targetRow, LOCATION_ROW).setValue(location);
            inventorySheet.getRange(targetRow, CREATED_DATE).setValue(date);

            console.log(inventorySheet.getName());
            console.log("Final target row:", targetRow);

            SpreadsheetApp.flush();
        } finally {
            lock.releaseLock(); // release the lock
        }

    } catch (error) {
        MailApp.sendEmail({
            to: "bella@growtown.ca",
            subject: "WORK LOG APP ALERT: Add/Update Lot Failed",
            body: "Error: " + error.toString()
        });
        throw error;
    }

}

/**
 * Finds the first row (>= startRow) where the value in lotIdColumn equals lotId.
 * Returns the 1-based row number, or null if not found.
 */
function findRowByLotId(sheet, lotIdColumn, lotId) {
    const startRow = 4; // same assumption as your getNextEmptyRowForColumn
    const lastRow = sheet.getLastRow();

    if (lastRow < startRow) {
        return null;
    }

    const values = sheet.getRange(startRow, lotIdColumn, lastRow - startRow + 1, 1).getValues();

    for (let i = 0; i < values.length; i++) {
        const cellValue = values[i][0];
        if (cellValue !== null && cellValue !== undefined && String(cellValue).trim() === String(lotId).trim()) {
            return startRow + i;
        }
    }

    return null;
}

/**
 * Returns the next empty row number for a given column (1-based).
 * It scans from row 2 downward (assumes row 1 is header).
 */
function getNextEmptyRowForColumn(sheet, columnNumber) {
    const lastRow = sheet.getLastRow();
    const startRow = 4; // assume row 1 is header

    // If sheet is completely empty below header, start at row 2
    if (lastRow < startRow) {
        return startRow;
    }

    const values = sheet.getRange(startRow, columnNumber, lastRow - startRow + 1, 1).getValues();

    for (let i = 0; i < values.length; i++) {
        if (!values[i][0] || values[i][0].toString().trim() === '') {
            return startRow + i;
        }
    }

    // If no empty cell found, append after the last row
    return lastRow + 1;
}

function testForErrorAddLot(){
    addLotToBulkInventory();
}