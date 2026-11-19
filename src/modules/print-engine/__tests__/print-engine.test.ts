import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateStandardPrintFileName,
  generateStandardOrderDirectory,
  getFullStandardFilePath,
} from "../file-naming";
import { generateProductionPdf, MM_TO_PT } from "../pdf-generator";
import { mergeVariableDataCsv } from "../../variable-data/csv-merger";

describe("Print-File & Variable-Data Engine Tests (§ 07)", () => {
  describe("Standardized File Naming & Directories (§ 07)", () => {
    const fixedDate = new Date("2026-03-15T12:00:00Z");

    it("generates correct OrderID_ProductType_Date_Output naming convention", () => {
      const fileName = generateStandardPrintFileName({
        orderId: "DH-2026-00101",
        productType: "DieCutVinyl",
        extension: "pdf",
        date: fixedDate,
      });

      assert.equal(fileName, "DH-2026-00101_DieCutVinyl_20260315_Output.pdf");
    });

    it("enforces order-based directory structure /orders/[OrderID]/", () => {
      const dir = generateStandardOrderDirectory("DH-2026-00101");
      assert.equal(dir, "/orders/DH-2026-00101/");
    });

    it("combines directory and filename predictably", () => {
      const fullPath = getFullStandardFilePath({
        orderId: "DH-2026-00101",
        productType: "RaceBibs",
        date: fixedDate,
      });
      assert.equal(fullPath, "/orders/DH-2026-00101/DH-2026-00101_RaceBibs_20260315_Output.pdf");
    });
  });

  describe("Server-Side 300 DPI Production PDF Generation", () => {
    it("generates valid PDF binary with accurate trim and bleed boxes", async () => {
      const result = await generateProductionPdf({
        orderId: "DH-TEST-001",
        productType: "Sticker",
        widthMm: 100,
        heightMm: 75,
        bleedMm: 3.0,
      });

      // Verify PDF signature (%PDF-)
      const header = Buffer.from(result.pdfBytes.slice(0, 5)).toString("utf-8");
      assert.equal(header, "%PDF-");

      // Verify exact trim box point dimensions
      const expectedTrimWidth = 100 * MM_TO_PT;
      const expectedTrimHeight = 75 * MM_TO_PT;
      assert.equal(Math.round(result.trimBoxPt.width), Math.round(expectedTrimWidth));
      assert.equal(Math.round(result.trimBoxPt.height), Math.round(expectedTrimHeight));

      assert.equal(result.bleedMm, 3.0);
      assert.equal(result.dpi, 300);
      assert.ok(result.pdfBytes.length > 500);
    });
  });

  describe("CSV Variable-Data Merge Engine (§ 07)", () => {
    const sampleCsv = `BibNumber,AthleteName,Category
101,ALEXANDER MACLEOD,Men Elite
102,BEATRICE CHEN,Women Pro
103,CHRISTOPHER VANCE-WORTHINGTON,Master 40+`;

    it("processes all CSV rows server-side into a multi-page PDF batch", async () => {
      const result = await mergeVariableDataCsv({
        orderId: "DH-MARATHON-2026",
        productType: "TyvekBibs",
        widthMm: 210,
        heightMm: 148,
        bleedMm: 3.0,
        csvContent: sampleCsv,
        fieldMappings: {
          numberCol: "BibNumber",
          nameCol: "AthleteName",
          subCol: "Category",
        },
      });

      assert.equal(result.totalRows, 3);
      assert.equal(result.processedRows, 3);
      assert.ok(result.fileName.includes("DH-MARATHON-2026"));
      assert.ok(result.fileName.includes("VariableMerged"));

      // Valid PDF bytes
      const header = Buffer.from(result.pdfBytes.slice(0, 5)).toString("utf-8");
      assert.equal(header, "%PDF-");
      assert.ok(result.pdfBytes.length > 1000);
    });

    it("throws clear error when CSV content is empty", async () => {
      await assert.rejects(
        async () => {
          await mergeVariableDataCsv({
            orderId: "DH-EMPTY",
            productType: "Bibs",
            widthMm: 200,
            heightMm: 140,
            csvContent: "",
            fieldMappings: { numberCol: "A", nameCol: "B" },
          });
        },
        {
          message: "CSV file contains no valid data rows.",
        }
      );
    });
  });
});
