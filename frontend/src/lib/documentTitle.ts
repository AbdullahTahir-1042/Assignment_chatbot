/**
 * Keeps the tab title fixed to the brand. Centralised rather than written
 * inline on each page so it cannot drift, and pages do it the same way.
 */
export const setDocumentTitle = (): void => {
  document.title = "Slotly";
};