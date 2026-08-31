/**
 * Receives all input and output data from Appsheet and batch updates the inventory sheet with the new data.
 */
function writeToInventory(wo_id, operation, date, can_IP_ids, can_IP_weight, can_IP_lots, can_OP_ids, can_OP_weight, can_OP_lots, can_OP_flags, non_can_IP_ids, non_can_IP_weight, non_can_IP_lots, non_can_OP_ids, non_can_OP_weight, non_can_OP_lots,) {

    try {
        console.log("writeToInventory function called with parameters:", wo_id, operation, date, can_IP_ids, can_IP_weight, can_IP_lots, can_OP_ids, can_OP_weight, can_OP_lots, can_OP_flags, non_can_IP_ids, non_can_IP_weight, non_can_IP_lots, non_can_OP_ids, non_can_OP_weight, non_can_OP_lots);

        can_inputs = createInputsOrOutputs(can_IP_lots, can_IP_weight, true);
        console.log("Created inputs:", can_inputs);

        can_outputs = createOutputs(can_OP_lots, can_OP_weight, can_OP_flags);
        console.log("Created outputs:", can_outputs);

        non_can_inputs = createInputsOrOutputs(non_can_IP_lots, non_can_IP_weight, true);
        console.log("Created non-can inputs:", non_can_inputs);

        non_can_outputs = createInputsOrOutputs(non_can_OP_lots, non_can_OP_weight, false);
        console.log("Created non-can outputs:", non_can_outputs);

        // create unique key made up of wo_id and all input/output ids
        const inventoryKey = makeInventoryKey(wo_id, can_IP_ids, can_OP_ids, non_can_IP_ids, non_can_OP_ids);
        console.log("Generated inventory key:", inventoryKey);
        if (inventoryKey === null) {
            console.log("ABORT - No input or output IDs provided, skipping inventory update.");
            return null; // no input or output IDs provided, do not write to inventory and exit
        }

        // begin critical section: attain script lock to ensure no other process is writing to the inventory sheet at the same time
        const lock = LockService.getScriptLock();
        lock.waitLock(60000); // wait up to 60 seconds

        try {
            //search for key in transaction log sheet
            const props = PropertiesService.getScriptProperties();
            const transactionLogSheetId = props.getProperty('TRANSACTION_LOG');
            const transactionLogSheet = SpreadsheetApp.openById(transactionLogSheetId).getSheetByName('Transaction_Log');
            const transactionLogData = transactionLogSheet.getDataRange().getValues();
            const keyColumnIndex = 0;
            const keyRowIndex = transactionLogData.findIndex(row => row[keyColumnIndex] === inventoryKey);

            if (keyRowIndex !== -1) {
                console.log("ABORT - Inventory key already exists in transaction log:", inventoryKey);
                return null; // key already exists, do not write to inventory and exit
            } else {
                // key doesn't exist, write it to the transaction log and update inventory
                transactionLogSheet.appendRow([inventoryKey, new Date()]);
                console.log("Appended inventory key to transaction log:", inventoryKey);

                const cannabis_result = updateBulkInventory(operation, can_inputs, can_outputs);
                const non_cannabis_result = updateNonCanInventory(operation, non_can_inputs, non_can_outputs);

                if (cannabis_result === false || non_cannabis_result === false) {
                    console.log("ABORT - Inventory update failed for operation:", operation);
                    console.log("Cannabis update result:", cannabis_result, "Non-cannabis update result:", non_cannabis_result);
                    return false; // inventory update failed, exit
                } else {
                    console.log("Inventory update successful for operation:", operation);
                }
            }

            SpreadsheetApp.flush(); // ensure all changes are written to the spreadsheet
        } finally {
            lock.releaseLock(); // release the lock
        }

    } catch (error) {
        MailApp.sendEmail({
            to: "bella@growtown.ca",
            subject: "WORK LOG APP ALERT: Update Inventory Script Failed",
            body: "Error: " + error.toString()
        });
        console.log("Error occurred while writing to inventory:", error);
        return false;
    }

    return true; // indicate success

}
/**
 * Takes cannabis inputs and outputs and updates the inventory sheet accordingly.
 * @param operation operation type (e.g., "Destruction", "Retention Sample", etc.)
 * @param can_inputs list of inputs, each with a lot number and weight
 * @param can_outputs list of outputs, each with a lot number, weight, and flag indicating whether the output is for destruction
 * @returns nothing
 */
