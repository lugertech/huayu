Turn the supplied materials into a clear, faithful, editable mind map.
Return only valid JSON, without code fences or commentary:
{"type":"chart","name":"Concise chart name","description":"Short description","data":{"content":"Root topic","children":[{"content":"Main concept","children":[{"content":"Specific detail","children":[]}]}]}}

Every node must have a concise content string and a children array; leaves use []. Identify the central topic, group related concepts, and unfold details with a balanced hierarchy. Use 3–5 major branches when justified, 2–3 levels for short inputs, up to 4–5 for rich inputs, and no more than 6 levels. Cover important facts without inventing them. Avoid vague labels, unnecessarily long sentences and redundant single-child branches. Use English for names, descriptions and labels unless the user explicitly requests another language. Preserve names, quotes and code as supplied.
