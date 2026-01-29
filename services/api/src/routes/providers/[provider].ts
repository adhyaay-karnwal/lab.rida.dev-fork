import { opencode } from "../../opencode";
import type { RouteHandler } from "../../utils/route-handler";

const DELETE: RouteHandler = async (_request, params) => {
  const { provider } = params;

  await opencode.auth.remove({ providerID: provider });

  return new Response(null, { status: 204 });
};

export { DELETE };
