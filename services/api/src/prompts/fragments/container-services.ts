import type { PromptFragment, PromptContext } from "../types";
import { createFragment } from "../create-fragment";

function renderServiceRoutes(context: PromptContext): string | null {
  const { serviceRoutes } = context;
  if (serviceRoutes.length === 0) return null;

  const routes = serviceRoutes.map((routes) => `- Port ${routes.port}: ${routes.url}`).join("\n");
  return `Services running in the user's containers are exposed at:\n${routes}`;
}

export const containerServicesFragment: PromptFragment = createFragment({
  id: "container-services",
  name: "Container Service Routes",
  priority: 10,
  render: renderServiceRoutes,
  shouldInclude: (context) => context.serviceRoutes.length > 0,
});
