/**
 * Function to add or edit non-cannabis lots in the Bulk Inventory spreadsheet.
 * @param {*} recordId 
 * @param {*} Active 
 * @param {*} productName 
 * @param {*} lotId 
 * @param {*} supplierId 
 * @param {*} weight 
 * @param {*} units 
 * @param {*} receivedDate 
 * @param {*} location 
 */
function addEditNonCannabisLots(recordId, Active, productName, lotId, supplierId, weight, units, receivedDate, location) {
    console.log("Adding/editing non-cannabis lot in Bulk Inventory:", recordId, Active, productName, lotId, supplierId, weight, units, receivedDate, location);
    try {
        const lock = LockService.getScriptLock(); // get a lock for this script to avoid race conditions
        lock.waitLock(60000); // wait up to 60 seconds
        try {
            const workLog = SpreadsheetApp.openById(
                PropertiesService.getScriptProperties().getProperty('WORK_LOG_ID')
            );
            const inventorySheet = workLog.getSheetByName(NON_CANNABIS_INVENTORY_SHEET_NAME);
            const existingRow = findRowByLotId(inventorySheet, 1, recordId, NON_CANNABIS_START_ROW);
            const targetRow = existingRow !== null ? existingRow : getNextEmptyRowForColumn(inventorySheet, 1, NON_CANNABIS_START_ROW);

            console.log("Target row for non-cannabis lot:", targetRow, existingRow ? "(updated)" : "(new)");
            toPush = [recordId, Active, productName, lotId, supplierId, weight, units, receivedDate, location];
            inventorySheet.getRange(targetRow, 1, 1, toPush.length).setValues([toPush]);
            console.log("Updated non-cannabis inventory sheet at row:", targetRow);

            SpreadsheetApp.flush();
        } finally {
            lock.releaseLock(); // release the lock
        }


    } catch (error) {
        MailApp.sendEmail({
            to: "bella@growtown.ca",
            subject: "WORK LOG SCRIPT ALERT: Add/Update Non-Cannabis Lot Failed",
            body: "Error: " + error.toString()
        });
        throw error;
    }

}