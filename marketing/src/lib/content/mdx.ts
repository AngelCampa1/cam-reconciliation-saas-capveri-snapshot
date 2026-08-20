import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";
import type {
  BlogFrontmatter,
  ContentCollection,
  ResourceFrontmatter,
} from "./types";

export function getContentDir(collection: ContentCollection): string {
  return path.join(process.cwd(), "content", collection);
}

export interface PostMeta<T> {
  slug: string;
  frontmatter: T;
}

export interface PostContent<T> {
  frontmatter: T;
  source: string;
}

export async function getAllPosts(
  collection: "blog",
): Promise<PostMeta<BlogFrontmatter>[]>;
export async function getAllPosts(
  collection: "resources",
): Promise<PostMeta<ResourceFrontmatter>[]>;
export async function getAllPosts(
  collection: ContentCollection,
): Promise<PostMeta<BlogFrontmatter | ResourceFrontmatter>[]> {
  const dir = getContentDir(collection);
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }

  const mdxFiles = files.filter((f) => f.endsWith(".mdx"));

  const posts = (
    await Promise.all(
      mdxFiles.map(async (file) => {
        try {
          const slug = file.replace(/\.mdx$/, "");
          const raw = await fs.readFile(path.join(dir, file), "utf8");
          const { data } = matter(raw);
          return {
            slug,
            frontmatter: data as BlogFrontmatter | ResourceFrontmatter,
          };
        } catch {
          return null;
        }
      }),
    )
  ).filter((p): p is NonNullable<typeof p> => p !== null);

  if (collection === "resources") {
    return (posts as PostMeta<ResourceFrontmatter>[]).sort(
      (a, b) => (a.frontmatter.order ?? 99) - (b.frontmatter.order ?? 99),
    );
  }

  return (posts as PostMeta<BlogFrontmatter>[]).sort(
    (a, b) =>
      new Date(b.frontmatter.datePublished).getTime() -
      new Date(a.frontmatter.datePublished).getTime(),
  );
}

export async function getPost(
  collection: "blog",
  slug: string,
): Promise<PostContent<BlogFrontmatter> | null>;
export async function getPost(
  collection: "resources",
  slug: string,
): Promise<PostContent<ResourceFrontmatter> | null>;
export async function getPost(
  collection: ContentCollection,
  slug: string,
): Promise<PostContent<BlogFrontmatter | ResourceFrontmatter> | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  const filePath = path.join(getContentDir(collection), `${slug}.mdx`);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const { data, content } = matter(raw);
    return {
      frontmatter: data as BlogFrontmatter | ResourceFrontmatter,
      source: content,
    };
  } catch {
    return null;
  }
}
