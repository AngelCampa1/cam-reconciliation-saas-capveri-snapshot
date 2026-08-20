"use client";

import Link from "next/link";
import {
  BookOpen,
  ChevronDown,
  FileQuestion,
  HelpCircle,
  MessageSquareWarning,
  Search,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FAQ_CATEGORIES, getFAQCount } from "@/data/faq-data";
import type { FAQCategory, FAQItem } from "@/data/faq-types";

const taskCards = [
  {
    title: "Start here",
    description:
      "Learn what CapVeri needs first: one property, tenant information, lease terms, and accounting files.",
    href: "/docs",
    icon: BookOpen,
  },
  {
    title: "Upload files",
    description:
      "Understand rent rolls, GL exports, CAM billed reports, and lease PDFs before you upload anything.",
    href: "/resources/software/yardi-voyager/cam-setup",
    icon: Upload,
  },
  {
    title: "Understand CAM",
    description:
      "Get a plain-language overview of Common Area Maintenance reconciliation and why tenant shares matter.",
    href: "/cam-reconciliation-guide",
    icon: FileQuestion,
  },
  {
    title: "Fix a problem",
    description:
      "Find answers for login, billing, file format, PDF, and export questions.",
    href: "#faq",
    icon: HelpCircle,
  },
  {
    title: "Tenant questions",
    description:
      "Help tenants understand statements, PDF downloads, and how disputes are reviewed.",
    href: "/resources/cam-dispute",
    icon: MessageSquareWarning,
  },
];

function FAQAccordionItem({
  item,
  isOpen,
  onToggle,
}: {
  item: FAQItem;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        className="flex w-full items-center justify-between py-5 px-6 text-left text-base font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <span>{item.question}</span>
        <ChevronDown
          className={cn(
            "ml-4 h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200",
            isOpen && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      {isOpen && (
        <div
          className="pb-5 px-6 text-muted-foreground leading-relaxed"
          style={{ animation: "fadeInUp 200ms ease-out" }}
        >
          {item.answer}
        </div>
      )}
    </div>
  );
}

function CategorySection({
  category,
  openIds,
  onToggle,
  matchCount,
}: {
  category: FAQCategory;
  openIds: Set<string>;
  onToggle: (id: string) => void;
  matchCount: number;
}) {
  return (
    <section id={category.id} className="scroll-mt-24">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-base md:text-lg lg:text-xl font-bold text-foreground">
          {category.title}
        </h2>
        <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          {matchCount}
        </span>
      </div>
      <div className="rounded-lg border border-border">
        {category.questions.map((item) => (
          <FAQAccordionItem
            key={item.id}
            item={item}
            isOpen={openIds.has(item.id)}
            onToggle={() => onToggle(item.id)}
          />
        ))}
      </div>
    </section>
  );
}

export function HelpCenterPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [activeCategoryId, setActiveCategoryId] = useState<string>(
    FAQ_CATEGORIES[0]?.id ?? "",
  );
  const handleToggle = useCallback((id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Filter categories and questions based on search
  const filteredCategories = searchQuery.trim()
    ? FAQ_CATEGORIES.map((category) => ({
        ...category,
        questions: category.questions.filter(
          (q) =>
            q.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
            q.answerPlainText.toLowerCase().includes(searchQuery.toLowerCase()),
        ),
      })).filter((category) => category.questions.length > 0)
    : FAQ_CATEGORIES;

  // Scroll-spy with IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveCategoryId(entry.target.id);
          }
        }
      },
      { rootMargin: "-100px 0px -60% 0px", threshold: 0 },
    );

    // Observe all category sections
    for (const category of FAQ_CATEGORIES) {
      const el = document.getElementById(category.id);
      if (el) {
        observer.observe(el);
      }
    }

    return () => observer.disconnect();
  }, []);

  const totalCount = getFAQCount();

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="border-b bg-muted pt-16">
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-foreground">
            Help Center
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">
            Start with a task below, or search {totalCount} answers about CAM
            reconciliation, pricing, security, files, and getting started.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            <time dateTime="2026-02-25">Updated February 25, 2026</time>
          </p>

          {/* Search */}
          <div className="mt-6 max-w-md relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="search"
              name="search"
              autoComplete="off"
              aria-label="Search help articles"
              placeholder="Search for answers..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <section className="mb-12" aria-labelledby="task-help-heading">
          <h2
            id="task-help-heading"
            className="mb-4 text-base md:text-lg lg:text-xl font-bold text-foreground"
          >
            What are you trying to do?
          </h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {taskCards.map((task) => {
              const Icon = task.icon;
              return (
                <Link
                  key={task.title}
                  href={task.href}
                  className="rounded-lg border border-border bg-card p-5 no-underline transition-colors duration-200 hover:border-primary/40"
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground">
                    {task.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {task.description}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>

        <div className="lg:grid lg:grid-cols-[240px_1fr] lg:gap-12">
          {/* Sidebar nav - desktop */}
          <nav className="hidden lg:block" aria-label="FAQ categories">
            <div className="sticky top-24">
              <ul className="space-y-1">
                {FAQ_CATEGORIES.map((category) => {
                  const isFiltered = !filteredCategories.some(
                    (c) => c.id === category.id,
                  );
                  return (
                    <li key={category.id}>
                      <a
                        href={`#${category.id}`}
                        className={cn(
                          "block rounded-full px-3 py-2 text-sm transition-colors duration-200 no-underline",
                          activeCategoryId === category.id && !searchQuery
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted",
                          isFiltered && "opacity-40",
                        )}
                      >
                        {category.title}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          </nav>

          {/* Mobile category pills */}
          <div
            className="lg:hidden mb-8 -mx-4 px-4 overflow-x-auto"
            role="navigation"
            aria-label="FAQ categories"
          >
            <div className="flex gap-2 min-w-max">
              {FAQ_CATEGORIES.map((category) => (
                <a
                  key={category.id}
                  href={`#${category.id}`}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-full px-3 py-1.5 text-sm whitespace-nowrap no-underline transition-colors duration-200",
                    activeCategoryId === category.id && !searchQuery
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80",
                  )}
                >
                  {category.title}
                </a>
              ))}
            </div>
          </div>

          {/* FAQ sections */}
          <div id="faq" className="space-y-10 scroll-mt-24">
            {filteredCategories.map((category) => (
              <CategorySection
                key={category.id}
                category={category}
                openIds={openIds}
                onToggle={handleToggle}
                matchCount={category.questions.length}
              />
            ))}

            {filteredCategories.length === 0 && searchQuery && (
              <div className="text-center py-12" role="status">
                <p className="text-muted-foreground">
                  No results found for &ldquo;{searchQuery}&rdquo;
                </p>
              </div>
            )}

            {/* Contact CTA */}
            <div className="rounded-lg bg-muted p-8 text-center">
              <h2 className="text-base md:text-lg lg:text-xl font-bold text-foreground mb-2">
                Still have questions?
              </h2>
              <p className="text-muted-foreground mb-4">
                Can&rsquo;t find what you&rsquo;re looking for? Our team is here
                to help.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button asChild>
                  <Link href="/contact">Contact Support</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/pricing">View pricing</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
