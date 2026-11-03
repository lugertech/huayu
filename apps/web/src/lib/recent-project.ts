const LAST_PROJECT_KEY = "huayu:last-project";

export function lastOpenedProject() {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY);
  } catch {
    return null;
  }
}

export function rememberOpenedProject(id: string) {
  try {
    localStorage.setItem(LAST_PROJECT_KEY, id);
  } catch {
    // Opening a project remains possible without browser storage.
  }
}
