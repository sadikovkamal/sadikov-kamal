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
import type { Topic, Source } from "@/db/schema";
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
      <div className="border rounded-md p-4 min-h-[500px] text-muted-foreground text-sm">
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
  difficulty: z.number().int().min(1).max(5),
  topicIds: z.array(z.string()).min(1, "Kamida bitta mavzu tanlang"),
  classes: z.array(z.number()).min(1, "Kamida bitta sinfni tanlang"),
  tagNames: z.array(z.string()),
});

export type ProblemFormValues = z.infer<typeof formSchema>;

export interface ProblemFormProps {
  mode: "create" | "edit";
  problemId?: string;
  defaultValues: ProblemFormValues;
  topicsAvailable: Topic[];
  sourcesAvailable: Source[];
  uploadPrefix: string;
}

export function ProblemForm({
  mode,
  problemId,
  defaultValues,
  topicsAvailable,
  sourcesAvailable,
  uploadPrefix,
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
      // On success, the server action calls redirect(); execution doesn't
      // resume here. If we *do* reach this line, there was an error.
      if (result && "error" in result) {
        setServerError(result.error);
      }
    } catch (e) {
      // Next.js redirect() throws an internal NEXT_REDIRECT marker — let
      // the framework handle it. Anything else is a real error.
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
      <form onSubmit={methods.handleSubmit(onSubmit)} className="space-y-6">
        <Tabs defaultValue="problem" className="w-full">
          <TabsList>
            <TabsTrigger value="problem">Shart</TabsTrigger>
            <TabsTrigger value="solution">Yechim</TabsTrigger>
          </TabsList>

          <TabsContent value="problem">
            <SplitView
              source={bodyMd}
              onChange={(v) => methods.setValue("bodyMd", v, { shouldDirty: true })}
              uploadPrefix={uploadPrefix}
            />
            <FieldHint message={methods.formState.errors.bodyMd?.message} />
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

        <div className="border-t pt-6">
          <h2 className="text-lg font-semibold mb-4">Metadata</h2>
          <MetadataForm
            topicsAvailable={topicsAvailable}
            sourcesAvailable={sourcesAvailable}
          />
        </div>

        {serverError && (
          <p className="text-sm text-destructive">{serverError}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={isSaving}>
            {isSaving
              ? "Saqlanmoqda…"
              : mode === "create"
                ? "Yaratish"
                : "O'zgarishlarni saqlash"}
          </Button>
        </div>
      </form>
    </FormProvider>
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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
      <div className="border rounded-md overflow-hidden">
        <MarkdownEditor
          value={source}
          onChange={onChange}
          uploadPrefix={uploadPrefix}
        />
      </div>
      <div className="border rounded-md p-4 min-h-[500px] overflow-auto">
        <MarkdownPreview source={source || "*Bo'sh*"} />
      </div>
    </div>
  );
}
