"use client";

import { useState } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { MarkdownPreview } from "@/components/markdown-preview";
import { MetadataForm } from "@/components/metadata-form";
import type { Topic, Source, AgeCategory } from "@/db/schema";
import {
  createProblemAction,
  updateProblemAction,
} from "@/app/admin/problems/_actions";

// CodeMirror is heavy and only matters in the browser, so lazy-load it.
const MarkdownEditor = dynamic(
  () => import("@/components/markdown-editor").then((m) => m.MarkdownEditor),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-xl ring-1 ring-foreground/10 bg-card p-4 min-h-[500px] text-muted-foreground text-sm">
        Loading editor…
      </div>
    ),
  }
);

const formSchema = z.object({
  bodyMd: z.string().min(1, "Masala matni bo'sh bo'lmasligi kerak"),
  solutionMd: z.string().nullable(),
  answer: z.string().nullable(),
  sourceId: z.string().uuid("Manbani tanlang"),
  year: z.number().int().min(1900).max(2100).nullable(),
  problemNumber: z.string().max(50).nullable(),
  topicIds: z.array(z.string()).min(1, "Kamida bitta mavzu tanlang"),
  classes: z.array(z.number()).min(1, "Kamida bitta sinfni tanlang"),
  ageCategoryIds: z.array(z.string()),
});

export type ProblemFormValues = z.infer<typeof formSchema>;

export interface ProblemFormProps {
  mode: "create" | "edit";
  problemId?: string;
  defaultValues: ProblemFormValues;
  topicsAvailable: Topic[];
  sourcesAvailable: Source[];
  ageCategoriesAvailable: AgeCategory[];
  uploadPrefix: string;
  /** Compact mode — used by the new-problem modal. Hides the "Yechim" tab
   *  and the "Yil", "Masala raqami", "Javob" metadata fields. */
  compact?: boolean;
  /** Optional cancel handler — when present (modal flow) renders a
   *  "Bekor qilish" button alongside the primary action. */
  onCancel?: () => void;
}

export function ProblemForm({
  mode,
  problemId,
  defaultValues,
  topicsAvailable,
  sourcesAvailable,
  ageCategoriesAvailable,
  uploadPrefix,
  compact = false,
  onCancel,
}: ProblemFormProps) {
  const methods = useForm<ProblemFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
    mode: "onSubmit",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  async function onSubmit(values: ProblemFormValues) {
    setIsSaving(true);
    setServerError(null);
    try {
      const result =
        mode === "create"
          ? await createProblemAction(values)
          : await updateProblemAction(problemId!, values);
      if (result && "error" in result) {
        setServerError(result.error);
      }
    } catch (e) {
      if (
        e &&
        typeof e === "object" &&
        "digest" in e &&
        typeof (e as { digest: unknown }).digest === "string" &&
        (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
      ) {
        throw e;
      }
      setServerError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  }

  const bodyMd = methods.watch("bodyMd");
  const solutionMd = methods.watch("solutionMd") ?? "";

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={methods.handleSubmit(onSubmit)}
        className="grid grid-rows-[1fr_auto] min-h-0"
      >
        {/* Scrollable body — content can grow, footer stays pinned. */}
        <div className="overflow-y-auto px-5 py-4 space-y-5">
          <section className="space-y-3">
            <SectionLabel>Masala matni</SectionLabel>
            {compact ? (
              <>
                <SplitView
                  source={bodyMd}
                  onChange={(v) =>
                    methods.setValue("bodyMd", v, { shouldDirty: true })
                  }
                  uploadPrefix={uploadPrefix}
                />
                <FieldHint message={methods.formState.errors.bodyMd?.message} />
              </>
            ) : (
              <Tabs defaultValue="problem" className="w-full">
                <TabsList>
                  <TabsTrigger value="problem">Shart</TabsTrigger>
                  <TabsTrigger value="solution">Yechim</TabsTrigger>
                </TabsList>

                <TabsContent value="problem">
                  <SplitView
                    source={bodyMd}
                    onChange={(v) =>
                      methods.setValue("bodyMd", v, { shouldDirty: true })
                    }
                    uploadPrefix={uploadPrefix}
                  />
                  <FieldHint
                    message={methods.formState.errors.bodyMd?.message}
                  />
                </TabsContent>

                <TabsContent value="solution">
                  <SplitView
                    source={solutionMd}
                    onChange={(v) =>
                      methods.setValue(
                        "solutionMd",
                        v.length === 0 ? null : v,
                        { shouldDirty: true }
                      )
                    }
                    uploadPrefix={uploadPrefix}
                  />
                </TabsContent>
              </Tabs>
            )}
          </section>

          <section className="space-y-3">
            <SectionLabel>Tafsilotlar</SectionLabel>
            <MetadataForm
              topicsAvailable={topicsAvailable}
              sourcesAvailable={sourcesAvailable}
              ageCategoriesAvailable={ageCategoriesAvailable}
              compact={compact}
            />
          </section>
        </div>

        {/* Sticky footer — actions always visible regardless of scroll. */}
        <footer className="px-5 py-3 border-t bg-popover flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            {serverError && (
              <p className="text-sm text-destructive truncate">
                {serverError}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onCancel && (
              <Button
                type="button"
                variant="ghost"
                onClick={onCancel}
                disabled={isSaving}
              >
                Bekor qilish
              </Button>
            )}
            <Button type="submit" disabled={isSaving}>
              {isSaving
                ? "Saqlanmoqda…"
                : mode === "create"
                  ? "Yaratish"
                  : "Saqlash"}
            </Button>
          </div>
        </footer>
      </form>
    </FormProvider>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  // Tight uppercase eyebrow — same pattern as MetaRow on the detail page.
  return (
    <h3 className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
      {children}
    </h3>
  );
}

function FieldHint({ message }: { message?: unknown }) {
  if (typeof message !== "string" || !message) return null;
  return <p className="text-destructive text-xs mt-2">{message}</p>;
}

function SplitView({
  source,
  onChange,
  uploadPrefix,
}: {
  source: string;
  onChange: (v: string) => void;
  uploadPrefix: string;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div className="rounded-xl ring-1 ring-foreground/10 overflow-hidden bg-card">
        <MarkdownEditor
          value={source}
          onChange={onChange}
          uploadPrefix={uploadPrefix}
        />
      </div>
      <div className="rounded-xl ring-1 ring-foreground/10 bg-card p-4 min-h-[500px] overflow-auto">
        <MarkdownPreview source={source || "*Bo'sh*"} />
      </div>
    </div>
  );
}