function updateBulkInventory(operation, can_inputs, can_outputs) {
    const inventory = SpreadsheetApp.openById(
        PropertiesService.getScriptProperties().getProperty('BULK_INVENTORY')
    );

    // Get inventory sheet and compute number of rows
    const sheet= inventory.getSheetByName(INVENTORY_SHEET_NAME);
    const lastRow = LAST_ROW; //sheet.getLastRow();
    if (lastRow < START_ROW) { return false } // return if inventory empty
    const numRows = lastRow - START_ROW + 1;

    // get needed columns
    const allData = sheet.getRange(START_ROW, 1, numRows, RETENTION_COL).getValues();

    // create arrays of lot numbers and inventory values
    const lotNumbers = allData.map(r => [r[LOT_COL - 1]]);
    const inventoryValues = allData.map(r => [r[INVENTORY_COL - 1]]);
    const retentionValues = allData.map(r => [r[RETENTION_COL - 1]]);
    const destructionValues = allData.map(r => [r[DESTRUCTION_COL - 1]]);

    const rowByLot = new Map();
    for (let i = 0; i < numRows; i++) {
        rowByLot.set(String(lotNumbers[i][0]), i);
    }

    const inventoryDeltaByLot = new Map();
    const retentionDeltaByLot = new Map();
    const destructionDeltaByLot = new Map();

    // collect all input changes
    for (const input of can_inputs) {
        const lotKey = String(input.lotNumber);
        // if operation is destruction subtract from destruct column NOT weight column
        if (operation === "Destruction") {
            destructionDeltaByLot.set(lotKey, (destructionDeltaByLot.get(lotKey) || 0) + input.weight);
        } else {
            inventoryDeltaByLot.set(lotKey, (inventoryDeltaByLot.get(lotKey) || 0) + input.weight);
        }
        // if retention sample, add to retention column after subtracting from inventory column
        if (operation === 'Retention Sample') {
            retentionDeltaByLot.set(lotKey, (retentionDeltaByLot.get(lotKey) || 0) - input.weight); // subtract since input weights are negative
        }
    }

    // collect all output changes
    if (!NOT_AFFECT_OUTPUT.includes(operation)) {
        for (const output of can_outputs) {
            const lotKey = String(output.lotNumber);
            if (output.flag) {
                destructionDeltaByLot.set(lotKey, (destructionDeltaByLot.get(lotKey) || 0) + output.weight);
            } else {
                inventoryDeltaByLot.set(lotKey, (inventoryDeltaByLot.get(lotKey) || 0) + output.weight);
            }
        }
    }

    // apply all changes to inventory sheet
    for (const [lotKey, delta] of inventoryDeltaByLot.entries()) {
        const rowIndex = rowByLot.get(lotKey);
        if (rowIndex == null) continue;
        inventoryValues[rowIndex][0] = Number(inventoryValues[rowIndex][0]) + delta;
        sheet.getRange(START_ROW + rowIndex, INVENTORY_COL).setValue(inventoryValues[rowIndex][0]);
    }

    for (const [lotKey, delta] of retentionDeltaByLot.entries()) {
        const rowIndex = rowByLot.get(lotKey);
        if (rowIndex == null) continue;
        retentionValues[rowIndex][0] = Number(retentionValues[rowIndex][0]) + delta;
        sheet.getRange(START_ROW + rowIndex, RETENTION_COL).setValue(retentionValues[rowIndex][0]);
    }

    for (const [lotKey, delta] of destructionDeltaByLot.entries()) {
        const rowIndex = rowByLot.get(lotKey);
        if (rowIndex == null) continue;
        destructionValues[rowIndex][0] = Number(destructionValues[rowIndex][0]) + delta;
        sheet.getRange(START_ROW + rowIndex, DESTRUCTION_COL).setValue(destructionValues[rowIndex][0]);
    }

    return true; // indicate success

}

function updateNonCanInventory(operation, non_can_inputs, non_can_outputs) {
    return true;
}

function writeToLotTransactionSheet() {

}

/**
 * Creates a deterministic unique key from wo_id and all *ids lists.
 * All ID arrays are sorted before hashing so the same inputs always produce the same key.
 */
function makeInventoryKey(wo_id, can_IP_ids, can_OP_ids, non_can_IP_ids, non_can_OP_ids) {
    // check if all lists are empty or null, if so return null
    if ((!can_IP_ids || can_IP_ids.length === 0) &&
        (!can_OP_ids || can_OP_ids.length === 0) &&
        (!non_can_IP_ids || non_can_IP_ids.length === 0) &&
        (!non_can_OP_ids || non_can_OP_ids.length === 0)) {
        return null;
    }
    // Ensure we’re working with arrays and sort them lexicographically
    const sorted = {
        can_IP_ids: (can_IP_ids || []).slice().sort(),
        can_OP_ids: (can_OP_ids || []).slice().sort(),
        non_can_IP_ids: (non_can_IP_ids || []).slice().sort(),
        non_can_OP_ids: (non_can_OP_ids || []).slice().sort()
    };

    // Build a stable string representation
    const parts = [
        wo_id ?? '',
        sorted.can_IP_ids.join('|'),
        sorted.can_OP_ids.join('|'),
        sorted.non_can_IP_ids.join('|'),
        sorted.non_can_OP_ids.join('|')
    ];

    const rawKey = parts.join('::');
    return rawKey;
}

/**
 * Helper function to create a list of input or output objects out of a list of lot numbers and weights.
 * Groups together lots that appear more than once.
*/
function createInputsOrOutputs(lotList, weightList, neg) {
    if (!lotList) {
        return [];
    }
    const grouped = {};
    for (let i = 0; i < lotList.length; i++) {
        const lotNumber = lotList[i];
        let weight = 0;
        if (neg) {
            weight = (0 - Number(weightList[i])) || 0;
        } else {
            weight = Number(weightList[i]) || 0;
        }
        const key = lotNumber;
        if (!grouped[key]) {
            grouped[key] = {
                lotNumber: lotNumber,
                weight: 0,
            };
        }
        grouped[key].weight += weight;
    }
    return Object.values(grouped);
}

/**
 * Helper function to create a list of output objects out of a list of lot numbers, weights, and flags (indicates whether
 * the output is for destruction).
*/
function createOutputs(lotList, weightList, flagList) {
    if (!lotList) {
        return [];
    }
    const grouped = {};
    for (let i = 0; i < lotList.length; i++) {
        const lotNumber = lotList[i];
        const weight = Number(weightList[i]) || 0;
        const key = `${lotNumber}-${flagList[i]}`;
        if (!grouped[key]) {
            grouped[key] = {
                lotNumber: lotNumber,
                weight: 0,
                flag: flagList[i],
            };
        }
        grouped[key].weight += weight;
    }
    return Object.values(grouped);
}
