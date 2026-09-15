"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { socialRequest } from "@/lib/platform/social-client";
import type {
  AdminNavigation,
  AdminQueueSnapshot
} from "@/lib/platform/admin-types";
import type { AdminCaseDetail } from "@/lib/platform/admin-detail";
import type { readAdminHealth } from "@/lib/platform/admin-health";
import { AdminWorklist } from "./admin-worklist";
import { AdminCase } from "./admin-case";
import { adminInputClass } from "./admin-form";
import { AdminAccess } from "./admin-access";
import { AdminPeople, AdminChurches, AdminAudit } from "./admin-operations";
import type { AdminAccessSnapshot } from "@/lib/platform/admin-access";
import type { AdminAuditSnapshot } from "@/lib/platform/admin-operations";
import { AdminOverview } from "./admin-overview";
import { ReadVisibility } from "./read-visibility";
import type { AdminOverviewSnapshot } from "@/lib/platform/admin-overview";
import type { MetricSnapshot } from "@/lib/platform/metric-report";
import dynamic from "next/dynamic";
const AdminMetrics=dynamic(()=>import("./admin-metrics").then(m=>m.AdminMetrics));
type Health = Awaited<ReturnType<typeof readAdminHealth>>;
type Payload =
  | AdminNavigation
  | AdminQueueSnapshot
  | AdminCaseDetail
  | Health
  | AdminAccessSnapshot
  | AdminAuditSnapshot
  | AdminOverviewSnapshot
  | MetricSnapshot;
