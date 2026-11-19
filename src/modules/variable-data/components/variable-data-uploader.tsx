"use client";

import React, { useState } from "react";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  Download,
} from "lucide-react";

const SAMPLE_CSV = `BibNumber,AthleteName,Category,EmergencyContact
101,ALEXANDER MACLEOD,Men Elite Downhill,+44 7700 900101
102,BEATRICE CHEN,Women Pro Enduro,+44 7700 900102
103,CHRISTOPHER VANCE-WORTHINGTON,Master 40+ Super-D,+44 7700 900103
104,DANIELLE O'CONNOR,Junior U19 Expert,+44 7700 900104
105,ETHAN FITZGERALD-KLEIN,Men Amateur Open,+44 7700 900105`;

export function VariableDataUploader({
  productName = "Tyvek Race Bibs",
  widthMm = 210,
  heightMm = 148,
}: {
  productName?: string;
  widthMm?: number;
  heightMm?: number;
}) {
  const [csvRaw, setCsvRaw] = useState<string>(SAMPLE_CSV);
  const [headers, setHeaders] = useState<string[]>(["BibNumber", "AthleteName", "Category", "EmergencyContact"]);
  const [rows, setRows] = useState<Record<string, string>[]>([
    { BibNumber: "101", AthleteName: "ALEXANDER MACLEOD", Category: "Men Elite Downhill", EmergencyContact: "+44 7700 900101" },
    { BibNumber: "102", AthleteName: "BEATRICE CHEN", Category: "Women Pro Enduro", EmergencyContact: "+44 7700 900102" },
    { BibNumber: "103", AthleteName: "CHRISTOPHER VANCE-WORTHINGTON", Category: "Master 40+ Super-D", EmergencyContact: "+44 7700 900103" },
    { BibNumber: "104", AthleteName: "DANIELLE O'CONNOR", Category: "Junior U19 Expert", EmergencyContact: "+44 7700 900104" },
    { BibNumber: "105", AthleteName: "ETHAN FITZGERALD-KLEIN", Category: "Men Amateur Open", EmergencyContact: "+44 7700 900105" },
  ]);

  const [numberCol, setNumberCol] = useState<string>("BibNumber");
  const [nameCol, setNameCol] = useState<string>("AthleteName");
  const [subCol, setSubCol] = useState<string>("Category");

  const [isMerging, setIsMerging] = useState<boolean>(false);
  const [mergeStatus, setMergeStatus] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      setCsvRaw(text);
      const parsed = Papa.parse<Record<string, string>>(text.trim(), {
        header: true,
        skipEmptyLines: true,
      });

      const parsedHeaders = parsed.meta.fields || [];
      setHeaders(parsedHeaders);
      setRows(parsed.data);

      if (parsedHeaders.length > 0) setNumberCol(parsedHeaders[0]);
      if (parsedHeaders.length > 1) setNameCol(parsedHeaders[1]);
      if (parsedHeaders.length > 2) setSubCol(parsedHeaders[2]);
    };
    reader.readAsText(file);
  };

  const handleRunServerMerge = async () => {
    setIsMerging(true);
    setMergeStatus(null);

    try {
      const res = await fetch("/api/variable-data/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: `DH-VAR-${Math.floor(100 + Math.random() * 900)}`,
          productType: "RaceBibs",
          widthMm,
          heightMm,
          bleedMm: 3.0,
          csvContent: csvRaw,
          fieldMappings: {
            numberCol,
            nameCol,
            subCol,
          },
        }),
      });

      if (!res.ok) {
        throw new Error("Server merge request failed");
      }

      // Convert response to blob and trigger browser download
      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `DH_VariableData_Batch_${rows.length}Rows_300DPI.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setMergeStatus(`Success! Server compiled and downloaded a ${rows.length}-page 300 DPI batch PDF with crop marks.`);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Error executing merge";
      setMergeStatus(`Error: ${errorMsg}`);
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <Card className="border-border shadow-elevation">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono font-semibold text-brand-500 uppercase">
            <FileSpreadsheet className="w-4 h-4" />
            <span>CSV Variable-Data Batch Engine</span>
          </div>
          <Badge variant="industrial" className="text-[10px]">
            SERVER-SIDE BATCH RIP
          </Badge>
        </div>
        <CardTitle className="text-xl font-bold font-heading">
          Automated Variable Print Generation for {productName}
        </CardTitle>
        <CardDescription>
          Upload attendee, athlete, or trophy recipient CSV data. The server automatically maps fields, scales long text, and compiles a single production-ready multi-page PDF.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Upload Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-secondary/40 border">
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-semibold bg-industrial-950 text-white hover:bg-industrial-900 h-9 px-4 cursor-pointer shadow-sm transition-colors">
              <UploadCloud className="w-3.5 h-3.5 mr-1.5 text-brand-500" />
              Upload Custom CSV
              <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
            </label>
            <span className="text-xs font-mono text-muted-foreground">
              Loaded: <strong>{rows.length} records</strong>
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCsvRaw(SAMPLE_CSV);
              const parsed = Papa.parse<Record<string, string>>(SAMPLE_CSV.trim(), { header: true });
              setHeaders(parsed.meta.fields || []);
              setRows(parsed.data);
            }}
            className="text-xs font-mono"
          >
            Reset to Sample Marathon Bibs
          </Button>
        </div>

        {/* Column Mapping Selector (§ 07) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl border bg-card text-xs font-mono">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-foreground">Big Number Column</Label>
            <select
              value={numberCol}
              onChange={(e) => setNumberCol(e.target.value)}
              className="w-full text-xs font-mono bg-background border rounded h-9 px-2.5 focus:ring-1 focus:ring-brand-500"
            >
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] text-foreground">Name Placeholder (Auto-Fit)</Label>
            <select
              value={nameCol}
              onChange={(e) => setNameCol(e.target.value)}
              className="w-full text-xs font-mono bg-background border rounded h-9 px-2.5 focus:ring-1 focus:ring-brand-500"
            >
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] text-foreground">Category / Team Column</Label>
            <select
              value={subCol}
              onChange={(e) => setSubCol(e.target.value)}
              className="w-full text-xs font-mono bg-background border rounded h-9 px-2.5 focus:ring-1 focus:ring-brand-500"
            >
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Live Data Preview Table */}
        <div className="border rounded-xl overflow-hidden">
          <div className="bg-secondary/60 px-4 py-2 text-xs font-mono font-semibold text-muted-foreground flex justify-between">
            <span>PARSED CSV DATA PREVIEW (FIRST 5 ROWS)</span>
            <span>SHRINK-TO-FIT ACTIVE</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="p-2.5 text-left font-semibold">Row #</th>
                  <th className="p-2.5 text-left font-semibold text-brand-500">Number ({numberCol})</th>
                  <th className="p-2.5 text-left font-semibold">Name ({nameCol})</th>
                  <th className="p-2.5 text-left font-semibold">Category ({subCol})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.slice(0, 5).map((row, idx) => (
                  <tr key={idx} className="hover:bg-muted/20">
                    <td className="p-2.5 text-muted-foreground">{idx + 1}</td>
                    <td className="p-2.5 font-bold text-foreground">{row[numberCol]}</td>
                    <td className="p-2.5 text-foreground">{row[nameCol]}</td>
                    <td className="p-2.5 text-muted-foreground">{row[subCol]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {mergeStatus && (
          <div
            className={`p-4 rounded-lg text-xs font-mono font-semibold flex items-center gap-2 ${
              mergeStatus.startsWith("Success")
                ? "bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 text-emerald-800 dark:text-emerald-300"
                : "bg-destructive/10 border border-destructive/20 text-destructive"
            }`}
          >
            {mergeStatus.startsWith("Success") ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : null}
            <span>{mergeStatus}</span>
          </div>
        )}

        {/* Action Button */}
        <div className="pt-2">
          <Button
            size="lg"
            onClick={handleRunServerMerge}
            disabled={isMerging}
            className="w-full font-semibold shadow-glow text-sm h-12"
          >
            {isMerging ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Compiling Multi-Page 300 DPI PDF on Server...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                Execute Server-Side CSV Merge & Download Batch PDF ({rows.length} Pages)
              </span>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
