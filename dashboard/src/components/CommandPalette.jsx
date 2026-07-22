import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import { api } from "../api.js";

// Fired by the ⌘K hint in the table filter bar so the badge can open the
// palette without prop-drilling through the page.
export const OPEN_PALETTE_EVENT = "open-command-palette";

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [sites, setSites] = useState([]);
  const [cves, setCves] = useState([]);
  const [verdicts, setVerdicts] = useState([]);
  const navigate = useNavigate();

  // Global shortcut + custom-event opener.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  // Load searchable entities lazily each time it opens (cheap, keeps it fresh).
  useEffect(() => {
    if (!open) return;
    api.sites().then(setSites).catch(() => {});
    api.vulnerabilities().then(setCves).catch(() => {});
    api.fleetAlerts().then(setVerdicts).catch(() => {});
  }, [open]);

  function run(fn) {
    setOpen(false);
    // let the dialog close before navigating
    setTimeout(fn, 0);
  }

  async function logout() {
    await api.logout();
    window.dispatchEvent(new Event("auth-error"));
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[14vh]"
      onClick={() => setOpen(false)}
    >
      <div
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        className="w-[560px] max-w-[92vw] overflow-hidden rounded-lg border border-border-strong bg-surface shadow-2xl"
      >
        <Command label="جستجوی فرمان" className="text-sm" shouldFilter>
          <Command.Input
            autoFocus
            placeholder="جستجوی سایت، اکشن، CVE…"
            className="w-full border-b border-border bg-transparent px-4 py-3 text-content outline-none placeholder:text-muted"
          />
          <Command.List className="max-h-[52vh] overflow-y-auto p-2">
            <Command.Empty className="px-3 py-6 text-center text-xs text-muted">چیزی پیدا نشد.</Command.Empty>

            <Command.Group heading="اکشن‌ها" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-muted">
              <Item value="افزودن سایت جدید" onSelect={() => run(() => navigate("/?add=1"))}>
                ➕ افزودن سایت جدید
              </Item>
              <Item value="تنظیمات تلگرام MCP" onSelect={() => run(() => navigate("/settings"))}>
                ⚙️ تنظیمات (تلگرام، MCP، ۲FA)
              </Item>
              <Item value="آسیب‌پذیری‌ها CVE امنیت" onSelect={() => run(() => navigate("/vulnerabilities"))}>
                🛡 آسیب‌پذیری‌ها
              </Item>
              <Item value="خروج logout" onSelect={() => run(logout)}>
                🚪 خروج
              </Item>
            </Command.Group>

            {sites.length > 0 && (
              <Command.Group heading="سایت‌ها" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-muted">
                {sites.map((s) => (
                  <Item
                    key={s.id}
                    value={`سایت ${s.name} ${s.url} ${s.client || ""}`}
                    onSelect={() => run(() => navigate(`/?site=${s.id}`))}
                  >
                    <span className={`h-2 w-2 rounded-full ${s.up === false ? "bg-bad" : s.up ? "bg-ok" : "bg-muted"}`} />
                    <span className="text-content">{s.name}</span>
                    <span className="tnum mr-auto text-[11px] text-muted" dir="ltr">
                      {s.url.replace(/^https?:\/\//, "")}
                    </span>
                  </Item>
                ))}
              </Command.Group>
            )}

            {cves.length > 0 && (
              <Command.Group heading="آسیب‌پذیری‌ها" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-muted">
                {cves.slice(0, 30).map((v) => (
                  <Item
                    key={v.link_id}
                    value={`cve ${v.title} ${v.cve_id || ""} ${v.plugin_slug || ""} ${v.site_name}`}
                    onSelect={() => run(() => navigate("/vulnerabilities"))}
                  >
                    <span className="h-2 w-2 rounded-full bg-bad" />
                    <span className="truncate text-content">{v.cve_id || v.title}</span>
                    <span className="mr-auto text-[11px] text-muted">{v.site_name}</span>
                  </Item>
                ))}
              </Command.Group>
            )}

            {verdicts.length > 0 && (
              <Command.Group heading="Fleet Learning" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-muted">
                {verdicts.slice(0, 20).map((v) => (
                  <Item
                    key={v.id}
                    value={`fleet ${v.plugin_slug} ${v.from_version} ${v.to_version} ${v.verdict}`}
                    onSelect={() => run(() => navigate("/"))}
                  >
                    <span className={`h-2 w-2 rounded-full ${v.verdict === "bad" ? "bg-bad" : "bg-warn"}`} />
                    <span className="text-content">{v.plugin_slug}</span>
                    <span className="tnum mr-auto text-[11px] text-muted" dir="ltr">
                      {v.from_version} → {v.to_version}
                    </span>
                  </Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

function Item({ value, onSelect, children }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-content-secondary aria-selected:bg-surface-hover aria-selected:text-content"
    >
      {children}
    </Command.Item>
  );
}
