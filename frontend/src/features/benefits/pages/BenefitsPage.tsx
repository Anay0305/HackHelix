import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Search,
  Landmark,
  Bookmark,
  BookmarkCheck,
  Sparkles,
} from "lucide-react";
import { TopBar } from "@/components/common/TopBar";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { restClient } from "@/api/rest";
import { useBenefitsStore, useAuthStore } from "@/store";
import { cn } from "@/lib/cn";
import type {
  Benefit,
  BenefitCategory,
  BenefitDetail,
} from "@/api/types";

const categories: { value: BenefitCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "financial", label: "Financial" },
  { value: "transport", label: "Transport" },
  { value: "education", label: "Education" },
  { value: "employment", label: "Employment" },
  { value: "healthcare", label: "Healthcare" },
  { value: "housing", label: "Housing" },
  { value: "tax", label: "Tax" },
];

export function BenefitsPage() {
  const user = useAuthStore((s) => s.user);
  const filters = useBenefitsStore((s) => s.filters);
  const setFilter = useBenefitsStore((s) => s.setFilter);
  const savedIds = useBenefitsStore((s) => s.savedIds);
  const toggleSaved = useBenefitsStore((s) => s.toggleSaved);

  const [selected, setSelected] = useState<string | null>(null);

  const { data: benefits = [], isLoading } = useQuery({
    queryKey: [
      "benefits",
      filters.category,
      filters.state,
      filters.search,
    ],
    queryFn: () =>
      restClient.listBenefits({
        category: filters.category === "all" ? undefined : filters.category,
        state: filters.state === "all" ? undefined : filters.state,
        search: filters.search || undefined,
      }),
  });

  const userCategory = user?.disabilityCategory;
  const filtered = filters.personalizedOnly && userCategory
    ? benefits.filter((b) => b.eligibleCategories.includes(userCategory))
    : benefits;

  return (
    <div>
      <TopBar
        title="Government Benefits"
        subtitle={
          userCategory
            ? `Personalised to your ${userCategory} UDID category.`
            : "Every scheme, concession and subsidy you qualify for."
        }
      />

      <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto space-y-5">
        {/* Personalized banner */}
        {user && filters.personalizedOnly && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 rounded-xl2 glass border-brand-purple/30 px-4 py-3"
          >
            <Sparkles className="h-4 w-4 text-brand-purple shrink-0" aria-hidden />
            <p className="text-sm flex-1 text-ink">
              Tailored to your UDID category.
            </p>
            <button
              onClick={() => setFilter("personalizedOnly", false)}
              aria-label="Show all benefits, not just personalised"
              className="text-sm font-medium text-brand-purple hover:text-brand-rose focus-ring rounded px-2 py-1"
            >
              Show all
            </button>
          </motion.div>
        )}

        {/* Filters */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <input
              type="search"
              placeholder="Search benefits, tags, or departments\u2026"
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
              aria-label="Search benefits"
              className="w-full h-11 rounded-lg border border-white/10 bg-white/5 pl-9 pr-3 text-sm text-ink placeholder:text-zinc-500 focus:outline-none focus:border-brand-purple focus:bg-white/10 focus:ring-2 focus:ring-brand-purple/40"
            />
          </div>
          <div className="flex flex-wrap gap-2 overflow-x-auto scrollbar-thin">
            {categories.map((c) => (
              <button
                key={c.value}
                onClick={() => setFilter("category", c.value)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap",
                  filters.category === c.value
                    ? "bg-brand-primary text-white shadow-[0_4px_14px_rgba(139,92,246,0.4)]"
                    : "bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:border-white/20",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full rounded-xl2" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Landmark}
            title="No benefits match"
            description="Try removing filters or searching different keywords."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setFilter("category", "all");
                  setFilter("search", "");
                  setFilter("state", "all");
                  setFilter("personalizedOnly", false);
                }}
              >
                Reset filters
              </Button>
            }
          />
        ) : (
          <>
            <p className="text-xs text-muted">
              {filtered.length} benefit{filtered.length === 1 ? "" : "s"} found
            </p>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((b) => (
                <BenefitCard
                  key={b.id}
                  benefit={b}
                  saved={savedIds.includes(b.id)}
                  onToggleSave={() => toggleSaved(b.id)}
                  onOpen={() => setSelected(b.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <BenefitDetailDrawer
        benefitId={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function BenefitCard({
  benefit,
  saved,
  onToggleSave,
  onOpen,
}: {
  benefit: Benefit;
  saved: boolean;
  onToggleSave: () => void;
  onOpen: () => void;
}) {
  return (
    <motion.div layout>
      <Card
        className="hover:shadow-card-hover transition-shadow cursor-pointer h-full flex flex-col"
        onClick={onOpen}
      >
        <CardContent className="pt-5 pb-5 flex flex-col gap-3 flex-1">
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 rounded-full bg-brand-primary grid place-items-center text-white shrink-0 shadow-[0_4px_14px_rgba(139,92,246,0.3)]">
              <Landmark className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold leading-snug">{benefit.title}</h3>
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                <Badge variant="muted" className="capitalize">
                  {benefit.category}
                </Badge>
                <Badge variant="info" className="capitalize">
                  {benefit.tier}
                </Badge>
                {benefit.state && (
                  <Badge variant="default">{benefit.state}</Badge>
                )}
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleSave();
              }}
              aria-label={saved ? "Unsave" : "Save"}
              className="h-9 w-9 grid place-items-center rounded-md text-muted hover:text-brand-purple hover:bg-white/5 focus-ring"
            >
              {saved ? (
                <BookmarkCheck className="h-4 w-4 text-brand-purple" aria-hidden />
              ) : (
                <Bookmark className="h-4 w-4" aria-hidden />
              )}
            </button>
          </div>
          <p className="text-sm text-muted leading-relaxed line-clamp-3">
            {benefit.summary}
          </p>
          <div className="flex items-center justify-between pt-2 mt-auto border-t border-white/5">
            {benefit.estimatedValue ? (
              <span className="text-sm font-semibold text-emerald-300">
                {benefit.estimatedValue}
              </span>
            ) : (
              <span />
            )}
            <span className="text-xs gradient-text font-semibold">
              Details &rarr;
            </span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function BenefitDetailDrawer({
  benefitId,
  onClose,
}: {
  benefitId: string | null;
  onClose: () => void;
}) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ["benefit", benefitId],
    queryFn: () => restClient.getBenefit(benefitId!),
    enabled: !!benefitId,
  });

  return (
    <Drawer
      open={!!benefitId}
      onClose={onClose}
      title={detail?.title ?? "Benefit details"}
    >
      {isLoading || !detail ? (
        <div className="space-y-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : (
        <BenefitBody detail={detail} />
      )}
    </Drawer>
  );
}

function BenefitBody({ detail }: { detail: BenefitDetail }) {
  return (
    <div className="space-y-5 text-sm">
      <div className="flex gap-1.5 flex-wrap">
        <Badge variant="muted" className="capitalize">
          {detail.category}
        </Badge>
        <Badge variant="info" className="capitalize">
          {detail.tier}
        </Badge>
        {detail.state && <Badge variant="default">{detail.state}</Badge>}
      </div>
      {detail.estimatedValue && (
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-4 py-3">
          <p className="text-xs text-emerald-300 font-semibold uppercase tracking-wider">
            Benefit value
          </p>
          <p className="text-lg font-bold text-emerald-200 mt-0.5">
            {detail.estimatedValue}
          </p>
        </div>
      )}
      <p className="leading-relaxed text-ink">{detail.description}</p>

      <Section title="Required Documents">
        <ul className="list-disc list-inside space-y-1 text-muted">
          {detail.requiredDocuments.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </Section>

      <Section title="How to Apply">
        <ol className="space-y-2">
          {detail.applicationSteps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="h-5 w-5 shrink-0 rounded-full bg-gradient-brand text-white text-xs font-semibold grid place-items-center mt-0.5">
                {i + 1}
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </Section>

      {detail.contact && (
        <Section title="Contact">
          <div className="rounded-lg glass px-4 py-3 space-y-1">
            <p className="font-medium">{detail.contact.department}</p>
            {detail.contact.phone && (
              <p className="text-xs text-muted">
                Phone: <span className="font-mono">{detail.contact.phone}</span>
              </p>
            )}
            {detail.contact.email && (
              <p className="text-xs text-muted">
                Email:{" "}
                <a
                  href={`mailto:${detail.contact.email}`}
                  className="font-mono text-brand-purple hover:underline"
                >
                  {detail.contact.email}
                </a>
              </p>
            )}
          </div>
        </Section>
      )}

      {detail.applyUrl && (
        <a
          href={detail.applyUrl}
          target="_blank"
          rel="noreferrer"
          className="block"
        >
          <Button size="lg" className="w-full">
            Apply on official portal &rarr;
          </Button>
        </a>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

