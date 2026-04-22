import { google } from "googleapis";
import { DEFAULT_FOLDERS, FolderName } from "./drive-constants";

export { DEFAULT_FOLDERS };
export type { FolderName };

// ─── Auth ─────────────────────────────────────────────────────────────────────

function getDriveClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key   = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!email || !key) throw new Error("Google Drive credentials not configured");

  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key: key },
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  return google.drive({ version: "v3", auth });
}

/**
 * OAuth-based Drive client. Uses the user's personal refresh token so that
 * files created by the server are owned by the user (not the service account).
 * This is what the plan-master-agent regenerate loop uses to sync v{N+1} into
 * the same `CH OS / Plan / ...` folder hierarchy that v1 lives in.
 *
 * Env vars:
 *   DRIVE_OAUTH_CLIENT_ID      — Google Cloud OAuth 2.0 Client ID
 *   DRIVE_OAUTH_CLIENT_SECRET  — matching secret
 *   DRIVE_OAUTH_REFRESH_TOKEN  — refresh token obtained via one-time OAuth dance
 *                                with scope https://www.googleapis.com/auth/drive
 *
 * Returns null if env vars are not configured — callers should handle
 * gracefully (skip Drive sync, keep content in DB only).
 */
export function getDriveClientOAuth() {
  const clientId     = process.env.DRIVE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.DRIVE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.DRIVE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: "v3", auth });
}

/**
 * Upload a plain-text document into a specific Drive folder (identified by
 * folderId, typically the `drive_folder_id` stored on objective_artifacts).
 * Drive auto-converts text/plain to a native Google Doc, so the result is
 * editable in-browser.
 *
 * Returns { fileId, webViewLink } on success, or null if the OAuth client
 * is not configured. Throws on actual Drive API errors.
 */
export async function uploadTextToDriveFolder(
  folderId: string,
  title: string,
  content: string
): Promise<{ fileId: string; webViewLink: string } | null> {
  const drive = getDriveClientOAuth();
  if (!drive) return null;

  const { Readable } = await import("stream");
  const stream = Readable.from(Buffer.from(content, "utf-8"));

  const res = await drive.files.create({
    requestBody: {
      name: title,
      parents: [folderId],
      mimeType: "application/vnd.google-apps.document",
    },
    media: {
      mimeType: "text/plain",
      body: stream,
    },
    fields: "id, webViewLink",
  });

  const fileId = res.data.id;
  if (!fileId) throw new Error("Drive upload returned no fileId");

  return {
    fileId,
    webViewLink:
      res.data.webViewLink ?? `https://docs.google.com/document/d/${fileId}/edit`,
  };
}

// ─── Folder structure ─────────────────────────────────────────────────────────


// ─── Create project folder structure ─────────────────────────────────────────

/**
 * Creates the full folder structure for a new project in Drive.
 * Returns the root folder ID — save this in clients.ts as driveFolderId.
 */
export async function createProjectFolders(
  projectName: string
): Promise<{ rootFolderId: string; subfolders: Record<string, string> }> {
  const drive = getDriveClient();
  const rootParentId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!rootParentId) throw new Error("GOOGLE_DRIVE_ROOT_FOLDER_ID not set");

  // Create root project folder
  const root = await drive.files.create({
    requestBody: {
      name: projectName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [rootParentId],
    },
    fields: "id",
  });
  const rootFolderId = root.data.id!;

  // Create subfolders in parallel
  const subfolders: Record<string, string> = {};
  await Promise.all(
    DEFAULT_FOLDERS.map(async (f) => {
      const res = await drive.files.create({
        requestBody: {
          name: f.name,
          mimeType: "application/vnd.google-apps.folder",
          parents: [rootFolderId],
        },
        fields: "id",
      });
      subfolders[f.name] = res.data.id!;
    })
  );

  // Make root folder accessible to anyone with link (viewer)
  await drive.permissions.create({
    fileId: rootFolderId,
    requestBody: { role: "reader", type: "anyone" },
  });

  return { rootFolderId, subfolders };
}

// ─── Get subfolder ID by name ─────────────────────────────────────────────────

async function getSubfolderId(
  rootFolderId: string,
  folderName: string
): Promise<string | null> {
  const drive = getDriveClient();
  const res = await drive.files.list({
    q: `'${rootFolderId}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name)",
  });
  return res.data.files?.[0]?.id ?? null;
}

// ─── Upload file ──────────────────────────────────────────────────────────────

export type UploadResult = {
  fileId: string;
  fileName: string;
  webViewLink: string;
  folder: string;
};

export async function uploadFileToDrive(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  rootFolderId: string,
  folderName: FolderName
): Promise<UploadResult> {
  const drive = getDriveClient();

  // Find the subfolder
  let folderId = await getSubfolderId(rootFolderId, folderName);

  // If subfolder doesn't exist yet, create it
  if (!folderId) {
    const res = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [rootFolderId],
      },
      fields: "id",
    });
    folderId = res.data.id!;
  }

  // Upload file
  const { Readable } = await import("stream");
  const stream = Readable.from(fileBuffer);

  const uploaded = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: { mimeType, body: stream },
    fields: "id, name, webViewLink",
  });

  const fileId = uploaded.data.id!;

  // Make file publicly viewable
  await drive.permissions.create({
    fileId,
    requestBody: { role: "reader", type: "anyone" },
  });

  // Get the public link
  const file = await drive.files.get({
    fileId,
    fields: "webViewLink",
  });

  return {
    fileId,
    fileName,
    webViewLink: file.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`,
    folder: folderName,
  };
}

// ─── List files in project folders ───────────────────────────────────────────

export type DriveFile = {
  id: string;
  name: string;
  folder: string;
  webViewLink: string;
  mimeType: string;
  modifiedTime: string | null;
};

export async function listProjectFiles(rootFolderId: string): Promise<DriveFile[]> {
  const drive = getDriveClient();

  // Get all subfolders
  const foldersRes = await drive.files.list({
    q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name)",
  });

  const folders = foldersRes.data.files ?? [];

  // Get files from each subfolder in parallel
  const filesByFolder = await Promise.all(
    folders.map(async (folder) => {
      const filesRes = await drive.files.list({
        q: `'${folder.id}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
        fields: "files(id, name, webViewLink, mimeType, modifiedTime)",
        orderBy: "modifiedTime desc",
      });
      return (filesRes.data.files ?? []).map((f) => ({
        id: f.id!,
        name: f.name!,
        folder: folder.name!,
        webViewLink: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`,
        mimeType: f.mimeType ?? "",
        modifiedTime: f.modifiedTime ?? null,
      }));
    })
  );

  return filesByFolder.flat();
}
