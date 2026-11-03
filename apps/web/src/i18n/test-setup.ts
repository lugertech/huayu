import { beforeEach } from "vite-plus/test";
import { setLanguage } from "./index";

// Existing fixtures have Chinese system labels. Each test opts into other locales explicitly.
beforeEach(() => setLanguage("zh-CN"));
