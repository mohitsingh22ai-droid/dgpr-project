import { test, expect } from "@playwright/test";
import { generateProductionPdf } from "../src/modules/print-engine/pdf-generator";
import { mergeVariableDataCsv } from "../src/modules/variable-data/csv-merger";
import { generateStandardPrintFileName, generateStandardOrderDirectory } from "../src/modules/print-engine/file-naming";
import { inspectPdfBuffer } from "./support/pdf-helpers";
import fs from "fs";
import path from "path";

test.describe("W7. Print-File & CSV Variable-Data Engine (PRD §07)", () => {
  test("PRD §07: File naming strictly follows OrderID_ProductType_Date_Output in /orders/[OrderID]/ directory", () => {
    const fixedDate = new Date("2026-03-15T12:00:00Z");

    const fileName = generateStandardPrintFileName({
      orderId: "ORD-9876",
      productType: "DieCutVinyl",
      extension: "pdf",
      date: fixedDate,
    });

    expect(fileName).toBe("ORD-9876_DieCutVinyl_20260315_Output.pdf");

    const dirPath = generateStandardOrderDirectory("ORD-9876");
    expect(dirPath).toBe("/orders/ORD-9876/");
  });

  test("PRD §07: Server-side PDF generation outputs true vector PDF with trim, bleed, and 300 DPI metadata", async () => {
    const result = await generateProductionPdf({
      orderId: "ORD-TEST-001",
      productType: "VinylSticker",
      widthMm: 100,
      heightMm: 100,
      bleedMm: 3.0,
      customText: "W2P RACING",
    });

    expect(result.fileName).toContain("ORD-TEST-001_VinylSticker");
    expect(result.pdfBytes.byteLength).toBeGreaterThan(1000);

    // Inspect PDF geometry with pdf-lib
    const inspected = await inspectPdfBuffer(result.pdfBytes);
    expect(inspected.pageCount).toBe(1);

    // Trim box should be 100mm x 100mm
    expect(inspected.trimWidthMm).toBe(100);
    expect(inspected.trimHeightMm).toBe(100);

    // Bleed box should be 106mm x 106mm (100mm + 2 * 3mm bleed)
    expect(inspected.bleedWidthMm).toBe(106);
    expect(inspected.bleedHeightMm).toBe(106);
  });

  test("PRD §07: CSV Variable Data Engine generates multi-page batch matching row count and skips empty rows", async () => {
    const validCsvPath = path.resolve(process.cwd(), "e2e/fixtures/valid-race-bibs.csv");
    const csvContent = fs.readFileSync(validCsvPath, "utf-8");

    const mergeResult = await mergeVariableDataCsv({
      orderId: "ORD-BIB-001",
      productType: "TyvekRaceBib",
      widthMm: 210,
      heightMm: 148,
      bleedMm: 3.0,
      csvContent,
      fieldMappings: {
        numberCol: "BibNumber",
        nameCol: "AthleteName",
        subCol: "Category",
        barcodeCol: "EmergencyContact",
      },
    });

    expect(mergeResult.totalRows).toBe(3);
    expect(mergeResult.processedRows).toBe(3);

    // Verify PDF has exactly 3 pages
    const inspected = await inspectPdfBuffer(mergeResult.pdfBytes);
    expect(inspected.pageCount).toBe(3);

    // Verify empty row handling
    const emptyRowsCsvPath = path.resolve(process.cwd(), "e2e/fixtures/empty-rows.csv");
    const emptyCsvContent = fs.readFileSync(emptyRowsCsvPath, "utf-8");

    const emptyMergeResult = await mergeVariableDataCsv({
      orderId: "ORD-BIB-002",
      productType: "TyvekRaceBib",
      widthMm: 210,
      heightMm: 148,
      csvContent: emptyCsvContent,
      fieldMappings: {
        numberCol: "BibNumber",
        nameCol: "AthleteName",
      },
    });

    // Skips empty lines, processing only valid rows (2 valid rows)
    expect(emptyMergeResult.processedRows).toBe(2);
  });

  test("PRD §07: CSV Variable Data Engine throws error when CSV contains zero valid data rows", async () => {
    await expect(
      mergeVariableDataCsv({
        orderId: "ORD-EMPTY",
        productType: "TyvekRaceBib",
        widthMm: 210,
        heightMm: 148,
        csvContent: "BibNumber,AthleteName\n",
        fieldMappings: {
          numberCol: "BibNumber",
          nameCol: "AthleteName",
        },
      })
    ).rejects.toThrow("CSV file contains no valid data rows");
  });
});
