# Work Log Inventory Automation

Google Apps Script project that receives work-order inventory data from Google AppSheet Work Log App and updates cannabis and non-cannabis inventory spreadsheets. The project also records lot-level transactions, adds or updates cannabis lots, and adds or edits non-cannabis lots.

The script uses script-wide locks to serialize updates and prevent concurrent executions from overwriting shared spreadsheet data. This is especially important because AppSheet actions or automations may invoke the script close together in time. [developers.google](https://developers.google.com/apps-script/reference/lock/lock)

## Features

- Processes cannabis inputs and outputs from work orders.
- Processes non-cannabis inputs and outputs.
- Aggregates repeated lot numbers before updating inventory.
- Applies inventory changes based on the operation type.
- Separates normal inventory, retention, and destruction quantities.
- Records cannabis lot transactions with before-and-after weights.
- Prevents duplicate inventory updates using a deterministic transaction key.
- Adds or updates cannabis lots in the bulk inventory sheet.
- Adds or updates non-cannabis lots in the non-cannabis inventory sheet.
- Uses script properties to store spreadsheet IDs.
- Uses email notifications for runtime failures.
- Uses `LockService.getScriptLock()` to prevent concurrent updates. [developers.google](https://developers.google.com/apps-script/reference/lock)

## Architecture

The project integrates the following systems:

```text
AppSheet
   |
   | Calls Apps Script functions
   v
Google Apps Script
   |
   +--> Work Log spreadsheet
   |       +--> lotNumbers
   |       +--> Non-Cannabis Inventory
   |
   +--> Bulk Inventory spreadsheet
   |       +--> Bulk Inventory Report
   |
   +--> Transaction Log spreadsheet
   |       +--> Transaction_Log
   |
   +--> Lot Transactions spreadsheet
           +--> Transactions
```

Spreadsheet IDs are not hard-coded in the functions. They are read from Apps Script project properties using `PropertiesService.getScriptProperties()`, which provides script-wide key-value storage. [developers.google](https://developers.google.com/apps-script/reference/properties/properties-service)

## Configuration

The following script properties must be configured before the project is used:

| Property | Purpose |
|---|---|
| `BULK_INVENTORY` | Spreadsheet ID containing the `Bulk Inventory Report` sheet. |
| `WORK_LOG_ID` | Spreadsheet ID containing the `lotNumbers` and `Non-Cannabis Inventory` sheets. |
| `TRANSACTION_LOG` | Spreadsheet ID containing the `Transaction_Log` sheet used for duplicate detection. |
| `LOT_TRANSACTIONS` | Spreadsheet ID containing the `Transactions` sheet used for lot-level transaction history. |

Example setup:

```javascript
function configureProperties() {
  PropertiesService.getScriptProperties().setProperties({
    BULK_INVENTORY: 'bulk-inventory-spreadsheet-id',
    WORK_LOG_ID: 'work-log-spreadsheet-id',
    TRANSACTION_LOG: 'transaction-log-spreadsheet-id',
    LOT_TRANSACTIONS: 'lot-transactions-spreadsheet-id'
  });
}
```

Replace the example values with actual Google Spreadsheet IDs. The executing account must have permission to access all referenced spreadsheets.

## Spreadsheet Layout

### Bulk Inventory Report

The bulk inventory sheet is controlled by the following constants:

| Constant | Value | Meaning |
|---|---:|---|
| `INVENTORY_SHEET_NAME` | `Bulk Inventory Report` | Sheet containing cannabis lot inventory. |
| `START_ROW` | `4` | First inventory data row. |
| `LOT_COL` | `2` | Lot number column, column B. |
| `INVENTORY_COL` | `7` | Available inventory column, column G. |
| `DESTRUCTION_COL` | `8` | Destruction quantity column, column H. |
| `RETENTION_COL` | `20` | Retention quantity column, column T. |
| `LAST_ROW` | `400` | Maximum row processed by `updateBulkInventory`. |

The lot-creation constants identify fields written by `addLotToBulkInventory`:

| Constant | Value | Meaning |
|---|---:|---|
| `STRAIN_ROW` | `1` | Strain column. |
| `LOT_ID_ROW` | `2` | Lot ID column. |
| `REPORTING_LOT_TYPE_ROW` | `3` | Reporting lot type column. |
| `CANNABIS_FORM_ROW` | `4` | Cannabis form column. |
| `INPUT_IDS_ROW` | `5` | Input IDs column. |
| `NOTES_ROW` | `9` | Notes column. |
| `CRA_CATEGORY_ROW` | `13` | CRA category column. |
| `LOT_OWNER_ROW` | `15` | Lot owner column. |
| `LOCATION_ROW` | `17` | Location column. |
| `CREATED_DATE` | `23` | Created date column. |

### Non-Cannabis Inventory

```javascript
const NON_CANNABIS_INVENTORY_SHEET_NAME = 'Non-Cannabis Inventory';
const NON_CANNABIS_START_ROW = 2;
```

The sheet is expected to use:

- Column A for the record ID used to find an existing record.
- Column B for the active status.
- Column C for the product name.
- Column D for the lot ID.
- Column E for the supplier ID.
- Column F for weight.
- Column G for units.
- Column H for received date.
- Column I for location.

`updateNonCanInventory` updates column F.

### Transaction_Log

The `Transaction_Log` sheet must contain the generated inventory key in column A. A timestamp is written in column B.

Expected structure:

| Column | Value |
|---|---|
| A | Deterministic inventory key |
| B | Date and time the key was recorded |

### Transactions

The `Transactions` sheet receives one row per cannabis lot affected by a work-order transaction.

Rows contain:

```text
UUID
Lot ID
Work-order ID
Transaction date
Recorded timestamp
Operation
Weight change
Resulting weight
```

## Main Functions

### `writeToInventory`

```javascript
writeToInventory(
  wo_id,
  operation,
  date,
  can_IP_ids,
  can_IP_weight,
  can_IP_lots,
  can_OP_ids,
  can_OP_weight,
  can_OP_lots,
  can_OP_flags,
  non_can_IP_ids,
  non_can_IP_weight,
  non_can_IP_lots,
  non_can_OP_ids,
  non_can_OP_weight,
  non_can_OP_lots
)
```

Primary entry point for AppSheet inventory updates.

The function:

1. Converts input and output arrays into grouped lot objects.
2. Creates a deterministic inventory key.
3. Exits without changes when no input or output IDs are supplied.
4. Acquires a script-wide lock.
5. Checks `Transaction_Log` for an existing inventory key.
6. Exits if the transaction has already been processed.
7. Appends the new key to `Transaction_Log`.
8. Updates cannabis inventory.
9. Updates non-cannabis inventory.
10. Flushes spreadsheet changes.
11. Releases the lock.

Return values:

| Return value | Meaning |
|---|---|
| `true` | Inventory update completed successfully, or the transaction was already handled without error. |
| `false` | An inventory update failed or an exception occurred. |
| `null` | No input/output IDs were supplied, or the transaction key already existed. |

### Duplicate protection

The inventory key is based on:

```text
work-order ID
cannabis input IDs
cannabis output IDs
non-cannabis input IDs
non-cannabis output IDs
```

Each ID list is sorted before the key is generated. This means the same IDs produce the same key even if AppSheet sends them in a different order.

Example conceptual key:

```text
WO-1001::IP-1|IP-2::OP-1::NIP-1::NOP-1
```

The transaction log acts as an idempotency record. It prevents the same work-order inventory event from being applied more than once.

> Important: the current implementation writes the inventory key to `Transaction_Log` before completing both inventory updates. If a later update fails, a retry may see the existing key and skip the transaction. Consider implementing a transaction status such as `Started`, `Completed`, or `Failed` if automatic retry and recovery are required.

### `updateBulkInventory`

Updates cannabis inventory in the `Bulk Inventory Report` sheet.

The function:

- Reads current lot weights from the `lotNumbers` sheet.
- Loads cannabis inventory rows.
- Builds a map from lot number to row index.
- Groups inventory, retention, and destruction changes by lot.
- Applies changes to the appropriate columns.
- Writes lot-level transaction records.

Operation behavior:

| Operation | Input behavior | Output behavior |
|---|---|---|
| Normal operation | Subtracts inputs from available inventory. | Adds outputs to available inventory unless flagged for destruction. |
| `Destruction` | Adds input weight to the destruction column. | Outputs are ignored because the operation is excluded by `NOT_AFFECT_OUTPUT`. |
| `Retention Sample` | Subtracts input weight from inventory and records the retention amount. | Outputs are ignored. |
| `Lab Sample` | Processes inputs normally. | Outputs are ignored. |

The current configuration is:

```javascript
NOT_AFFECT = [];
NOT_AFFECT_OUTPUT = [
  'Retention Sample',
  'Destruction',
  'Lab Sample'
];
```

`NOT_AFFECT` is currently unused.

### `updateNonCanInventory`

Updates non-cannabis inventory in the `Non-Cannabis Inventory` sheet.

For every input and output:

1. Finds the row using the record ID in column A.
2. Reads the current weight from column F.
3. Adds the supplied signed weight.
4. Writes the result back to column F.

Inputs are created with negative weights. Outputs are created with positive weights.

> Important: `findRowByLotId` returns `null` when no matching record is found. The current implementation does not explicitly check for `null` before calling `getRange`. A missing record will therefore cause an exception and return `false`.

### `writeToLotTransactionSheet`

Writes cannabis lot transactions to the `Transactions` sheet.

The function calls `getLotWeightChanges` to calculate each lot's net change, then writes:

```javascript
[
  transactionUuid,
  lotId,
  wo_id,
  date,
  recordedTimestamp,
  operation,
  weightChange,
  resultingWeight
]
```

Destruction outputs are excluded from the transaction calculation because they do not represent cannabis remaining in the lot's normal inventory balance.

### `addLotToBulkInventory`

Adds a new cannabis lot or updates an existing cannabis lot.

The function:

1. Acquires a script-wide lock.
2. Searches for the lot number in the configured lot ID column.
3. Reuses the existing row when found.
4. Otherwise finds the next empty row.
5. Writes the supplied lot metadata.
6. Flushes the spreadsheet.
7. Releases the lock.

Only the configured lot fields are changed. Other values in the row remain untouched.

### `addEditNonCannabisLots`

Adds or updates a non-cannabis lot.

The function searches for `recordId` in column A. It updates the existing row when found; otherwise, it writes the record to the next available row.

The values are written in this order:

```javascript
[
  recordId,
  Active,
  productName,
  lotId,
  supplierId,
  weight,
  units,
  receivedDate,
  location
]
```

## Helper Functions

### `createInputsOrOutputs`

Converts parallel lot and weight arrays into grouped objects.

Example:

```javascript
createInputsOrOutputs(
  ['LOT-1', 'LOT-1', 'LOT-2'],
  [5, 3, 2],
  true
);
```

Returns:

```javascript
[
  { lotNumber: 'LOT-1', weight: -8 },
  { lotNumber: 'LOT-2', weight: -2 }
]
```

When `neg` is `true`, weights are converted to negative values. When `neg` is `false`, weights remain positive.

### `createOutputs`

Converts output lot, weight, and destruction-flag arrays into grouped objects.

The grouping key combines the lot number and flag:

```javascript
`${lotNumber}-${flag}`
```

This keeps normal outputs and destruction outputs separate even when they use the same lot number.

Example result:

```javascript
[
  { lotNumber: 'LOT-1', weight: 10, flag: false },
  { lotNumber: 'LOT-1', weight: 2, flag: true }
]
```

### `getLotWeightChanges`

Combines cannabis inputs and outputs into a map of net lot changes.

Inputs are expected to already have negative weights. Outputs are positive unless they are marked for destruction.

Example:

```javascript
getLotWeightChanges(
  [{ lotNumber: 'LOT-1', weight: -10 }],
  [{ lotNumber: 'LOT-1', weight: 6, flag: false }]
);
```

Returns:

```javascript
{
  'LOT-1': -4
}
```

### `makeInventoryKey`

Creates the deterministic key used for duplicate detection.

The function returns `null` when all four ID lists are empty:

- Cannabis input IDs.
- Cannabis output IDs.
- Non-cannabis input IDs.
- Non-cannabis output IDs.

Otherwise, it sorts each list and joins the values into a stable string.

### `findRowByLotId`

Searches a single column for a matching lot or record ID.

Comparison is performed after converting values to strings and trimming whitespace. The function returns:

- A one-based sheet row number when a match is found.
- `null` when no match is found.

### `getNextEmptyRowForColumn`

Scans a column starting at the supplied row and returns the first empty row. If no empty row exists, it returns the row after the current last row.

## AppSheet Integration

The following functions are intended to be called by AppSheet or AppSheet automation:

- `writeToInventory`
- `addLotToBulkInventory`
- `addEditNonCannabisLots`

The AppSheet inputs must provide parallel arrays with matching positions. For example:

```text
can_IP_lots[0] corresponds to can_IP_weight[0]
can_IP_lots [developers.google](https://developers.google.com/apps-script/reference/lock/lock) corresponds to can_IP_weight [developers.google](https://developers.google.com/apps-script/reference/lock/lock)
```

For outputs:

```text
can_OP_lots[0] corresponds to can_OP_weight[0]
can_OP_lots[0] corresponds to can_OP_flags[0]
```

Before calling the script, verify that:

- All parallel arrays have the same length.
- IDs are unique when they are intended to identify individual AppSheet records.
- Weights are numeric.
- Lot numbers are not blank.
- Operation names exactly match the configured values, including capitalization.
- Date values are valid Google Apps Script date-compatible values.
- The Apps Script project has access to every referenced spreadsheet.

## Concurrency and Locking

The project uses script locks around operations that modify shared spreadsheets. `getScriptLock()` prevents simultaneous executions of the script from entering the protected section, regardless of which user or trigger started the execution. [developers.google](https://developers.google.com/apps-script/reference/lock)

Locks are released inside `finally` blocks, ensuring that they are released even when an exception occurs. Spreadsheet changes are flushed before the lock is released, which is the recommended pattern when a lock protects spreadsheet writes. [developers.google](https://developers.google.com/apps-script/reference/lock/lock)

The current lock timeout is 60 seconds:

```javascript
lock.waitLock(60000);
```

If the lock cannot be acquired within that period, `waitLock` throws an exception and the calling function sends an alert email.

## Error Handling

Most top-level operations use this pattern:

```javascript
try {
  // Read and write spreadsheet data.
} catch (error) {
  MailApp.sendEmail({
    to: 'bella@growtown.ca',
    subject: 'WORK LOG SCRIPT ALERT: Operation Failed',
    body: 'Error: ' + error.toString()
  });

  return false;
}
```

The following error notification categories are currently used:

- Update inventory.
- Update cannabis bulk inventory.
- Update non-cannabis inventory.
- Write lot transaction.
- Add or update cannabis lot.
- Add or update non-cannabis lot.

Errors should also be reviewed in the Apps Script execution history and Cloud Logging console.

## Known Implementation Considerations

The following items should be reviewed before extending the project:

- Several variables are assigned without `const`, `let`, or `var`, including `can_inputs`, `can_outputs`, `non_can_inputs`, `non_can_outputs`, `transactionSheet`, and `toAppend`. In Apps Script, undeclared variables can become global variables and make debugging more difficult. Declare them explicitly.
- `LAST_ROW` is hard-coded to `400`. Lots beyond row 400 are ignored by `updateBulkInventory`.
- `updateBulkInventory` silently skips a lot when its lot number is not found in the inventory sheet. Consider logging or rejecting missing lots.
- `updateNonCanInventory` does not explicitly handle a missing record row.
- `writeToInventory` appends the duplicate-protection key before all updates have completed.
- `addLotToBulkInventory` writes each cell individually. A single `setValues` call would reduce spreadsheet service calls.
- `updateBulkInventory` writes each changed cell individually. Batched range updates would improve performance for larger transactions.
- Array lengths are not validated before indexing corresponding weight and flag arrays.
- `createInputsOrOutputs` and `createOutputs` use object keys based on lot values. Blank or unusual lot values should be validated before processing.
- Email recipients and alert subjects are hard-coded.
- `NOT_AFFECT` is defined but not used.
- `testForErrorAddLot` calls `addLotToBulkInventory` with no arguments and is only suitable as a deliberate failure test.
- The transaction log lookup reads the entire data range on every call. For a large log, consider indexing keys or using a more scalable data store.
- The inventory update is not fully transactional across multiple spreadsheets. Google Sheets writes cannot be rolled back automatically if one later operation fails.

## Testing Checklist

### Helper tests

Test the following cases:

- Empty input arrays.
- `null` and `undefined` lists.
- Repeated lot numbers.
- Repeated lots with different output flags.
- Blank lot numbers.
- Missing weights.
- Non-numeric weights.
- Positive and negative weights.
- IDs supplied in different orders to `makeInventoryKey`.

### Inventory tests

Test each operation type:

- Normal production operation.
- `Destruction`.
- `Retention Sample`.
- `Lab Sample`.
- Operation with both cannabis and non-cannabis items.
- Operation with only cannabis items.
- Operation with only non-cannabis items.
- Operation with no input or output IDs.
- Operation containing a missing lot number.
- Repeated invocation with the same IDs.
- Two simultaneous invocations for the same work order.

### Lot-management tests

For cannabis lots:

- Add a new lot.
- Update an existing lot.
- Use a lot number with surrounding whitespace.
- Use an empty inventory sheet.
- Use a sheet with gaps between records.

For non-cannabis lots:

- Add a new record.
- Update an existing record.
- Update the weight through an inventory transaction.
- Attempt to process a missing record ID.

## Permissions

The first execution may request permission to:

- Read and modify Google Sheets.
- Send email alerts.
- Use Apps Script services such as `LockService`, `PropertiesService`, and `Utilities`.

The Apps Script execution identity must have edit access to every spreadsheet referenced by the configured script properties. `MailApp.sendEmail` also requires authorization to send alert messages.

## Suggested Project Structure

If the project is split into multiple `.gs` files, the following structure is recommended:

```text
Config.gs
  Spreadsheet names
  Column constants
  Operation lists

InventoryEntryPoints.gs
  writeToInventory
  addLotToBulkInventory
  addEditNonCannabisLots

CannabisInventory.gs
  updateBulkInventory
  writeToLotTransactionSheet
  getLotWeightChanges

NonCannabisInventory.gs
  updateNonCanInventory

Helpers.gs
  createInputsOrOutputs
  createOutputs
  makeInventoryKey
  findRowByLotId
  getNextEmptyRowForColumn

Tests.gs
  testForErrorAddLot
  Additional test functions
```

Google Apps Script loads functions across project files, so this organization is for maintainability rather than module isolation.
