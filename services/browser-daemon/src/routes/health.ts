import type { RouteHandler } from "../utils/route-handler";

export const GET: RouteHandler = () => {
  return Response.json({ status: "ok" });
};

export const HEAD: RouteHandler = () => {
  return new Response(null, { status: 200 });
};
