import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowRight, Fingerprint } from "lucide-react";
import { udidSchema, type UdidFormValues } from "../schema";
import { UdidInput } from "../components/UdidInput";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { restClient } from "@/api/rest";
import { useAuthStore } from "@/store";

export function UdidLoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [submitting, setSubmitting] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  const {
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<UdidFormValues>({
    resolver: zodResolver(udidSchema),
    defaultValues: { udid: "" },
  });

  async function onSubmit(values: UdidFormValues) {
    setSubmitting(true);
    try {
      const res = await restClient.verifyUdid({ udid: values.udid });
      setAuth(res.user, res.token);
      toast.success(`Welcome, ${res.user.displayName}`);
      const target = params.get("from") ?? "/onboarding";
      navigate(target, { replace: true });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not verify UDID");
    } finally {
      setSubmitting(false);
    }
  }

  const currentUdid = watch("udid") ?? "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-lg mx-auto mt-12 md:mt-20"
    >
      <Card>
        <CardContent className="pt-10 pb-8 md:px-10">
          <div className="flex flex-col items-center text-center mb-7">
            <div className="h-14 w-14 rounded-full bg-brand-primary grid place-items-center text-white shadow-[0_8px_28px_rgba(139,92,246,0.45)] mb-4">
              <Fingerprint className="h-6 w-6" aria-hidden />
            </div>
            <h1 className="font-display text-2xl font-semibold">
              Sign in with UDID
            </h1>
          </div>

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-5"
            aria-label="UDID sign-in form"
          >
            <UdidInput
              value={currentUdid}
              onChange={(v) => setValue("udid", v, { shouldValidate: false })}
              error={errors.udid?.message}
              autoFocus
            />

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={submitting}
              aria-label={submitting ? "Verifying UDID" : "Continue"}
            >
              {submitting ? "Verifying\u2026" : "Continue"}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>

            <button
              type="button"
              onClick={() => {
                setValue("udid", "MH00024817", { shouldValidate: true });
                toast("Demo UDID filled");
              }}
              className="text-xs text-brand-purple hover:text-brand-rose w-full text-center focus-ring rounded py-1"
            >
              Use demo UDID
            </button>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
