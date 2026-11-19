import { VariableDataUploader } from "@/modules/variable-data/components/variable-data-uploader";

export const metadata = {
  title: "Variable Data & CSV Merge Engine · W2P Print House",
  description: "Server-side variable-data merge engine for race numbers, MTB boards, and bulk personalized jobs with per-placeholder fitting.",
};

export default function VariableDataPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div className="space-y-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-600 text-xs font-medium">
          Variable Data Engine
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold font-heading tracking-tight">
          CSV Variable-Data Batch Engine
        </h1>
        <p className="text-muted-foreground text-sm max-w-2xl">
          Automated server-side processing generating one artwork file per row for race numbers, mountain bike boards, and bulk jobs without manual operator tweaking.
        </p>
      </div>

      <VariableDataUploader />
    </div>
  );
}
