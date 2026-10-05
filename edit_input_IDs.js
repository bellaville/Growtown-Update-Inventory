/**
 * Function to gather all input IDs from a work order and write to the input IDs column of the appropriate output lots
 */
function updateInputIDs(receivingIDs, nonCannabisIDs, cannabisIDs, outputIDs) {
    console.log("updateInputIDs called with receivingIDs:", receivingIDs, "nonCannabisIDs:", nonCannabisIDs, "cannabisIDs:", cannabisIDs, "outputIDs:", outputIDs);

    const inputList = receivingIDs.concat(nonCannabisIDs, cannabisIDs);
    const inputIDsString = inputList.join(" / "); // Join the IDs into a single string separated by slashes
    console.log("Combined input IDs string:", inputIDsString);


}