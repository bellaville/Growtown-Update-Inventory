/**
 * Receives all input and output data from Appsheet and batch updates the inventory sheet with the new data.
 */
function writeToInventory(wo_id, operation, date, can_IP_ids, can_IP_weight, can_IP_lots, can_OP_ids, can_OP_weight, can_OP_lots, can_OP_flags, non_can_IP_ids, non_can_IP_weight, non_can_IP_lots, non_can_OP_ids, non_can_OP_weight, non_can_OP_lots,) {
    console.log("writeToInventory function called with parameters:", wo_id, operation, date, can_IP_ids, can_IP_weight, can_IP_lots, can_OP_ids, can_OP_weight, can_OP_lots, can_OP_flags, non_can_IP_ids, non_can_IP_weight, non_can_IP_lots, non_can_OP_ids, non_can_OP_weight, non_can_OP_lots);

    inputs = createInputs(can_IP_lots, can_IP_weight);
    console.log("Created inputs:", inputs);
}

/**
 * Helper function to create a list of input or output objects out of a list of lot numbers and weights.
 * Groups together lots that appear more than once.
*/
function createInputs(lotList, weightList) {
    if (!lotList) {
        return [];
    }
    const grouped = {};
    for (let i = 0; i < lotList.length; i++) {
        const lotNumber = lotList[i];
        const weight = (0 - Number(weightList[i])) || 0;
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
