import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight } from "@phosphor-icons/react";
import { useSiteI18n } from "../i18n";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { AppearanceSwitcher, useAppearance } from "./AppearanceSwitcher";
import { repositoryURL, sitePath } from "../config";

export function Logo() {
  const { path: link, t } = useSiteI18n();
  return (
    <a className="site-logo" href={link()}>
      <img
        className="logo-mark"
        src={sitePath("icon.svg")}
        alt=""
        width={32}
        height={32}
      />
      <span>{t("app.name")}</span>
    </a>
  );
}

export function Header({ docs = false }: { docs?: boolean }) {
  const { t, path: link } = useSiteI18n();
  const [open, setOpen] = useState(false);
  const appearance = useAppearance();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const panel = dialog.current;
    const menuTrigger = trigger.current;
    const previousOverflow = document.body.style.overflow;
    panel?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      panel?.close();
      document.body.style.overflow = previousOverflow;
      menuTrigger?.focus();
    };
  }, [open]);

  const links = (
    <>
      <a
        href={link("#workspace")}
        aria-current={!docs ? "page" : undefined}
        onClick={() => setOpen(false)}
      >
        {t("navigation.product")}
      </a>
      <a href={link("#templates")} onClick={() => setOpen(false)}>
        {t("navigation.templates")}
      </a>
      <a
        href={link("docs/getting-started/")}
        aria-current={docs ? "page" : undefined}
        onClick={() => setOpen(false)}
      >
        {t("navigation.docs")}
      </a>
      {repositoryURL && (
        <a
          href={repositoryURL}
          target="_blank"
          rel="noreferrer"
          onClick={() => setOpen(false)}
        >
          {t("navigation.source")}
          <ArrowUpRight size={16} />
        </a>
      )}
    </>
  );
  return (
    <header className="site-header">
      <div className="header-inner">
        <Logo />
        <nav className="desktop-nav" aria-label={t("navigation.main")}>
          {links}
        </nav>
        {!open && (
          <div className="header-tools">
            <LanguageSwitcher />
            <AppearanceSwitcher {...appearance} />
          </div>
        )}
        <a className="header-cta" href={link("docs/getting-started/")}>
          {t("docs.groups.gettingStarted")}
          <ArrowUpRight size={16} />
        </a>
        <button
          ref={trigger}
          className={`menu-toggle ${open ? "is-open" : ""}`}
          aria-label={t("navigation.openMenu")}
          aria-expanded={open}
          aria-controls="mobile-navigation"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          <span />
          <span />
        </button>
      </div>
      <dialog
        ref={dialog}
        id="mobile-navigation"
        className="mobile-menu"
        aria-label={t("navigation.main")}
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
      >
        <div className="mobile-menu-heading">
          <Logo />
          <button
            className="menu-toggle is-open"
            aria-label={t("navigation.closeMenu")}
            onClick={() => setOpen(false)}
          >
            <span />
            <span />
          </button>
        </div>
        <nav aria-label={t("navigation.main")}>{links}</nav>
        {open && (
          <div className="mobile-preferences">
            <LanguageSwitcher />
            <AppearanceSwitcher {...appearance} />
          </div>
        )}
        <a className="site-button primary" href={link("docs/getting-started/")}>
          {t("home.startUsingHuayu")}
          <ArrowRight size={18} />
        </a>
      </dialog>
    </header>
  );
}

export function Footer() {
  const { t, path: link } = useSiteI18n();
  return (
    <footer className="site-footer container">
      <div>
        <Logo />
        <p>{t("home.giveIdeasRoomToGrow")}</p>
      </div>
      <nav aria-label={t("home.footerNavigation")}>
        <a href={link("docs/getting-started/")}>
          {t("docs.groups.gettingStarted")}
        </a>
        <a href={link("docs/security/")}>{t("home.dataAndPrivacy")}</a>
        <a href={link("docs/licensing/")}>{t("docs.titles.licensing")}</a>
        <a href={link("docs/contributing/")}>{t("docs.titles.contributing")}</a>
      </nav>
      <span className="footer-note">{t("home.meta.title")}</span>
    </footer>
  );
}
