// Optional Google Sheets logging through a service account.
// Share the sheet with the service account's email (Editor) for this to work.
import { JWT } from "google-auth-library";

const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export function sheetsConfigured(): boolean {
  return !!(
    process.env.GOOGLE_SHEET_ID &&
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY
  );
}

let client: JWT | null = null;
function auth(): JWT {
  if (!client) {
    client = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      // Vercel env vars store newlines as literal "\n".
      key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      scopes: [SCOPE],
    });
  }
  return client;
}

const base = () =>
  `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(process.env.GOOGLE_SHEET_ID || "")}`;

export async function appendRows(tab: string, rows: (string | number)[][]): Promise<void> {
  if (!sheetsConfigured() || rows.length === 0) return;
  const range = encodeURIComponent(`${tab}!A1`);
  await auth().request({
    url: `${base()}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    method: "POST",
    data: { values: rows },
  });
}

export async function readRows(tab: string): Promise<string[][]> {
  if (!sheetsConfigured()) return [];
  const range = encodeURIComponent(`${tab}!A1:Z5000`);
  const res = await auth().request<{ values?: string[][] }>({ url: `${base()}/values/${range}` });
  return res.data.values || [];
}

export const TABS = {
  briefs: process.env.SHEET_TAB_BRIEFS || "Briefs",
  tracker: process.env.SHEET_TAB_TRACKER || "Tracker",
};
