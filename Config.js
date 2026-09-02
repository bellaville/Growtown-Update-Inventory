// list of operations that should not affect inventory
NOT_AFFECT = [];
NOT_AFFECT_OUTPUT = ["Retention Sample", "Destruction", "Lab Sample"];

// variables needed for inventory update
const INVENTORY_SHEET_NAME = 'Bulk Inventory Report';
const START_ROW = 4;
const LOT_COL = 2;          // column B
const INVENTORY_COL = 7;    // column G
const RETENTION_COL = 20;   // column T
const DESTRUCTION_COL = 8; // column H
const LAST_ROW = 400;

// variables needed for adding new lot number
const STRAIN_ROW = 1;
const LOT_ID_ROW = 2;
const REPORTING_LOT_TYPE_ROW = 3;
const CANNABIS_FORM_ROW = 4;
const INPUT_IDS_ROW = 5;
const NOTES_ROW = 9;
const CRA_CATEGORY_ROW = 13;
const LOT_OWNER_ROW = 15;
const LOCATION_ROW = 17;
const CREATED_DATE = 23;

// variables needed for adding/editing non-cannabis lot
const NON_CANNABIS_INVENTORY_SHEET_NAME = 'Non-Cannabis Inventory';
const NON_CANNABIS_START_ROW = 2;