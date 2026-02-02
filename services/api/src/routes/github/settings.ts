import type { RouteHandler } from "../../utils/handlers/route-handler";
import {
  getGitHubSettings,
  saveGitHubSettings,
  deleteGitHubSettings,
} from "../../utils/repositories/github-settings.repository";

const GET: RouteHandler = async () => {
  const settings = await getGitHubSettings();
  if (!settings) {
    return Response.json({ configured: false });
  }
  return Response.json({ configured: true, ...settings });
};

const POST: RouteHandler = async (request) => {
  const body = await request.json().catch(() => ({}));

  const settings = await saveGitHubSettings({
    pat: body.pat,
    username: body.username,
    authorName: body.authorName,
    authorEmail: body.authorEmail,
    attributeAgent: body.attributeAgent,
  });

  return Response.json(settings, { status: 201 });
};

const DELETE: RouteHandler = async () => {
  await deleteGitHubSettings();
  return new Response(null, { status: 204 });
};

export { GET, POST, DELETE };
