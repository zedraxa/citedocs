import { z } from "zod";

export const CreateDocumentSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  cslStyleId: z.string().default("apa"),
  cslLocale: z.string().default("en-US"),
  preferences: z
    .object({
      pageSize: z.enum(["letter", "a4"]).default("letter"),
      orientation: z.enum(["portrait", "landscape"]).default("portrait"),
      margins: z
        .object({
          top: z.number().default(25.4),
          right: z.number().default(25.4),
          bottom: z.number().default(25.4),
          left: z.number().default(25.4),
        })
        .default({}),
      fontFamily: z.string().default("Inter"),
      fontSize: z.number().default(11),
      lineHeight: z.number().default(1.15),
    })
    .default({}),
});

export const UpdateDocumentSchema = CreateDocumentSchema.partial();

export const CitationItemSchema = z.object({
  id: z.string().min(1),
  locator: z.string().optional(),
  label: z
    .enum(["page", "chapter", "figure", "verse", "line", "paragraph", "section", "part"])
    .optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  suppressAuthor: z.boolean().optional(),
});

export const InsertCitationSchema = z.object({
  citationId: z.string().min(1),
  citationItems: z.array(CitationItemSchema).min(1, "At least one citation item is required"),
  properties: z.object({
    noteIndex: z.number().int().nonnegative().default(0),
    formattedCitation: z.string().optional(),
    dontUpdate: z.boolean().optional(),
  }),
});

export const IdentifierLookupSchema = z.object({
  identifier: z.string().min(1, "Identifier is required").trim(),
  type: z.enum(["doi", "isbn", "pmid", "arxiv", "url", "auto"]).default("auto"),
});

export const SuggestionReviewSchema = z.object({
  suggestionId: z.string().min(1),
  action: z.enum(["accept", "reject"]),
});

export const CommentThreadCreateSchema = z.object({
  documentId: z.string().uuid(),
  content: z.string().min(1, "Comment content cannot be empty"),
  selectionRange: z
    .object({
      from: z.number().int().nonnegative(),
      to: z.number().int().nonnegative(),
    })
    .optional(),
});

export const CommentReplyCreateSchema = z.object({
  threadId: z.string().min(1),
  content: z.string().min(1, "Reply content cannot be empty"),
});
