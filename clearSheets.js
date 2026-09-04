/**
 * Function to clear all rows below header
 */
function clearBelowHeader(property) {
    const props = PropertiesService.getScriptProperties();
    const transactionLogSheetId = props.getProperty(property);
    const transactionLogSheet = SpreadsheetApp.openById(transactionLogSheetId).getSheetByName('Transaction_Log');

    const lastRow = transactionLogSheet.getLastRow();
    if (lastRow < 2) {
        console.log("No transactions to delete or update.");
        return;
    }

    const dataRange = transactionLogSheet.getRange(2, 1, lastRow - 1, transactionLogSheet.getLastColumn());
    dataRange.clearContent();
    console.log("Cleared all transactions from the Transaction_Log sheet.");
}

/**
 * Runs daily between 12-1am to clear the transaction log sheet. This is to prevent the sheet from growing too large and slowing down the script.
 */
function clearTransactions() {
    clearBelowHeader('TRANSACTION_LOG');
}