/**
 * Function to gather all input IDs from a work order and write to the input IDs column of the appropriate output lots
 */
function updateInputIDs(receivingIDs, nonCannabisIDs, cannabisIDs, outputIDs) {
    console.log("updateInputIDs called with receivingIDs:", receivingIDs, "nonCannabisIDs:", nonCannabisIDs, "cannabisIDs:", cannabisIDs, "outputIDs:", outputIDs);

    try {

        // return early if no output IDs are provided
        if (outputIDs == null || outputIDs.length === 0) {
            console.log("No output IDs provided. Exiting function.");
            return;
        }

        // get list of all input IDs from the work order
        let inputList = [];
        if (receivingIDs != null && receivingIDs.length > 0) {
            inputList = inputList.concat(receivingIDs);
        }
        if (nonCannabisIDs != null && nonCannabisIDs.length > 0) {
            inputList = inputList.concat(nonCannabisIDs);
        }
        if (cannabisIDs != null && cannabisIDs.length > 0) {
            inputList = inputList.concat(cannabisIDs);
        }

        console.log("Work order input IDs:", inputList);

        const lock = LockService.getScriptLock(); // get lock for script to prevent concurrent execution
        lock.waitLock(60000); // wait up to 60 seconds

        try {

            const sheetID = PropertiesService.getScriptProperties().getProperty("BULK_INVENTORY");
            const sheet = SpreadsheetApp.openById(sheetID).getSheetByName(INVENTORY_SHEET_NAME);
            const map = new Map();

            const range = sheet.getRange(START_ROW, 2, LAST_ROW - START_ROW + 1, 4).getValues(); // get range of lot numbers to input ids
            for (let i = 0; i < range.length; i++) {
                const cellValue = range[i][0];
                const cellStr = cellValue != null ? String(cellValue).trim() : ""; // get string of each lot number
                if (outputIDs.includes(cellStr)) {
                    map.set(i + START_ROW, range[i][3]); // Store the row number and the current input ID string
                }
            }

            for (const [key, value] of map) {
                console.log(key, value);
                let currentInputIDs = [];
                if (value && value.trim() !== "") {
                    currentInputIDs = value.split(" / ");
                }
                console.log("Current input IDs for row", key, ":", currentInputIDs);

                const combinedInputIDs = currentInputIDs.concat(inputList);
                const idSet = new Set(combinedInputIDs);
                const updatedInputIDs = Array.from(idSet);
                console.log("Updated input IDs for row", key, ":", updatedInputIDs);
                const idString = updatedInputIDs.join(" / ");

                console.log("Updated input IDs for row", key, ":", idString);
                sheet.getRange(key, INPUT_IDS_ROW).setValue(idString);

            }

            SpreadsheetApp.flush(); // Ensure all pending changes are applied before proceeding

        } finally {
            lock.releaseLock();
        }

    } catch (error) {
        MailApp.sendEmail({
            to: "bella@growtown.ca",
            subject: "WORK LOG SCRIPT ALERT: Update Input IDs failed",
            body: "Error: " + error.toString()
        });
        console.log("Error occurred while updating input IDs:", error);
        return false;
    }

}

function testUpdateInputIDs() {
    receivingIDs = null;
    nonCannabisIDs = ["NC123", "NC456"];
    cannabisIDs = ["lot123", "C012"];
    outputIDs = ["TESTlot123", "TESTlot124"];
    updateInputIDs(receivingIDs, nonCannabisIDs, cannabisIDs, outputIDs);
}