"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NotificationBell } from "@/components/miz-rita/notification-bell";

const tabs = [
  { name: "Dashboard", href: "/dashboard/miz-rita", enabled: true },
  { name: "Kitchen", href: "/dashboard/miz-rita/kitchen", enabled: true },
  { name: "Orders", href: "/dashboard/miz-rita/orders", enabled: true },
  { name: "Customers", href: "/dashboard/miz-rita/customers", enabled: true },
  { name: "Menu", href: "/dashboard/miz-rita/menu", enabled: true },
  { name: "Deliveries", href: "/dashboard/miz-rita/deliveries", enabled: true },
  { name: "Payments", href: "/dashboard/miz-rita/payments", enabled: true },
  { name: "Inventory", href: "/dashboard/miz-rita/inventory", enabled: true },
  { name: "Calendar", href: "/dashboard/miz-rita/calendar", enabled: true },
  { name: "Notifications", href: "/dashboard/miz-rita/notifications", enabled: true },
  { name: "Reports", href: "/dashboard/miz-rita/reports", enabled: true },
];

export default function MizRitaLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="lg:ml-64 border-b bg-white shadow-sm">
        <div className="px-6 py-5">
          <div className="flex items-center justify-between gap-4"><h1 className="text-2xl font-bold text-slate-800">Miz Rita HQ</h1><NotificationBell /></div>

          <div className="mt-5 flex flex-wrap gap-2">
            {tabs.map((tab) => {
              if (!tab.enabled) {
                return (
                  <button
                    key={tab.name}
                    disabled
                    className="rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-400"
                  >
                    {tab.name}
                  </button>
                );
              }

              const active =
                pathname === tab.href ||
                (tab.href !== "/dashboard/miz-rita" &&
                  pathname.startsWith(tab.href));

              return (
                <Link
                  key={tab.name}
                  href={tab.href}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    active
                      ? "bg-blue-600 text-white"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {tab.name}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <div>{children}</div>
    </div>
  );
}
