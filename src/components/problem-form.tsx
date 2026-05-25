"use client";

import { useDeferredValue, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  useForm,
  FormProvider,
  Controller,
  useFormContext,
  useWatch,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import dynamic from "next/dynamic";
import { Eye, ImagePlus, Loader2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadImageAction } from "@/app/admin/_actions/upload-image";
import { MarkdownPreview } from "@/components/markdown-preview";
import { MetadataForm } from "@/components/metadata-form";
import type { Topic, AgeCategory, Method } from "@/db/schema";
import type { SourcePickerNode } from "@/components/problem-form-pickers/source-picker";
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
      <div className="rounded-xl ring-1 ring-foreground/10 bg-card p-4 min-h-[240px] text-muted-foreground text-sm">
        Loading editor…
      </div>
    ),
  }
);

const imageSchema = z.object({
  storageKey: z.string().min(1),
  publicUrl: z.string().url(),
  originalFilename: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  mimeType: z.string().min(1),
});

const formSchema = z.object({
  bodyMd: z.string().min(1, "Masala matni bo'sh bo'lmasligi kerak"),
  sourceId: z.string().uuid("Manbani tanlang"),
  topicIds: z.array(z.string()).min(1, "Kamida bitta mavzu tanlang"),
  ageCategoryIds: z
    .array(z.string())
    .min(1, "Kamida bitta yosh toifasini tanlang"),
  // Methods are optional — zero or more allowed. No min(1).
  methodIds: z.array(z.string()),
  image: imageSchema.nullable(),
});

export type ProblemFormValues = z.infer<typeof formSchema>;

export interface ProblemFormProps {
  mode: "create" | "edit";
  problemId?: string;
  defaultValues: ProblemFormValues;
  topicsAvailable: Topic[];
  sourcesAvailable: SourcePickerNode[];
  ageCategoriesAvailable: AgeCategory[];
  methodsAvailable: Method[];
  uploadPrefix: string;
}

export function ProblemForm({
  mode,
  problemId,
  defaultValues,
  topicsAvailable,
  sourcesAvailable,
  ageCategoriesAvailable,
  methodsAvailable,
  uploadPrefix,
}: ProblemFormProps) {
  const router = useRouter();
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

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={methods.handleSubmit(onSubmit)}
        className="space-y-6"
      >
        {/* Metadata first — Topics lead the form, so the writer commits to
            classification before drafting the markdown body. */}
        <section className="space-y-3">
          <SectionLabel>Tafsilotlar</SectionLabel>
          <MetadataForm
            topicsAvailable={topicsAvailable}
            sourcesAvailable={sourcesAvailable}
            ageCategoriesAvailable={ageCategoriesAvailable}
            methodsAvailable={methodsAvailable}
          />
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <SectionLabel>Masala matni</SectionLabel>
            <Controller
              control={methods.control}
              name="image"
              render={({ field }) => (
                <ImageUploadField
                  value={field.value}
                  onChange={field.onChange}
                  uploadPrefix={uploadPrefix}
                />
              )}
            />
          </div>
          <BodyEditor
            fieldName="bodyMd"
            uploadPrefix={uploadPrefix}
            showError
          />
        </section>

        {/* Inline footer — actions sit at the bottom of the form. */}
        <footer className="pt-4 border-t flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            {serverError && (
              <p className="text-sm text-destructive truncate">
                {serverError}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.back()}
              disabled={isSaving}
            >
              Bekor qilish
            </Button>
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

type ImageValue = z.infer<typeof imageSchema> | null;

