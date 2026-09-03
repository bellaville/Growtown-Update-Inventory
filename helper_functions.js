/**
 * Function to write lot transactions to the "Transactions" sheet in the LOT_TRANSACTIONS spreadsheet.
 * @param inputs 
 * @param outputs 
 * @param lotMap 
 * @param wo_id 
 * @param operation 
 * @param date 
 * @returns 
 */
function writeToLotTransactionSheet(inputs, outputs, lotMap, wo_id, operation, date) {
    try {
        const changes = getLotWeightChanges(inputs, outputs);
        console.log("Net cannabis weight changes by lot:", changes);

        const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('LOT_TRANSACTIONS'));
        transactionSheet = ss.getSheetByName('Transactions');

        for (const [lotNumber, netChange] of Object.entries(changes)) {
            const lotId = String(lotNumber).trim();
            const weightChange = netChange;
            const currentWeight = lotMap.get(lotId) || 0;
            toAppend = [Utilities.getUuid(), lotId, wo_id, date, new Date(), operation, weightChange, currentWeight + weightChange];
            transactionSheet.appendRow(toAppend);
            console.log("Appended transaction for lot:", lotId, "Change:", weightChange, "Current Weight:", currentWeight + weightChange);
        }
    } catch (error) {
        console.error("Error occurred while writing to transaction sheet:", error);
        MailApp.sendEmail({
            to: "bella@growtown.ca",
            subject: "WORK LOG SCRIPT ALERT: Write to Lot Transaction Sheet Failed",
            body: "Error: " + error.toString()
        });
        return false; // indicate failure
    }

    return true; // indicate success


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

/**
 * Combines inputs and outputs into a map of lotNumber -> net weight change.
 * - inputs: array of { lotNumber, weight } where weight is already negative for subtraction
 * - outputs: array of { lotNumber, weight, flag } where flag === true means destruction (ignored)
 * Returns: { [lotNumber]: netWeightChange }
 */
function getLotWeightChanges(inputs, outputs) {
    const lotChanges = {};

    // Process inputs (weights are already negative where appropriate)
    if (inputs && Array.isArray(inputs)) {
        for (const item of inputs) {
            const lot = item.lotNumber;
            if (!lot) continue;
            const w = Number(item.weight) || 0;
            lotChanges[lot] = (lotChanges[lot] || 0) + w;
        }
    }

    // Process outputs (ignore destruction: flag === true)
    if (outputs && Array.isArray(outputs)) {
        for (const item of outputs) {
            const lot = item.lotNumber;
            if (!lot) continue;
            if (item.flag === true) continue; // skip destruction
            const w = Number(item.weight) || 0;
            lotChanges[lot] = (lotChanges[lot] || 0) + w;
        }
    }

    return lotChanges;
}