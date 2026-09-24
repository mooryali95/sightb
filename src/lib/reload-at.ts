/**
 * Loads the app afresh at `path`, replacing the current history entry.
 *
 * For leaving a session: a full load drops everything held in memory (the
 * store keeps the last user's companies, projects and money until the page
 * reloads), and no in-app redirect can race it. A module of its own so tests
 * can observe it; jsdom cannot perform a real navigation.
 */
export function reloadAt(path: string): void {
  window.location.replace(path);
}
