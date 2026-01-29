import { opencode } from "../opencode";
import type { RouteHandler } from "../utils/route-handler";

const GET: RouteHandler = async () => {
  const { data } = await opencode.provider.list();
  return Response.json(data);
};

const POST: RouteHandler = async (request) => {
  const body = await request.json();

  if (!body.provider || typeof body.provider !== "string") {
    return Response.json({ error: "provider is required" }, { status: 400 });
  }

  if (!body.apiKey || typeof body.apiKey !== "string") {
    return Response.json({ error: "apiKey is required" }, { status: 400 });
  }

  await opencode.auth.set({
    providerID: body.provider,
    auth: {
      type: "api",
      key: body.apiKey,
    },
  });

  return Response.json({ provider: body.provider }, { status: 201 });
};

export { GET, POST };
