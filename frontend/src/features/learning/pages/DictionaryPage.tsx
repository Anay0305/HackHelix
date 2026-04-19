import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, BookOpen, Volume2, Play } from "lucide-react";
import { TopBar } from "@/components/common/TopBar";
import { Input } from "@/components/ui/Input";
import { AvatarStage } from "@/features/simulator/components/avatar/AvatarStage";
import { cn } from "@/lib/cn";
import { SIGN_CATALOG, SIGN_CATEGORIES, type SignCategory, type SignEntry } from "../data/signCatalog";
import { SignCard } from "../components/SignCard";
import { useLessonPose } from "../hooks/useLessonPose";

export function DictionaryPage() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<SignCategory>("All");
  const [activeSign, setActiveSign] = useState<SignEntry | null>(null);

  // Drive the avatar with the active sign on loop
  useLessonPose(activeSign ? [activeSign.id] : undefined, true);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SIGN_CATALOG.filter((s) => {
      const matchCat = activeCategory === "All" || s.category === activeCategory;
      const matchQ =
        !q ||
        s.label.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [query, activeCategory]);

  // Deduplicate by id
  const unique = useMemo(() => {
    const seen = new Set<string>();
    return filtered.filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
  }, [filtered]);

  function handleToggle(sign: SignEntry) {
    setActiveSign((prev) => (prev?.id === sign.id ? null : sign));
  }

  return (
    <div className="relative pb-12">
      <TopBar
        title="Sign Dictionary"
        subtitle="Tap any sign to see the avatar demonstrate it"
      />

      <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto">
        <div className="flex flex-col lg:flex-row gap-6">

          {/* ── Left: sticky avatar panel ──────────────────────────────── */}
          <div className="lg:w-72 shrink-0">
            <div className="lg:sticky lg:top-6 space-y-3">
              {/* Avatar canvas */}
              <div className="rounded-2xl overflow-hidden border border-white/10 bg-black/40"
                style={{ height: 320 }}>
                <AvatarStage />
              </div>

              {/* Active sign info */}
              <AnimatePresence mode="wait">
                {activeSign ? (
                  <motion.div
                    key={activeSign.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="glass rounded-xl2 px-4 py-3 border border-brand-purple/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-display font-semibold text-lg text-ink leading-tight">
                          {activeSign.label}
                        </p>
                        <p className="text-xs text-brand-purple mt-0.5 font-medium">
                          {activeSign.category}
                        </p>
                      </div>
                      <div className="flex gap-1.5 mt-0.5">
                        {[0, 1, 2].map((i) => (
                          <motion.span
                            key={i}
                            className="w-1 rounded-full bg-brand-purple"
                            animate={{ height: [6, 14, 6] }}
                            transition={{ duration: 0.8, delay: i * 0.15, repeat: Infinity }}
                          />
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-muted mt-2 leading-relaxed">
                      {activeSign.description}
                    </p>
                    <button
                      onClick={() => setActiveSign(null)}
                      className="mt-3 text-xs text-muted hover:text-ink transition-colors"
                    >
                      Stop ×
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="glass rounded-xl2 px-4 py-4 text-center border border-white/8"
                  >
                    <Play className="h-6 w-6 mx-auto text-muted/50 mb-2" />
                    <p className="text-sm text-muted">
                      Tap a sign card to see the avatar demonstrate it
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* ── Right: search + grid ────────────────────────────────────── */}
          <div className="flex-1 space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
              <Input
                placeholder="Search signs…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Category chips */}
            <div className="flex flex-wrap gap-2">
              {SIGN_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-semibold transition-all border",
                    activeCategory === cat
                      ? "bg-brand-primary text-white border-brand-primary shadow-glow-brand"
                      : "glass text-muted border-white/10 hover:border-white/25",
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Count */}
            <div className="flex items-center gap-2 text-xs text-muted">
              <BookOpen className="h-3.5 w-3.5" />
              <span>
                {unique.length} sign{unique.length !== 1 ? "s" : ""}
                {activeCategory !== "All" ? ` in ${activeCategory}` : ""}
                {query ? ` matching "${query}"` : ""}
              </span>
            </div>

            {/* Grid */}
            {unique.length === 0 ? (
              <div className="text-center py-20 text-muted">
                <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-semibold">No signs found</p>
                <p className="text-sm mt-1">Try a different search or category</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                {unique.map((sign, i) => (
                  <SignCard
                    key={sign.id}
                    sign={sign}
                    index={i}
                    isPlaying={activeSign?.id === sign.id}
                    onToggle={handleToggle}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
