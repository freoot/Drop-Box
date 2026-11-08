import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  title: text("title").notNull(),
  mode: text("mode").notNull(),
  data: text("data").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
});

export const media = sqliteTable("media", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  ownerId: text("owner_id").notNull(),
  kind: text("kind").notNull(),
  objectKey: text("object_key").notNull(),
  mimeType: text("mime_type").notNull(),
  filename: text("filename").notNull(),
  size: integer("size").notNull(),
  createdAt: text("created_at").notNull(),
});
