import {
  connectionRequestKey,
  newLanguageConnection,
  updateConnection,
  type LanguageConnection,
} from "@/ai/model-config";

export function catalogConnections(
  language: readonly LanguageConnection[],
  connection: LanguageConnection,
): LanguageConnection[] {
  const service = connectionRequestKey({ ...connection, model: "" });
  return language.filter(
    (entry) => connectionRequestKey({ ...entry, model: "" }) === service,
  );
}

export function applyModelCatalog(
  language: readonly LanguageConnection[],
  connection: LanguageConnection,
  availableModels: readonly string[],
  selection: ReadonlySet<string>,
) {
  const available = new Set(availableModels);
  const peers = new Set(catalogConnections(language, connection));
  const emptyEntry = !connection.model.trim();
  const retained = language.filter((entry) => {
    if (!peers.has(entry)) return true;
    if (emptyEntry && entry === connection) return false;
    const id = entry.model.trim();
    return !available.has(id) || selection.has(id);
  });
  const configured = new Set(
    retained
      .filter((entry) => peers.has(entry))
      .map(({ model }) => model.trim()),
  );
  const added = availableModels
    .filter((model) => selection.has(model) && !configured.has(model))
    .map((model, index) =>
      emptyEntry && index === 0
        ? updateConnection(connection, { model })
        : {
            ...newLanguageConnection(),
            baseUrl: connection.baseUrl,
            apiKey: connection.apiKey,
            protocol: connection.protocol,
            model,
          },
    );
  const next = [...retained, ...added];
  const current = next.find(({ id }) => id === connection.id);

  return {
    language: next,
    editedId:
      (current && selection.has(current.model.trim())
        ? current.id
        : undefined) ??
      added[0]?.id ??
      retained.find(
        (entry) => peers.has(entry) && selection.has(entry.model.trim()),
      )?.id ??
      current?.id ??
      null,
  };
}
