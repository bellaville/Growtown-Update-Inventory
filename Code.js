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
                console.log("Inventory key already exists in transaction log:", inventoryKey);
                return false; // key already exists, do not write to inventory and exit
            } else {
                // key doesn't exist, write it to the transaction log and update inventory
                transactionLogSheet.appendRow([inventoryKey, new Date()]);
                console.log("Appended inventory key to transaction log:", inventoryKey);

                updateBulkInventory(operation, can_inputs, can_outputs);
                updateNonCanInventory(operation, non_can_inputs, non_can_outputs);
            }


        } finally {
            lock.releaseLock(); // release the lock
        }

    } catch (error) {
        MailApp.sendEmail({
            to: "bella@growtown.ca",
            subject: "WORK LOG APP ALERT: Update Inventory Failed",
            body: "Error: " + error.toString()
        });
        console.log("Error occurred while writing to inventory:", error);
        return false;
    }

}

function updateBulkInventory(operation, can_inputs, can_outputs) {

}

function updateNonCanInventory(operation, non_can_inputs, non_can_outputs) {

}

/**
 * Creates a deterministic unique key from wo_id and all *ids lists.
 * All ID arrays are sorted before hashing so the same inputs always produce the same key.
 */
function makeInventoryKey(wo_id, can_IP_ids, can_OP_ids, non_can_IP_ids, non_can_OP_ids) {
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
