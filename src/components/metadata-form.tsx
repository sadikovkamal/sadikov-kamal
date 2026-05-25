"use client";

import { Controller, useFormContext } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { TopicTreePicker } from "@/components/problem-form-pickers/topic-tree-picker";
import { AgeCategoryGridPicker } from "@/components/problem-form-pickers/age-category-grid-picker";
import { MethodTreePicker } from "@/components/problem-form-pickers/method-tree-picker";
import {
  SourcePicker,
  type SourcePickerNode,
} from "@/components/problem-form-pickers/source-picker";
import type { Topic, AgeCategory, Method } from "@/db/schema";

export interface MetadataFormProps {
  topicsAvailable: Topic[];
  sourcesAvailable: SourcePickerNode[];
  ageCategoriesAvailable: AgeCategory[];
  methodsAvailable: Method[];
}

/**
 * Three pickers, each visually paired with its admin section:
 *
 *   Mavzular     → /admin/topics-style nested tree (popover, multi-select)
 *   Manba        → /admin/sources-style card navigation (popover, single-select)
 *   Yosh toifasi → /admin/age-categories-style card grid (inline, multi-select)
 *
 * Inline cards for age categories because the set is small (~12) and
 * stable; popovers for the bigger / hierarchical ones so the form
 * stays compact when nothing's open.
 */
export function MetadataForm({
  topicsAvailable,
  sourcesAvailable,
  ageCategoriesAvailable,
  methodsAvailable,
}: MetadataFormProps) {
  const { control, formState } = useFormContext();
  const errors = formState.errors;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Topics — placed first so the writer commits to classification
          before drafting the body. Spans both columns. */}
      <div className="space-y-2 lg:col-span-2">
        <Label>Mavzular</Label>
        <Controller
          control={control}
          name="topicIds"
          render={({ field }) => (
            <TopicTreePicker
              available={topicsAvailable}
              value={field.value ?? []}
              onChange={field.onChange}
            />
          )}
        />
        <FieldError message={errors.topicIds?.message} />
      </div>

      {/* Source */}
      <div className="space-y-2 lg:col-span-2">
        <Label>Manba</Label>
        <Controller
          control={control}
          name="sourceId"
          render={({ field }) => (
            <SourcePicker
              available={sourcesAvailable}
              value={field.value ?? null}
              onChange={field.onChange}
            />
          )}
        />
        <FieldError message={errors.sourceId?.message} />
      </div>

      {/* Age category — inline card grid (matches /admin/age-categories). */}
      <div className="space-y-2 lg:col-span-2">
        <Label>Yosh toifasi</Label>
        <Controller
          control={control}
          name="ageCategoryIds"
          render={({ field }) => (
            <AgeCategoryGridPicker
              available={ageCategoriesAvailable}
              value={field.value ?? []}
              onChange={field.onChange}
            />
          )}
        />
        <FieldError message={errors.ageCategoryIds?.message} />
      </div>

      {/* Methods — optional, can be zero or more. */}
      <div className="space-y-2 lg:col-span-2">
        <div className="flex items-baseline justify-between gap-2">
          <Label>Metodlar</Label>
          <span className="text-[11px] text-muted-foreground italic">
            ixtiyoriy
          </span>
        </div>
        <Controller
          control={control}
          name="methodIds"
          render={({ field }) => (
            <MethodTreePicker
              available={methodsAvailable}
              value={field.value ?? []}
              onChange={field.onChange}
            />
          )}
        />
        <FieldError message={errors.methodIds?.message} />
      </div>
    </div>
  );
}

function FieldError({ message }: { message?: unknown }) {
  if (typeof message !== "string" || !message) return null;
  return <p className="text-destructive text-xs">{message}</p>;
}
