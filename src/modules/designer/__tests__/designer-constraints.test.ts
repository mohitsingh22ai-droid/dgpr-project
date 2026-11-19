import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculatePrintBounds,
  computeFittedFontSize,
  checkSafetyViolation,
} from "../utils/print-constraints";
import { PrintDimensions, SerializedCanvasState } from "../types";

describe("Designer Print Constraints & Fitting Tests (§ 06 & § 04)", () => {
  const sampleDims: PrintDimensions = {
    widthMm: 100,
    heightMm: 80,
    bleedMm: 3.0,
    safetyMarginMm: 3.0,
  };

  it("calculates exact physical millimetric zones into pixel bounds", () => {
    const bounds = calculatePrintBounds(sampleDims, 800, 600);

    // Scale factor should be positive
    assert.ok(bounds.scaleFactor > 0);

    // Bleed width should be (width + 2 * bleed) * scaleFactor
    const expectedBleedWidth = (sampleDims.widthMm + sampleDims.bleedMm * 2) * bounds.scaleFactor;
    assert.equal(Math.round(bounds.bleedWidth), Math.round(expectedBleedWidth));

    // Trim box should match product dimensions
    const expectedTrimWidth = sampleDims.widthMm * bounds.scaleFactor;
    assert.equal(Math.round(bounds.trimWidth), Math.round(expectedTrimWidth));

    // Safe zone width should be (width - 2 * safetyMargin) * scaleFactor
    const expectedSafeWidth = (sampleDims.widthMm - sampleDims.safetyMarginMm * 2) * bounds.scaleFactor;
    assert.equal(Math.round(bounds.safeWidth), Math.round(expectedSafeWidth));
  });

  describe("Placeholder Fitting Rules (§ 04: Shrink-to-fit)", () => {
    it("preserves base font size when text fits within target width", () => {
      const fitted = computeFittedFontSize("SHORT", 300, 24, 10, 48);
      assert.equal(fitted, 24);
    });

    it("automatically shrinks font size when text exceeds printable width", () => {
      const longText = "VERY LONG HEADLINE TEXT THAT WILL OVERFLOW PRINT AREA WITHOUT SHRINK-TO-FIT";
      const targetWidth = 150;
      const fitted = computeFittedFontSize(longText, targetWidth, 28, 10, 48);

      // Must be scaled down to fit
      assert.ok(fitted < 28);
      // But clamped to minimum readable font size
      assert.ok(fitted >= 10);
    });

    it("clamps font size to maxFontSize limit", () => {
      const fitted = computeFittedFontSize("A", 1000, 80, 10, 48);
      assert.equal(fitted, 48); // clamped to max limit 48
    });
  });

  describe("Safety Zone Boundary Violations (§ 06: unprintable artwork prevention)", () => {
    it("passes when element is strictly inside safe zone", () => {
      const bounds = calculatePrintBounds(sampleDims, 800, 600);
      const isViolated = checkSafetyViolation(
        bounds.safeOffsetX + 10,
        bounds.safeOffsetY + 10,
        bounds.safeWidth - 20,
        bounds.safeHeight - 20,
        bounds
      );
      assert.equal(isViolated, false);
    });

    it("flags violation when element overflows past left safe margin", () => {
      const bounds = calculatePrintBounds(sampleDims, 800, 600);
      const isViolated = checkSafetyViolation(
        bounds.safeOffsetX - 15, // shifted past left boundary
        bounds.safeOffsetY + 10,
        50,
        30,
        bounds
      );
      assert.equal(isViolated, true);
    });

    it("flags violation when element overflows past right safe margin", () => {
      const bounds = calculatePrintBounds(sampleDims, 800, 600);
      const isViolated = checkSafetyViolation(
        bounds.safeOffsetX,
        bounds.safeOffsetY,
        bounds.safeWidth + 30, // exceeds right edge
        30,
        bounds
      );
      assert.equal(isViolated, true);
    });
  });

  describe("Canvas State Serialization (§ 06: Saved designs)", () => {
    it("serializes and deserializes canvas state JSON cleanly", () => {
      const sampleState: SerializedCanvasState = {
        version: "1.0",
        timestamp: new Date().toISOString(),
        productSlug: "custom-die-cut-vinyl",
        dimensionsMm: sampleDims,
        backgroundColor: "#FFFFFF",
        elements: [
          {
            id: "el-1",
            type: "text",
            x: 20,
            y: 30,
            text: "TEST",
            fontSize: 20,
            fontFamily: "Plus Jakarta Sans",
            fill: "#000000",
            align: "center",
            rotation: 0,
            opacity: 1,
          },
        ],
      };

      const jsonStr = JSON.stringify(sampleState);
      const parsed: SerializedCanvasState = JSON.parse(jsonStr);

      assert.equal(parsed.version, "1.0");
      assert.equal(parsed.productSlug, "custom-die-cut-vinyl");
      assert.equal(parsed.elements.length, 1);
      assert.equal(parsed.elements[0].type, "text");
    });
  });
});
