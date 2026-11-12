import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShellSidebarTrigger } from "./Shell";
import "./collection-layout.css";

export function CollectionLayout({
  title,
  tools,
  children,
}: {
  title: string;
  tools: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="collection-page">
      <header className="collection-header">
        <div className="collection-title">
          <ShellSidebarTrigger />
          <h1>{title}</h1>
        </div>
        <div className="collection-tools">{tools}</div>
      </header>
      <div className="collection-content">{children}</div>
    </main>
  );
}

export function CollectionSearch({
  label,
  placeholder = label,
  clearLabel,
  value,
  onChange,
}: {
  label: string;
  placeholder?: string;
  clearLabel: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="collection-search">
      <Search aria-hidden="true" />
      <Input
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={clearLabel}
          onClick={() => onChange("")}
        >
          <X />
        </Button>
      )}
    </div>
  );
}
