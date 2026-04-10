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
