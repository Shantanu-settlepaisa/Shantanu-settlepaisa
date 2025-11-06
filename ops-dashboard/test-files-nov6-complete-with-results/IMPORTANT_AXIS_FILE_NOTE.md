# ⚠️ IMPORTANT: AXIS Bank File Extension

## Issue Identified

The AXIS bank file is **NOT being uploaded** (Inserted=0) when using the `.csv` extension.

## Root Cause

- **Database Configuration**: AXIS BANK is configured with `file_type = 'txt'` and `delimiter = '~'`
- **Backend Behavior**: When a file has `.csv` extension, the backend treats it as comma-delimited CSV
- **Result**: The tilde-delimited content is not parsed correctly, causing 0 insertions

## Solution

**Use the `.txt` file instead of `.csv` file for AXIS BANK**

### Files Available:
- ❌ `test-axis-60-records-nov6.csv` - **DO NOT USE** (will not upload)
- ✅ `test-axis-60-records-nov6.txt` - **USE THIS FILE** (will upload correctly)

Both files have identical content, only the extension differs.

## Upload Instructions

### Correct Upload Sequence:
```
1. Upload test-pg-180-records-nov6.csv      (✅ CSV format)
2. Upload test-hdfc-60-records-nov6.csv     (✅ CSV format)
3. Upload test-bob-60-records-nov6.csv      (✅ CSV format)
4. Upload test-axis-60-records-nov6.txt     (✅ TXT format - IMPORTANT!)
   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
   USE .TXT NOT .CSV!
```

## Why This Matters

The file extension determines how the backend parser reads the file:
- `.csv` extension → Comma delimiter (`,`) used
- `.txt` extension → Database delimiter (`~`) used

Since AXIS uses tilde (`~`) delimiters, the `.txt` extension is required.

## Verification

After uploading the `.txt` file, you should see:
```
✅ [V2 Upload] File 1/1 uploaded successfully: test-axis-60-records-nov6.txt
📊 Processing: Inserted=60, Skipped=0, Duplicates=0
```

**NOT**:
```
❌ Processing: Inserted=0, Skipped=0, Duplicates=0  ← This means wrong file used
```

## Alternative Solution (Not Recommended)

If you want to use `.csv` extension, you would need to:
1. Update database: `UPDATE sp_v2_bank_column_mappings SET file_type = 'csv', delimiter = '~' WHERE bank_name = 'AXIS BANK';`
2. But this is inconsistent with how AXIS bank provides their files in production

## Production Context

In production, AXIS bank typically provides files with `.txt` extension because they use non-standard delimiters. This test file setup mirrors production reality.

---

**Generated**: November 6, 2025
**Status**: ✅ .txt file created and ready for use
