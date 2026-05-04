import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  problems,
  problemTopics,
  problemTags,
  problemClasses,
  images,
  topics,
  sources,
  tags,
} from "@/db/schema";

/**
 * Fetch a single problem with all its associations expanded.
 * Returns null if no row exists. Joins are parallelized.
 */
export async function getProblemById(id: string) {
  const problem = await db.query.problems.findFirst({
    where: eq(problems.id, id),
  });
  if (!problem) return null;

  const [topicRows, tagRows, classRows, source, imageRows] = await Promise.all([
    db
      .select({ id: topics.id, name: topics.name, slug: topics.slug })
      .from(problemTopics)
      .innerJoin(topics, eq(topics.id, problemTopics.topicId))
      .where(eq(problemTopics.problemId, id)),
    db
      .select({ id: tags.id, name: tags.name, slug: tags.slug })
      .from(problemTags)
      .innerJoin(tags, eq(tags.id, problemTags.tagId))
      .where(eq(problemTags.problemId, id)),
    db
      .select({ classNumber: problemClasses.classNumber })
      .from(problemClasses)
      .where(eq(problemClasses.problemId, id)),
    db.query.sources.findFirst({ where: eq(sources.id, problem.sourceId) }),
    db.query.images.findMany({ where: eq(images.problemId, id) }),
  ]);

  return {
    ...problem,
    topics: topicRows,
    tags: tagRows,
    classes: classRows.map((r) => r.classNumber),
    source,
    images: imageRows,
  };
}

export type ProblemWithRelations = NonNullable<
  Awaited<ReturnType<typeof getProblemById>>
>;