function ImageUploadField({
  value,
  onChange,
  uploadPrefix,
}: {
  value: ImageValue;
  onChange: (v: ImageValue) => void;
  uploadPrefix: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("prefix", uploadPrefix);
      const res = await uploadImageAction(fd);
      if ("success" in res && res.success) {
        onChange({
          storageKey: res.storageKey,
          publicUrl: res.publicUrl,
          originalFilename: file.name,
          sizeBytes: res.sizeBytes,
          mimeType: res.mimeType,
        });
      } else {
        setError(res.error ?? "Yuklab bo'lmadi");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yuklab bo'lmadi");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      {value ? (
        <div className="flex items-center gap-2 rounded-md ring-1 ring-foreground/10 bg-card pl-1 pr-2 py-1">
          <div className="relative h-6 w-6 overflow-hidden rounded-sm bg-muted shrink-0">
            <Image
              src={value.publicUrl}
              alt={value.originalFilename}
              fill
              sizes="24px"
              className="object-cover"
            />
          </div>
          <span className="text-xs max-w-[140px] truncate">
            {value.originalFilename}
          </span>
          <button
            type="button"
            aria-label="Rasmni o'chirish"
            onClick={() => onChange(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <ImagePlus data-icon="inline-start" />
          )}
          {uploading ? "Yuklanmoqda…" : "Rasm yuklash"}
        </Button>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/**
 * Subscribes to a single text field via `useWatch` so keystrokes only
 * re-render this subtree, not the whole form (which would force the
 * MetadataForm + select/popover/command trees to re-render too).
 */
function BodyEditor({
  fieldName,
  uploadPrefix,
  showError,
}: {
  fieldName: "bodyMd";
  uploadPrefix: string;
  showError?: boolean;
}) {
  const { control, setValue, formState } = useFormContext<ProblemFormValues>();
  const value = useWatch({ control, name: fieldName }) ?? "";

  return (
    <>
      <SplitView
        source={value}
        onChange={(v) =>
          setValue(fieldName, v, { shouldDirty: true })
        }
        uploadPrefix={uploadPrefix}
      />
      {showError && (
        <FieldHint message={formState.errors[fieldName]?.message} />
      )}
    </>
  );
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
  // React 18+ idiom: keep the previous preview content rendered while the
  // user is mid-keystroke, then catch up when typing pauses. The markdown
  // pipeline (remark-math + rehype-katex + rehype-highlight + sanitize) is
  // ~10-20ms per render — without this, every keystroke blocks the editor.
  const deferredSource = useDeferredValue(source);
  const isStale = source !== deferredSource;
  const isEmpty = deferredSource.trim().length === 0;

  return (
    <div className="grid grid-cols-1 gap-3">
      {/* Editor pane */}
      <div className="rounded-xl ring-1 ring-foreground/10 overflow-hidden bg-card shadow-sm">
        <header className="flex items-center justify-between px-3 h-9 border-b bg-muted/30">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <Pencil className="size-3" aria-hidden />
            <span>Tahrir</span>
          </div>
          <span className="text-[10px] text-muted-foreground/60 font-mono">
            Markdown · LaTeX
          </span>
        </header>
        <MarkdownEditor
          value={source}
          onChange={onChange}
          uploadPrefix={uploadPrefix}
          minHeight="240px"
        />
      </div>

      {/* Preview pane */}
      <div className="rounded-xl ring-1 ring-foreground/10 overflow-hidden bg-card shadow-sm">
        <header className="flex items-center justify-between px-3 h-9 border-b bg-muted/30">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <Eye className="size-3" aria-hidden />
            <span>Ko&apos;rinish</span>
          </div>
          {isStale && (
            <span
              className="flex items-center gap-1 text-[10px] text-muted-foreground/70"
              aria-live="polite"
            >
              <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
              Yangilanmoqda
            </span>
          )}
        </header>
        <div className="p-5 min-h-[200px] overflow-auto">
          {isEmpty ? (
            <EmptyPreview />
          ) : (
            <MarkdownPreview source={deferredSource} />
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyPreview() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 gap-2">
      <Eye
        className="size-5 text-muted-foreground/40"
        aria-hidden
        strokeWidth={1.5}
      />
      <p className="text-xs text-muted-foreground">
        {"Yozayotgan matningiz bu yerda render bo'lib turadi"}
      </p>
      <p className="text-[10px] text-muted-foreground/60 font-mono">
        $x^2 + y^2 = z^2$
      </p>
    </div>
  );
}