export function AdminWorkspace({
  navigation,
  section,
  query,
  back,
  selection
}: {
  navigation: AdminNavigation;
  section: string;
  query: string;
  back: string;
  selection?: string[];
}) {
  const [data, setData] = useState<Payload | null>(null),
    [visible, setVisible] = useState(false),
    [notice, setNotice] = useState("Checking current admin access…"),
    [busy, setBusy] = useState(false);
  const generation = useRef(0),
    active = useRef(true),
    reading = useRef(false),
    queued = useRef(false);
  const load = useCallback(async () => {
    if (!active.current || document.visibilityState === "hidden") return;
    if (reading.current) {
      queued.current = true;
      return;
    }
    reading.current = true;
    setBusy(true);
    setVisible(false);
    const seq = ++generation.current;
    try {
      const { data: next } = await socialRequest<Payload>(
        "/api/platform/admin?" + query,
        undefined,
        navigation.viewer.id
      );
      if (seq !== generation.current) return;
      const nav = "navigation" in next ? next.navigation : next;
      if (
        nav.viewer.id !== navigation.viewer.id ||
        !nav.sections.some(
          (s) => s.key === (section === "case" ? "requests" : section)
        )
      )
        throw Error(
          "This admin section is no longer available to this account."
        );
      setData(next);
      setVisible(true);
      setNotice("");
    } catch (error) {
      if (seq === generation.current)
        setNotice(
          error instanceof Error
            ? error.message
            : "Current admin access is unavailable. Retained entries are concealed."
        );
    } finally {
      reading.current = false;
      if (seq === generation.current) setBusy(false);
      if (queued.current && active.current) {
        queued.current = false;
        void load();
      }
    }
  }, [navigation.viewer.id, query, section]);
  useEffect(() => {
    const hide = () => {
      active.current = false;
      generation.current++;
      setVisible(false);
      setBusy(false);
    };
    const resume = () => {
      if (document.visibilityState !== "hidden") {
        active.current = true;
        void load();
      }
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : resume();
    resume();
    window.addEventListener("blur", hide);
    window.addEventListener("offline", hide);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    window.addEventListener("pageshow", resume);
    window.addEventListener("admin-access-changed", resume);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      queued.current = false;
      window.removeEventListener("blur", hide);
      window.removeEventListener("offline", hide);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("admin-access-changed", resume);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [load]);
  useEffect(() => {
    if (visible) window.dispatchEvent(new Event("admin-view-visible"));
  }, [visible]);
  const nav = data && "navigation" in data ? data.navigation : navigation;
  return (
    <div className="space-y-5">
      {!visible && (
        <div className="space-y-3 rounded-xl border border-gc-divider p-5">
          <p role="status">
            {notice ||
              "Checking current admin access. Private details and retained entries are concealed."}
          </p>
          <button
            className="gc-button gc-button-quiet"
            disabled={busy}
            onClick={() => void load()}
          >
            {busy ? "Checking…" : "Recheck current access"}
          </button>
          <Link className="ml-3 text-gc-accent underline" href="/platform/menu">
            Menu
          </Link>
        </div>
      )}
      <ReadVisibility.Provider value={visible}><div
        hidden={!visible}
        style={{ display: visible ? undefined : "none" }}
        className="grid min-w-0 gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]"
      >
        <aside className="min-w-0">
          <label className="block font-semibold lg:hidden">
            Admin section
            <select
              className={adminInputClass}
              value={
                nav.sections.find(
                  (s) => s.key === (section === "case" ? "requests" : section)
                )?.href ?? "/platform/admin"
              }
              onChange={(e) => window.location.assign(e.target.value)}
            >
              {nav.sections.map((s) => (
                <option key={s.key} value={s.href}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <nav aria-label="Admin" className="hidden space-y-2 lg:block">
            {nav.sections.map((s) => (
              <Link
                key={s.key}
                className={`block rounded-xl px-4 py-3 ${s.key === (section === "case" ? "requests" : section) ? "bg-gc-action font-semibold text-gc-on-action" : "text-gc-accent hover:bg-gc-surface"}`}
                aria-current={
                  s.key === (section === "case" ? "requests" : section)
                    ? "page"
                    : undefined
                }
                href={s.href}
              >
                {s.label}
              </Link>
            ))}
          </nav>
        </aside>
        <section className="min-w-0 space-y-5" aria-label="Admin workspace">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gc-muted">
              Platform admin · {nav.viewer.name}
            </p>
            <button
              className="gc-button gc-button-quiet"
              disabled={busy}
              onClick={() => void load()}
            >
              Refresh current view
            </button>
          </div>
          {(section === "requests" || section === "feedback") &&
            data &&
            "filters" in data && (
              <>
                <h1
                  tabIndex={-1}
                  data-admin-request-list-title
                  className="text-3xl font-semibold"
                >
                  {section === "feedback" ? "Feedback requests" : "Requests"}
                </h1>
                <AdminWorklist
                  data={data}
                  initialSelection={selection}
                  continuation={new URLSearchParams(query).get("after")}
                  onRefresh={() => void load()}
                />
              </>
            )}
          {section === "case" && data && "row" in data && (
            <AdminCase data={data} back={back} onRefresh={() => void load()} />
          )}
          {section === "overview" && data && "requests" in data && (
            <AdminOverview data={data} />
          )}
          {section === "growth" && data && "report" in data && <AdminMetrics data={data}/>}
          {section === "health" && data && "available" in data && (
            <AdminHealth data={data} />
          )}
          {section === "access" && data && "authenticator" in data && (
            <AdminAccess data={data} onRefresh={() => void load()} />
          )}
          {section === "people" && <AdminPeople navigation={nav} />}
          {section === "churches" && <AdminChurches navigation={nav} />}
          {section === "audit" &&
            data &&
            "rows" in data &&
            !("filters" in data) && <AdminAudit data={data} />}
        </section>
      </div></ReadVisibility.Provider>
    </div>
  );
}
function AdminHealth({ data }: { data: Health }) {
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-semibold">Operational health</h1>
      {!data.available || !data.health ? (
        <p role="alert">
          Current health could not be loaded. This is an unavailable result, not
          a healthy empty queue.
        </p>
      ) : (
        <>
          <p>
            Checked {new Date(data.health.checkedAt).toLocaleString()}.{" "}
            {data.health.needsAttention
              ? "Attention is needed."
              : "No current queue threshold is exceeded."}
          </p>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-gc-divider p-4">
              <dt>Account email</dt>
              <dd className="font-semibold">
                {data.emailDelivery === "resend"
                  ? "Provider configured"
                  : data.emailDelivery === "test-sink"
                    ? "Isolated test delivery"
                    : "Disabled awaiting setup"}
              </dd>
              <dd className="text-sm text-gc-muted">
                Delivery and receipt are unverified here. Inspect the authorized
                provider logs; configuration does not prove that a person
                received an email.
              </dd>
            </div>
            {Object.entries(data.health.configuration)
              .filter(([, value]) => typeof value === "boolean")
              .map(([key, value]) => (
                <div
                  className="rounded-xl border border-gc-divider p-4"
                  key={key}
                >
                  <dt>{healthLabels[key] ?? key}</dt>
                  <dd className="font-semibold">
                    {value
                      ? "Enabled or configured"
                      : "Disabled or unavailable"}
                  </dd>
                </div>
              ))}
          </dl>
          <h2 className="text-xl font-semibold">Current queue counts</h2>
          <dl className="grid gap-3 sm:grid-cols-2">
            {Object.entries(data.health.queues).map(([key, value]) => (
              <div
                key={key}
                className="rounded-xl border border-gc-divider p-4"
              >
                <dt className="font-semibold">{healthLabels[key] ?? key}</dt>
                <dd>
                  {typeof value === "number"
                    ? value
                    : Object.entries(value)
                        .filter(([, v]) => typeof v === "number")
                        .map(([k, v]) => (
                          <p key={k}>
                            {healthLabels[k] ?? k}: {String(v)}
                          </p>
                        ))}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-gc-muted">
            Worker completion history: unavailable here. Use the scoped provider
            completion logs and current operations runbooks. Counts do not
            establish hosting capacity or a recovery test.
          </p>
          <h2 className="text-xl font-semibold">Runbooks and ownership</h2>
          <p className="text-sm text-gc-muted">
            Platform operations owns these procedures. Support lead and backup
            coverage follow the support runbook; viewing health does not assign
            that duty. These links open the public procedure, never private
            credentials or live account data.
          </p>
          <ul className="space-y-3">
            {[
              ["Current health and provider logs", "OPERATIONAL_HEALTH.md"],
              ["Photo cleanup and upload recovery", "MEDIA_MAINTENANCE.md"],
              [
                "Notification delivery and phone acceptance",
                "PHONE_NOTIFICATION_CONTRACT.md"
              ],
              [
                "Community activity and scheduled delivery",
                "ACTIVITY_CONTRACT.md"
              ],
              ["Retention and protected recovery", "RETENTION_OPERATIONS.md"],
              ["Encrypted backup and restore", "BACKUP_OPERATIONS.md"],
              ["Support intake, lead and backup", "SUPPORT_OPERATIONS.md"]
            ].map(([label, file]) => (
              <li key={file}>
                <a
                  className="text-gc-accent underline"
                  href={
                    "https://github.com/LifEXPAdmin/church-landing/blob/main/docs/godschurches/" +
                    file
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {label} (opens a new tab)
                </a>
              </li>
            ))}
            <li>
              <Link
                className="text-gc-accent underline"
                href="/platform/releases"
              >
                Application release notes
              </Link>
            </li>
          </ul>
          {data.health.alerts.length > 0 && (
            <ul aria-label="Current alerts">
              {data.health.alerts.map((alert) => (
                <li key={alert}>{alert.replaceAll("_", " ")}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
const healthLabels: Record<string, string> = {
  uploadsEnabled: "Photo uploads",
  privateStorageConfigured: "Private storage",
  pushConfigured: "Push delivery",
  retentionEnabled: "Retention worker",
  welcomeEnabled: "Founder welcome",
  scheduledPublishingConfigured: "Scheduled publishing",
  media: "Photo cleanup",
  uploads: "Upload leases",
  notifications: "Notification delivery",
  retention: "Retention and account deletion",
  welcome: "Founder welcome",
  announcements: "Founder announcements",
  activityFanout: "Activity delivery",
  conversationFollowers: "Conversation followers",
  scheduledPosts: "Scheduled posts",
  failedDeliveries24h: "Failed deliveries in 24 hours",
  pending: "Pending",
  due: "Due",
  active: "Active",
  expired: "Expired",
  pendingControls: "Recovery records pending",
  pendingPurges: "Purges pending",
  pendingAccounts: "Account deletions pending",
  overdueAccounts: "Account deletions overdue",
  overdueReviews: "Report reviews overdue",
  overdueHolds: "Preservation reviews overdue"
};
